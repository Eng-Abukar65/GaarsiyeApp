import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter/services.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/constants/map_tile_config.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/utils/api_service.dart';

class LiveDriverTrackingScreen extends StatefulWidget {
  const LiveDriverTrackingScreen({super.key});

  @override
  State<LiveDriverTrackingScreen> createState() =>
      _LiveDriverTrackingScreenState();
}

class _LiveDriverTrackingScreenState extends State<LiveDriverTrackingScreen>
    with WidgetsBindingObserver {
  static const MethodChannel _phoneChannel = MethodChannel('deliveryapp/phone');
  final MapController _mapController = MapController();
  final Distance _distance = const Distance();

  Map<String, dynamic>? _trackingData;
  Timer? _refreshTimer;
  Timer? _driverAnimationTimer;
  Timer? _messageTimer;
  io.Socket? _socket;

  bool _isLoading = true;
  bool _isOffline = false;
  bool _isRestoredMessage = false;
  bool _hasCenteredMap = false;
  String? _trackingMessage = 'Connecting to live tracking...';

  LatLng? _driverPosition;
  LatLng? _customerPosition;
  LatLng? _vendorPosition;
  LatLng? _lastRouteDriverPosition;
  double _driverHeading = 0;
  double? _routeDistanceMeters;
  double? _routeDurationSeconds;
  int _routeRequestId = 0;
  List<LatLng> _routePoints = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_trackingData != null) return;

    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map) {
      _trackingData = Map<String, dynamic>.from(args);
      _startTracking();
      return;
    }

    setState(() {
      _isLoading = false;
      _trackingMessage = 'Waiting for driver location...';
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refreshTimer?.cancel();
    _driverAnimationTimer?.cancel();
    _messageTimer?.cancel();
    _socket?.disconnect();
    _socket?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _fetchUpdate(silent: true);
      _connectSocket();
    }
  }

  void _startTracking() {
    _applyTrackingData(_trackingData ?? {}, animateDriver: false);
    _fetchUpdate();
    _connectSocket();
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _fetchUpdate(silent: true),
    );
  }

  int? get _deliveryId {
    final explicitDeliveryId = _readInt(_trackingData, const ['delivery_id']);
    if (explicitDeliveryId != null) return explicitDeliveryId;
    if (_trackingData?.containsKey('order_id') == true) return null;
    return _readInt(_trackingData, const ['id']);
  }

  int? get _orderId {
    final explicitOrderId = _readInt(_trackingData, const ['order_id']);
    if (explicitOrderId != null) return explicitOrderId;
    if (_trackingData?.containsKey('delivery_id') == true) return null;
    return _readInt(_trackingData, const ['id']);
  }

  Future<void> _fetchUpdate({bool silent = false}) async {
    final deliveryId = _deliveryId;
    final orderId = _orderId;
    if (deliveryId == null && orderId == null) {
      setState(() {
        _isLoading = false;
        _trackingMessage = 'Waiting for driver location...';
      });
      return;
    }

    try {
      final endpoint = deliveryId != null
          ? '/customer/deliveries/$deliveryId/tracking'
          : '/customer/orders/$orderId/tracking';
      final response = await ApiService.get(endpoint);
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (decoded is Map && mounted) {
          _applyTrackingData(
            Map<String, dynamic>.from(decoded),
            animateDriver: !silent,
          );
          _joinDeliveryRoom();
        }
      } else if (mounted && !silent) {
        setState(() => _isOffline = true);
        _showTrackingMessage('Connecting to live tracking...');
      }
    } catch (e) {
      debugPrint('Tracking update error: $e');
      if (mounted && !silent) {
        setState(() => _isOffline = true);
        _showTrackingMessage('Connecting to live tracking...');
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _connectSocket() async {
    final deliveryId = _deliveryId;
    if (deliveryId == null) return;

    if (_socket?.connected == true) {
      _joinDeliveryRoom();
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    if (token == null || token.isEmpty) return;

    _showTrackingMessage('Connecting to live tracking...');
    await ApiService.checkConnection();
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
          .setReconnectionAttempts(999999)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .build(),
    );

    _socket!
      ..onConnect((_) {
        if (!mounted) return;
        setState(() => _isOffline = false);
        _joinDeliveryRoom();
        _fetchUpdate(silent: true);
        _showTrackingMessage(
          'Live tracking restored',
          restored: true,
          autoClear: const Duration(seconds: 3),
        );
      })
      ..onReconnect((_) {
        _joinDeliveryRoom();
        _fetchUpdate(silent: true);
        _showTrackingMessage(
          'Live tracking restored',
          restored: true,
          autoClear: const Duration(seconds: 3),
        );
      })
      ..onDisconnect((_) {
        if (!mounted) return;
        setState(() => _isOffline = true);
        _showTrackingMessage('Connecting to live tracking...');
      })
      ..onConnectError((error) {
        debugPrint('Live tracking socket error: $error');
        if (!mounted) return;
        setState(() => _isOffline = true);
        _showTrackingMessage('Connecting to live tracking...');
      })
      ..on('driver-location-updated', _handleDriverLocationUpdated)
      ..on('driver-location-update', _handleDriverLocationUpdated)
      ..on('delivery-status-updated', _handleDeliveryStatusUpdated)
      ..connect();
  }

  void _joinDeliveryRoom() {
    final deliveryId = _deliveryId;
    if (deliveryId == null || _socket?.connected != true) return;
    _socket?.emit('join-delivery-room', deliveryId);
  }

  void _handleDriverLocationUpdated(dynamic payload) {
    final data = _asStringKeyMap(payload);
    if (data == null) return;

    final eventDeliveryId = _readInt(data, const ['delivery_id']);
    if (eventDeliveryId != null &&
        _deliveryId != null &&
        eventDeliveryId != _deliveryId) {
      return;
    }

    final latitude = _readDouble(data, const [
      'latitude',
      'driver_lat',
      'driver_latitude',
    ]);
    final longitude = _readDouble(data, const [
      'longitude',
      'driver_lng',
      'driver_longitude',
    ]);
    if (latitude == null || longitude == null) {
      _showTrackingMessage('Waiting for driver location...');
      return;
    }

    final nextPosition = LatLng(latitude, longitude);
    final nextHeading =
        _readDouble(data, const ['heading', 'driver_heading']) ??
        _driverHeading;
    final status = data['status']?.toString();

    setState(() {
      _trackingData = {
        ...?_trackingData,
        'driver_lat': latitude,
        'driver_lng': longitude,
        'driver_heading': nextHeading,
        if (status != null && status.isNotEmpty) 'status': status,
      };
      _driverHeading = nextHeading;
      _isOffline = false;
      _trackingMessage = null;
      _isRestoredMessage = false;
    });

    _animateDriverTo(nextPosition, nextHeading);
    _refreshRouteIfNeeded(nextPosition);
  }

  void _handleDeliveryStatusUpdated(dynamic payload) {
    final data = _asStringKeyMap(payload);
    if (data == null) return;

    final eventDeliveryId = _readInt(data, const ['delivery_id']);
    if (eventDeliveryId != null &&
        _deliveryId != null &&
        eventDeliveryId != _deliveryId) {
      return;
    }

    final status = data['status']?.toString();
    if (status == null || status.isEmpty || !mounted) return;

    setState(() {
      _trackingData = {
        ...?_trackingData,
        'status': status,
        'delivery_status': status,
      };
    });
    unawaited(_fetchUpdate(silent: true));
  }

  String? get _driverPhone {
    final value = _trackingData?['driver_phone']?.toString().trim() ?? '';
    return value.isEmpty ? null : value;
  }

  Future<void> _openDriverDialer() async {
    final phone = _driverPhone;
    if (phone == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Driver phone number is not available yet.'),
        ),
      );
      return;
    }

    try {
      await _phoneChannel.invokeMethod<void>('openDialer', {'phone': phone});
    } on PlatformException catch (error) {
      debugPrint('Unable to open driver dialer: ${error.message}');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to open the phone app.')),
      );
    }
  }

  void _applyTrackingData(
    Map<String, dynamic> data, {
    required bool animateDriver,
  }) {
    final previousDriver = _driverPosition;
    final nextDriver = _latLngFrom(
      data,
      const ['driver_lat', 'driver_latitude', 'latitude'],
      const ['driver_lng', 'driver_longitude', 'longitude'],
    );
    final nextCustomer = _latLngFrom(
      data,
      const ['dest_lat', 'customer_latitude'],
      const ['dest_lng', 'customer_longitude'],
    );
    final nextVendor = _latLngFrom(
      data,
      const ['vendor_lat', 'vendor_latitude'],
      const ['vendor_lng', 'vendor_longitude'],
    );
    final nextHeading =
        _readDouble(data, const ['driver_heading', 'heading']) ??
        _driverHeading;

    setState(() {
      _trackingData = data;
      _customerPosition = nextCustomer;
      _vendorPosition = nextVendor;
      _driverHeading = nextHeading;
      _isLoading = false;
      _isOffline = false;
      if (!animateDriver || previousDriver == null || nextDriver == null) {
        _driverPosition = nextDriver;
      }
    });

    if (nextDriver == null) {
      _showTrackingMessage('Waiting for driver location...');
      return;
    }

    if (animateDriver && previousDriver != null) {
      _animateDriverTo(nextDriver, nextHeading);
    }
    _refreshRouteIfNeeded(nextDriver, force: _routePoints.isEmpty);
    _centerMapIfNeeded();
    _connectSocket();
  }

  void _animateDriverTo(LatLng target, double heading) {
    final start = _driverPosition;
    _driverAnimationTimer?.cancel();

    if (start == null) {
      setState(() {
        _driverPosition = target;
        _driverHeading = heading;
      });
      _centerMapIfNeeded();
      return;
    }

    final stopwatch = Stopwatch()..start();
    const duration = Duration(milliseconds: 850);
    _driverAnimationTimer = Timer.periodic(const Duration(milliseconds: 33), (
      timer,
    ) {
      final progress = (stopwatch.elapsedMilliseconds / duration.inMilliseconds)
          .clamp(0.0, 1.0);
      final eased = Curves.easeInOut.transform(progress);
      final lat = start.latitude + (target.latitude - start.latitude) * eased;
      final lng =
          start.longitude + (target.longitude - start.longitude) * eased;

      if (mounted) {
        setState(() {
          _driverPosition = LatLng(lat, lng);
          _driverHeading = heading;
        });
      }

      if (progress >= 1) {
        timer.cancel();
        stopwatch.stop();
        if (mounted) {
          setState(() => _driverPosition = target);
        }
      }
    });
  }

  Future<void> _refreshRouteIfNeeded(
    LatLng driver, {
    bool force = false,
  }) async {
    final customer = _customerPosition;
    if (customer == null) return;

    if (!force && _lastRouteDriverPosition != null) {
      final movedMeters = _distance.as(
        LengthUnit.Meter,
        _lastRouteDriverPosition!,
        driver,
      );
      if (movedMeters < 50) return;
    }

    _lastRouteDriverPosition = driver;
    final requestId = ++_routeRequestId;

    try {
      final uri = Uri.parse(
        'https://router.project-osrm.org/route/v1/driving/'
        '${driver.longitude},${driver.latitude};${customer.longitude},${customer.latitude}'
        '?overview=full&geometries=geojson',
      );
      final response = await http.get(uri).timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) {
        throw Exception('OSRM route failed with ${response.statusCode}');
      }

      final body = jsonDecode(response.body);
      final routes = body['routes'];
      if (routes is! List || routes.isEmpty) {
        throw Exception('OSRM returned no routes');
      }

      final route = routes.first as Map;
      final geometry = route['geometry'] as Map?;
      final coordinates = geometry?['coordinates'];
      if (coordinates is! List || coordinates.isEmpty) {
        throw Exception('OSRM route has no geometry');
      }

      final points = coordinates
          .whereType<List>()
          .where((coord) => coord.length >= 2)
          .map(
            (coord) => LatLng(
              (coord[1] as num).toDouble(),
              (coord[0] as num).toDouble(),
            ),
          )
          .toList();

      if (!mounted || requestId != _routeRequestId) return;
      setState(() {
        _routePoints = points;
        _routeDistanceMeters = (route['distance'] as num?)?.toDouble();
        _routeDurationSeconds = (route['duration'] as num?)?.toDouble();
      });
    } catch (e) {
      debugPrint('OSRM route error: $e');
      _setFallbackRoute(driver, customer, requestId);
    }
  }

  void _setFallbackRoute(LatLng driver, LatLng customer, int requestId) {
    if (!mounted || requestId != _routeRequestId) return;
    final meters = _distance.as(LengthUnit.Meter, driver, customer);
    setState(() {
      _routePoints = [driver, customer];
      _routeDistanceMeters = meters;
      _routeDurationSeconds = meters / 9.7;
    });
  }

  void _centerMapIfNeeded() {
    if (_hasCenteredMap) return;
    final center = _driverPosition ?? _customerPosition ?? _vendorPosition;
    if (center == null) return;
    _hasCenteredMap = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _mapController.move(center, 14);
      }
    });
  }

  void _showTrackingMessage(
    String message, {
    bool restored = false,
    Duration? autoClear,
  }) {
    _messageTimer?.cancel();
    if (mounted) {
      setState(() {
        _trackingMessage = message;
        _isRestoredMessage = restored;
      });
    }
    if (autoClear != null) {
      _messageTimer = Timer(autoClear, () {
        if (mounted && _trackingMessage == message) {
          setState(() => _trackingMessage = null);
        }
      });
    }
  }

  Widget _buildTrackingBanner() {
    final message = _trackingMessage;
    if (message == null) return const SizedBox.shrink();

    final isWaiting = message == 'Waiting for driver location...';
    final color = _isRestoredMessage
        ? Colors.green
        : (_isOffline
              ? Colors.redAccent
              : isWaiting
              ? Colors.blueGrey.shade700
              : AppColors.surfaceDark);
    final icon = _isRestoredMessage
        ? Icons.check_circle
        : (isWaiting ? Icons.my_location : Icons.wifi);

    return Positioned(
      top: 100,
      left: 16,
      right: 16,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: color.withAlpha(230),
          borderRadius: BorderRadius.circular(12),
          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 8)],
        ),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    if (_isLoading) {
      return Scaffold(
        backgroundColor: AppColors.backgroundDark,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final center =
        _driverPosition ?? _customerPosition ?? _vendorPosition ?? LatLng(0, 0);

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(initialCenter: center, initialZoom: 14),
            children: [
              TileLayer(
                urlTemplate: MapTileConfig.urlTemplate,
                subdomains: MapTileConfig.subdomains,
                userAgentPackageName: 'com.deliveryapp.customer',
                tileBuilder: MapTileConfig.needsColorInversion
                    ? darkModeTileBuilder
                    : null,
              ),
              if (_routePoints.length > 1)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: _routePoints,
                      color: AppColors.primary,
                      strokeWidth: 4,
                    ),
                  ],
                ),
              MarkerLayer(markers: _buildMarkers()),
            ],
          ),
          _buildHeaderOverlay(context),
          _buildTrackingBanner(),
          _buildMapControls(),
          _buildBottomPanel(),
        ],
      ),
    );
  }

  List<Marker> _buildMarkers() {
    return [
      if (_customerPosition != null)
        Marker(
          point: _customerPosition!,
          width: 40,
          height: 40,
          child: const Icon(Icons.location_on, color: Colors.red, size: 40),
        ),
      if (_vendorPosition != null)
        Marker(
          point: _vendorPosition!,
          width: 40,
          height: 40,
          child: const Icon(Icons.store, color: Colors.blue, size: 32),
        ),
      if (_driverPosition != null)
        Marker(
          point: _driverPosition!,
          width: 60,
          height: 60,
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
                child: Transform.rotate(
                  angle: _driverHeading * math.pi / 180,
                  child: const Icon(
                    Icons.delivery_dining,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'DRIVER',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 8,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ),
    ];
  }

  Widget _buildHeaderOverlay(BuildContext context) {
    return Positioned(
      top: 40,
      left: 16,
      right: 16,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            style: IconButton.styleFrom(backgroundColor: AppColors.surfaceDark),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surfaceDark,
              borderRadius: BorderRadius.circular(AppSpacing.radiusM),
            ),
            child: Text(
              _statusLabel,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 48),
        ],
      ),
    );
  }

  Widget _buildMapControls() {
    return Positioned(
      right: 16,
      bottom: 340,
      child: Column(
        children: [
          FloatingActionButton.small(
            onPressed: () => _mapController.move(
              _mapController.camera.center,
              _mapController.camera.zoom + 1,
            ),
            backgroundColor: AppColors.surfaceDark,
            child: const Icon(Icons.add, color: Colors.white),
          ),
          const SizedBox(height: 8),
          FloatingActionButton.small(
            onPressed: () => _mapController.move(
              _mapController.camera.center,
              _mapController.camera.zoom - 1,
            ),
            backgroundColor: AppColors.surfaceDark,
            child: const Icon(Icons.remove, color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomPanel() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.l),
        decoration: const BoxDecoration(
          color: AppColors.backgroundDark,
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
          boxShadow: [BoxShadow(color: Colors.black54, blurRadius: 20)],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[800],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withAlpha(26),
                    shape: BoxShape.circle,
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: _buildLogoWidget(
                    _trackingData?['vendor_logo'],
                    size: 60,
                    fallbackIcon: Icons.storefront,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (_trackingData?['driver_name']
                                    ?.toString()
                                    .trim()
                                    .isNotEmpty ==
                                true)
                            ? _trackingData!['driver_name'].toString()
                            : (_trackingData?['vendor_name']?.toString() ??
                                  'Assigning Driver...'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        _statusText,
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: _openDriverDialer,
                  tooltip: _driverPhone == null
                      ? 'Driver phone unavailable'
                      : 'Call driver',
                  icon: Icon(
                    Icons.phone,
                    color: _driverPhone == null ? Colors.grey : Colors.green,
                  ),
                  style: IconButton.styleFrom(
                    backgroundColor:
                        (_driverPhone == null ? Colors.grey : Colors.green)
                            .withAlpha(26),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Divider(color: Colors.white10),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _buildMetric('ETA', _etaText)),
                Expanded(child: _buildMetric('Distance', _distanceText)),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Delivery Address',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    _trackingData?['address_line']?.toString() ?? 'N/A',
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.surfaceDark,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Text(
                  'Back to Details',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMetric(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }

  String get _statusLabel => _statusText.toUpperCase();

  String get _statusText {
    final status =
        (_trackingData?['delivery_status'] ??
                _trackingData?['status'] ??
                'tracking')
            .toString();
    return status.replaceAll('_', ' ');
  }

  String get _etaText {
    final seconds = _routeDurationSeconds;
    if (seconds == null || seconds <= 0) return '--';
    final minutes = (seconds / 60).ceil();
    if (minutes < 60) return '$minutes min';
    final hours = minutes ~/ 60;
    final remaining = minutes % 60;
    return remaining == 0 ? '${hours}h' : '${hours}h ${remaining}m';
  }

  String get _distanceText {
    final meters = _routeDistanceMeters;
    if (meters == null || meters <= 0) return '--';
    if (meters < 1000) return '${meters.round()} m';
    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  LatLng? _latLngFrom(
    Map<String, dynamic> data,
    List<String> latKeys,
    List<String> lngKeys,
  ) {
    final lat = _readDouble(data, latKeys);
    final lng = _readDouble(data, lngKeys);
    if (lat == null || lng == null) return null;
    return LatLng(lat, lng);
  }

  Map<String, dynamic>? _asStringKeyMap(dynamic payload) {
    if (payload is Map) {
      return payload.map((key, value) => MapEntry(key.toString(), value));
    }
    return null;
  }

  int? _readInt(Map<String, dynamic>? data, List<String> keys) {
    if (data == null) return null;
    for (final key in keys) {
      final value = data[key];
      if (value == null) continue;
      if (value is int) return value;
      final parsed = int.tryParse(value.toString());
      if (parsed != null) return parsed;
    }
    return null;
  }

  double? _readDouble(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key];
      if (value == null) continue;
      if (value is num) return value.toDouble();
      final parsed = double.tryParse(value.toString());
      if (parsed != null) return parsed;
    }
    return null;
  }

  Widget _buildLogoWidget(
    dynamic logo, {
    double size = 60,
    IconData fallbackIcon = Icons.storefront,
  }) {
    if (logo == null || logo.toString().isEmpty) {
      return Icon(fallbackIcon, color: AppColors.primary, size: size * 0.5);
    }
    final logoStr = logo.toString();
    final url = logoStr.startsWith('http')
        ? logoStr
        : '${ApiService.baseUrl.replaceAll('/api', '')}$logoStr';
    return Image.network(
      url,
      width: size,
      height: size,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) {
        return Icon(fallbackIcon, color: AppColors.primary, size: size * 0.5);
      },
    );
  }
}

Widget darkModeTileBuilder(
  BuildContext context,
  Widget tile,
  TileImage tileImage,
) {
  return ColorFiltered(
    colorFilter: const ColorFilter.matrix([
      -0.2126,
      -0.7152,
      -0.0722,
      0,
      255,
      -0.2126,
      -0.7152,
      -0.0722,
      0,
      255,
      -0.2126,
      -0.7152,
      -0.0722,
      0,
      255,
      0,
      0,
      0,
      1,
      0,
    ]),
    child: tile,
  );
}
