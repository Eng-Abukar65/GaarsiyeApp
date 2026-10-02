import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../utils/api_service.dart';
import '../utils/app_navigator.dart';
import 'driver_offers_service.dart';
import '../../features/drivers/presentation/widgets/delivery_offer_sheet.dart';

class DriverPresenceService with WidgetsBindingObserver {
  DriverPresenceService._();

  static final DriverPresenceService instance = DriverPresenceService._();

  Timer? _heartbeatTimer;
  io.Socket? _socket;
  bool _isStarted = false;
  bool _isSendingHeartbeat = false;
  bool _isConnectingSocket = false;
  bool _observerRegistered = false;

  bool get isActive => _isStarted;

  Future<void> startIfDriver() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final role = prefs.getString('user_role');
    if (token == null || token.isEmpty || role != 'driver') {
      return;
    }

    await start();
  }

  Future<void> start() async {
    if (_isStarted) {
      await _sendHeartbeat();
      return;
    }

    _isStarted = true;
    _registerObserver();
    unawaited(_connectSocket());
    unawaited(checkPendingOffers());
    await _sendHeartbeat();
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _sendHeartbeat(),
    );
  }

  Future<void> setOnline(bool online) async {
    if (online) {
      await start();
      return;
    }

    await stop(markOffline: true);
  }

  Future<void> stop({bool markOffline = true}) async {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _isStarted = false;

    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnectingSocket = false;

    if (markOffline) {
      try {
        await ApiService.post('/driver/logout', {});
      } catch (e) {
        debugPrint('Driver logout presence update skipped: $e');
      }
    }
  }

  void _registerObserver() {
    if (_observerRegistered) return;
    WidgetsBinding.instance.addObserver(this);
    _observerRegistered = true;
  }

  Future<void> _connectSocket() async {
    if (_socket?.connected == true || _isConnectingSocket) return;
    _isConnectingSocket = true;

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null || token.isEmpty) {
      _isConnectingSocket = false;
      return;
    }

    final socketUrl = ApiService.baseUrl.replaceFirst('/api', '');
    _socket?.dispose();
    late final io.Socket socket;
    socket = io.io(
      socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );
    _socket = socket;

    socket
      ..onConnect((_) {
        if (!identical(_socket, socket)) return;
        _isConnectingSocket = false;
        debugPrint('Driver socket connected.');
        socket.emit('heartbeat');
      })
      ..onDisconnect((_) {
        if (identical(_socket, socket)) {
          _isConnectingSocket = false;
        }
        debugPrint('Driver socket disconnected.');
      })
      ..onConnectError((error) {
        if (identical(_socket, socket)) {
          _isConnectingSocket = false;
        }
        debugPrint('Driver socket error: $error');
      })
      ..on('force-logout', (_) {
        // Ignore a delayed event from a socket already replaced locally.
        if (identical(_socket, socket)) {
          unawaited(_handleForcedLogout());
        }
      })
      // A vendor/admin assigned this driver a delivery → refresh the persistent
      // assignment cards + bell badge, and surface the request immediately.
      ..on('delivery-offer', (data) {
        if (!identical(_socket, socket)) return;
        unawaited(DriverOffersService.instance.refresh());
        _presentOffer(data);
      })
      ..connect();
  }

  // Track offers we've already shown so a re-emit or a pending-list refresh
  // doesn't pop the same request twice.
  final Set<String> _shownOfferIds = <String>{};
  bool _offerVisible = false;

  void _presentOffer(dynamic data) {
    Map<String, dynamic>? offer;
    if (data is Map) {
      offer = Map<String, dynamic>.from(data);
    } else if (data is String) {
      try {
        final decoded = jsonDecode(data);
        if (decoded is Map) offer = Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    if (offer == null) return;

    final id = (offer['offer_id'] ?? offer['id'])?.toString();
    if (id == null || _shownOfferIds.contains(id)) return;
    if (_offerVisible) return; // one request at a time

    final ctx = rootContext;
    if (ctx == null) return;

    _shownOfferIds.add(id);
    _offerVisible = true;
    DeliveryOfferSheet.show(ctx, offer).then((result) {
      _offerVisible = false;
      // Keep the persistent cards + badge in sync with whatever happened.
      unawaited(DriverOffersService.instance.refresh());
      final after = rootContext;
      if (after != null) handleOfferResult(after, result);
    });
  }

  /// Catch-up: if a push arrived while the app was closed, surface any offers
  /// still pending the moment the driver is active again.
  Future<void> checkPendingOffers() async {
    try {
      final res = await ApiService.get('/driver/offers/pending');
      if (res.statusCode != 200) return;
      final data = jsonDecode(res.body);
      final list = (data is Map && data['success'] == true)
          ? (data['data'] ?? data['offers'])
          : (data is List ? data : null);
      if (list is List && list.isNotEmpty) {
        _presentOffer(list.first);
      }
    } catch (_) {
      // best-effort
    }
  }

  Future<void> _sendHeartbeat() async {
    if (!_isStarted || _isSendingHeartbeat) return;
    _isSendingHeartbeat = true;

    try {
      final response = await ApiService.post('/driver/heartbeat', {});
      if (response.statusCode == 401 || response.statusCode == 403) {
        await _handleExpiredSession();
        return;
      }

      if (_socket?.connected == true) {
        _socket?.emit('heartbeat');
      } else {
        await _connectSocket();
      }
    } catch (e) {
      debugPrint('Driver heartbeat failed: $e');
    } finally {
      _isSendingHeartbeat = false;
    }
  }

  Future<void> _handleExpiredSession() async {
    await stop(markOffline: false);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('user_role');
    await prefs.remove('user_data');
  }

  Future<void> _handleForcedLogout() async {
    await _handleExpiredSession();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(startIfDriver());
      unawaited(checkPendingOffers());
      return;
    }

    // On Flutter Web, changing focus to the Vendor browser window can emit
    // inactive/hidden even though the Driver App is still open. Keep sending
    // heartbeats; closing the tab stops JavaScript and the backend expires the
    // driver after two minutes. Native mobile apps stop when backgrounded.
    if (kIsWeb) {
      if (state == AppLifecycleState.detached) {
        unawaited(stop(markOffline: false));
      }
      return;
    }

    if (state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      // Do not claim a clean logout when the OS suspends/kills the app. Stopping
      // heartbeats lets the backend's two-minute timeout determine offline state.
      unawaited(stop(markOffline: false));
    }
  }
}
