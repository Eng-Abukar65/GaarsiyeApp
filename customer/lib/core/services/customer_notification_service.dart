import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../features/customers/presentation/models/notification_model.dart';
import '../utils/api_service.dart';

@pragma('vm:entry-point')
Future<void> customerFirebaseMessagingBackgroundHandler(
  RemoteMessage message,
) async {
  await CustomerNotificationService.ensureFirebaseInitialized();
}

class CustomerNotificationService extends ChangeNotifier {
  CustomerNotificationService();

  final List<NotificationModel> _notifications = [];
  io.Socket? _socket;
  StreamSubscription<String>? _tokenRefreshSubscription;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;

  bool _isLoading = false;
  bool _started = false;
  int _unreadCount = 0;

  static bool _firebaseInitAttempted = false;
  static bool _firebaseReady = false;

  List<NotificationModel> get notifications =>
      List.unmodifiable(_notifications);
  bool get isLoading => _isLoading;
  int get unreadCount => _unreadCount;

  Future<void> start({bool refreshList = false}) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final role = prefs.getString('user_role');
    if (token == null || token.isEmpty || role != 'customer') {
      return;
    }

    if (_started) {
      if (refreshList) {
        await refresh();
      } else {
        await refreshUnreadCount();
      }
      return;
    }

    _started = true;
    unawaited(refreshUnreadCount());
    if (refreshList) {
      unawaited(refresh());
    }
    _connectSocket(token);
    unawaited(_initializePushNotifications());
  }

  Future<void> refresh() async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await ApiService.get('/customer/notifications');
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final rawNotifications = decoded is Map
            ? decoded['notifications']
            : decoded;
        final parsed = rawNotifications is List
            ? rawNotifications
                  .whereType<Map>()
                  .map(
                    (item) => NotificationModel.fromJson(
                      Map<String, dynamic>.from(item),
                    ),
                  )
                  .toList()
            : <NotificationModel>[];

        parsed.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        _notifications
          ..clear()
          ..addAll(parsed);
        _unreadCount = parsed
            .where((notification) => !notification.isRead)
            .length;
      }
    } catch (e) {
      debugPrint('Notification refresh failed: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshUnreadCount() async {
    try {
      final response = await ApiService.get(
        '/customer/notifications/unread-count',
      );
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final raw = decoded is Map ? decoded['unread_count'] : null;
        _unreadCount = raw is int
            ? raw
            : int.tryParse(raw?.toString() ?? '') ?? 0;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Unread notification count failed: $e');
    }
  }

  Future<void> markAsRead(int id) async {
    final index = _notifications.indexWhere((item) => item.id == id);
    final wasUnread = index >= 0 && !_notifications[index].isRead;
    if (index >= 0) {
      _notifications[index] = _notifications[index].copyWith(isRead: true);
      if (wasUnread && _unreadCount > 0) _unreadCount--;
      notifyListeners();
    }

    try {
      final response = await ApiService.patch(
        '/customer/notifications/$id/read',
        {},
      );
      if (response.statusCode != 200) {
        await refresh();
      }
    } catch (e) {
      debugPrint('Mark notification read failed: $e');
      await refresh();
    }
  }

  Future<void> markAllAsRead() async {
    final hadUnread = _unreadCount > 0;
    for (var i = 0; i < _notifications.length; i++) {
      _notifications[i] = _notifications[i].copyWith(isRead: true);
    }
    _unreadCount = 0;
    if (hadUnread) notifyListeners();

    try {
      final response = await ApiService.patch(
        '/customer/notifications/read-all',
        {},
      );
      if (response.statusCode != 200) {
        await refresh();
      }
    } catch (e) {
      debugPrint('Mark all notifications read failed: $e');
      await refresh();
    }
  }

  void reset() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _started = false;
    _notifications.clear();
    _unreadCount = 0;
    notifyListeners();
  }

  void _connectSocket(String token) {
    final socketUrl = ApiService.baseUrl.replaceFirst('/api', '');
    _socket?.dispose();
    _socket = io.io(
      socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableForceNew()
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );

    _socket!
      ..onConnect((_) => debugPrint('Notification socket connected'))
      ..on('notification-created', _handleSocketNotification)
      ..on('car-wash-booking-updated', _handleCarWashBookingUpdate)
      ..on('car-wash-booking-status-updated', _handleCarWashBookingUpdate)
      ..onDisconnect((_) => debugPrint('Notification socket disconnected'))
      ..onConnectError(
        (error) => debugPrint('Notification socket error: $error'),
      )
      ..connect();
  }

  void _handleSocketNotification(dynamic data) {
    try {
      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : jsonDecode(data.toString()) as Map<String, dynamic>;
      final notification = NotificationModel.fromJson(map);
      if (_notifications.any((item) => item.id == notification.id)) {
        return;
      }

      _notifications.insert(0, notification);
      if (!notification.isRead) _unreadCount++;
      notifyListeners();
    } catch (e) {
      debugPrint('Could not parse socket notification: $e');
      unawaited(refresh());
    }
  }

  void _handleCarWashBookingUpdate(dynamic _) {
    // Wake any open booking/list screens immediately, then reconcile the
    // Alerts list with the source of truth. Screens also retain safe polling.
    notifyListeners();
    unawaited(refresh());
  }

  Future<void> _initializePushNotifications() async {
    final firebaseReady = await ensureFirebaseInitialized();
    if (!firebaseReady) return;

    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      final webVapidKey = const String.fromEnvironment(
        'FIREBASE_WEB_VAPID_KEY',
      );
      final token = await messaging.getToken(
        vapidKey: kIsWeb && webVapidKey.isNotEmpty ? webVapidKey : null,
      );
      if (token != null && token.isNotEmpty) {
        await ApiService.post('/customer/notifications/token', {
          'fcm_token': token,
        });
      }

      await _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = messaging.onTokenRefresh.listen((newToken) {
        unawaited(
          ApiService.post('/customer/notifications/token', {
            'fcm_token': newToken,
          }),
        );
      });

      await _foregroundSubscription?.cancel();
      _foregroundSubscription = FirebaseMessaging.onMessage.listen((message) {
        unawaited(refresh());
      });

      await _openedSubscription?.cancel();
      _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((
        message,
      ) {
        unawaited(refresh());
      });
    } catch (e) {
      debugPrint('Firebase Messaging setup skipped: $e');
    }
  }

  static Future<bool> ensureFirebaseInitialized() async {
    if (_firebaseReady) return true;
    if (_firebaseInitAttempted) return _firebaseReady;

    _firebaseInitAttempted = true;
    try {
      if (Firebase.apps.isEmpty) {
        const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
        const appId = String.fromEnvironment('FIREBASE_APP_ID');
        const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
        const messagingSenderId = String.fromEnvironment(
          'FIREBASE_MESSAGING_SENDER_ID',
        );

        if (apiKey.isNotEmpty &&
            appId.isNotEmpty &&
            projectId.isNotEmpty &&
            messagingSenderId.isNotEmpty) {
          await Firebase.initializeApp(
            options: FirebaseOptions(
              apiKey: apiKey,
              appId: appId,
              messagingSenderId: messagingSenderId,
              projectId: projectId,
            ),
          );
        } else {
          await Firebase.initializeApp();
        }
      }
      _firebaseReady = true;
    } catch (e) {
      debugPrint('Firebase initialization skipped: $e');
      _firebaseReady = false;
    }
    return _firebaseReady;
  }

  @override
  void dispose() {
    _socket?.dispose();
    _tokenRefreshSubscription?.cancel();
    _foregroundSubscription?.cancel();
    _openedSubscription?.cancel();
    super.dispose();
  }
}
