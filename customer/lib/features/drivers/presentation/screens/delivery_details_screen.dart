import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/constants/map_tile_config.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/theme/theme_provider.dart';

class DeliveryDetailsScreen extends StatefulWidget {
  const DeliveryDetailsScreen({super.key});

  @override
  State<DeliveryDetailsScreen> createState() => _DeliveryDetailsScreenState();
}

class _DeliveryDetailsScreenState extends State<DeliveryDetailsScreen> {
  dynamic _delivery;
  bool _isLoading = true;
  bool _isUpdating = false;
  bool _isVerifyingCode = false;
  bool _isCodeVerified = false;
  bool _isPhotoUploading = false;
  bool _isDeliveryCompleted = false;
  Uint8List? _uploadedBytes;
  String? _updatingStatus;
  StreamSubscription<Position>? _positionStream;
  Timer? _locationSyncTimer;
  Position? _lastKnownPosition;
  bool _isLocationSyncing = false;
  final MapController _mapController = MapController();
  final Distance _distance = const Distance();
  static const int _deliveryCodeLength = 6;
  static const int _maximumPhotoBytes = 5 * 1024 * 1024;
  static const List<String> _statusFlow = [
    'pending',
    'assigned',
    'heading_to_vendor',
    'picked_up',
    'on_the_way',
    'arrived',
    'delivered',
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final deliveryId = ModalRoute.of(context)?.settings.arguments;
    if (deliveryId != null && _delivery == null) {
      _fetchDetails(deliveryId);
    }
  }

  @override
  void dispose() {
    _stopLocationUpdates();
    super.dispose();
  }

  Future<void> _fetchDetails(dynamic id) async {
    if (mounted) setState(() => _isLoading = true);
    try {
      final response = await ApiService.get('/driver/deliveries/$id');
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (mounted) {
          setState(() {
            _delivery = decoded;
            _syncConfirmationState(decoded);
          });
        }
        print('DEBUG: Delivery details refreshed. Status: ${_currentStatus()}');
        if (_shouldStreamLocation(_currentStatus())) {
          _startLocationUpdates();
        } else {
          _stopLocationUpdates();
        }
      }
    } catch (e) {
      print('Error fetching delivery details: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Map<String, dynamic> _mapValue(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return const <String, dynamic>{};
  }

  Iterable<Map<String, dynamic>> _responseSections(dynamic payload) sync* {
    final root = _mapValue(payload);
    if (root.isEmpty) return;
    yield root;

    for (final key in const ['data', 'delivery', 'order']) {
      final section = _mapValue(root[key]);
      if (section.isNotEmpty) yield section;
    }

    final data = _mapValue(root['data']);
    for (final key in const ['delivery', 'order']) {
      final section = _mapValue(data[key]);
      if (section.isNotEmpty) yield section;
    }
  }

  bool? _readBoolean(
    dynamic payload, {
    required List<String> booleanKeys,
    List<String> timestampKeys = const [],
  }) {
    for (final section in _responseSections(payload)) {
      for (final key in booleanKeys) {
        if (!section.containsKey(key) || section[key] == null) continue;
        final value = section[key];
        if (value is bool) return value;
        if (value is num) return value != 0;
        final normalized = value.toString().trim().toLowerCase();
        if (const {
          'true',
          '1',
          'yes',
          'verified',
          'completed',
        }.contains(normalized)) {
          return true;
        }
        if (const {
          'false',
          '0',
          'no',
          'unverified',
          'pending',
        }.contains(normalized)) {
          return false;
        }
      }
      for (final key in timestampKeys) {
        final value = section[key]?.toString().trim();
        if (value != null && value.isNotEmpty && value != 'null') return true;
      }
    }
    return null;
  }

  String? _readString(dynamic payload, List<String> keys) {
    for (final section in _responseSections(payload)) {
      for (final key in keys) {
        final value = section[key]?.toString().trim();
        if (value != null && value.isNotEmpty && value != 'null') return value;
      }
    }
    return null;
  }

  void _syncConfirmationState(dynamic payload) {
    final status =
        _readString(payload, const [
          'deliveryStatus',
          'delivery_status',
          'status',
          'order_status',
        ]) ??
        _currentStatus();
    final completed = const {
      'delivered',
      'completed',
    }.contains(status.toLowerCase().trim());
    final verified = _readBoolean(
      payload,
      booleanKeys: const [
        'deliveryCodeVerified',
        'delivery_code_verified',
        'codeVerified',
        'code_verified',
      ],
      timestampKeys: const [
        'deliveryCodeVerifiedAt',
        'delivery_code_verified_at',
      ],
    );

    if (verified != null) _isCodeVerified = verified;
    if (completed) {
      _isCodeVerified = true;
      _isDeliveryCompleted = true;
    } else {
      final explicitCompleted = _readBoolean(
        payload,
        booleanKeys: const [
          'completed',
          'deliveryCompleted',
          'delivery_completed',
        ],
      );
      if (explicitCompleted != null) {
        _isDeliveryCompleted = explicitCompleted;
      }
    }
  }

  dynamic get _orderId {
    final root = _mapValue(_delivery);
    final delivery = _mapValue(root['delivery']);
    final order = _mapValue(root['order']);
    return root['order_id'] ??
        root['orderId'] ??
        delivery['order_id'] ??
        delivery['orderId'] ??
        order['id'];
  }

  Future<void> _startLocationUpdates() async {
    if (_positionStream != null && _locationSyncTimer != null) return;

    try {
      final canUseLocation = await _ensureLocationReady(
        actionName: 'track this delivery',
      );
      if (!canUseLocation) {
        return;
      }

      // Android foreground service keeps live delivery tracking active while the app is backgrounded.
      final locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 5),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationText: 'Delivery tracking is active in the background.',
          notificationTitle: 'Live Tracking',
          enableWakeLock: true,
        ),
      );

      _positionStream ??=
          Geolocator.getPositionStream(
            locationSettings: locationSettings,
          ).listen((Position position) {
            _lastKnownPosition = position;
            _updateLiveLocation(position);
          }, onError: (e) => print('DEBUG: Location stream error: $e'));

      _locationSyncTimer ??= Timer.periodic(
        const Duration(seconds: 5),
        (_) => _syncLatestLocation(),
      );
      unawaited(_syncLatestLocation(forceRefresh: true));
      print('DEBUG: GPS live tracking started with 5-second sync.');
    } on PlatformException catch (e) {
      print('DEBUG: Location start PlatformException: ${e.message}');
      _showLocationSnackBar(_locationPlatformMessage(e));
    } catch (e) {
      print('DEBUG: Location start failed: $e');
      _showLocationSnackBar(
        'Unable to start live GPS tracking. Please try again.',
      );
    }
  }

  void _stopLocationUpdates() {
    _positionStream?.cancel();
    _positionStream = null;
    _locationSyncTimer?.cancel();
    _locationSyncTimer = null;
    _isLocationSyncing = false;
  }

  Future<void> _syncLatestLocation({bool forceRefresh = false}) async {
    if (_isLocationSyncing || !_shouldStreamLocation(_currentStatus())) return;

    _isLocationSyncing = true;
    try {
      var position = _lastKnownPosition;
      if (forceRefresh || position == null) {
        position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
          ),
        ).timeout(const Duration(seconds: 10));
        _lastKnownPosition = position;
      }

      await _updateLiveLocation(position);
    } on PlatformException catch (e) {
      print('DEBUG: Timed GPS sync PlatformException: ${e.message}');
    } on TimeoutException {
      print('DEBUG: Timed GPS sync timed out.');
    } catch (e) {
      print('DEBUG: Timed GPS sync failed: $e');
    } finally {
      _isLocationSyncing = false;
    }
  }

  Future<void> _updateLiveLocation(Position position) async {
    if (mounted) {
      setState(() {
        final deliveryDetails = Map<String, dynamic>.from(
          (_delivery?['delivery'] as Map?) ?? const {},
        );
        deliveryDetails['driver_latitude'] = position.latitude;
        deliveryDetails['driver_longitude'] = position.longitude;
        _delivery = {...?_delivery, 'delivery': deliveryDetails};
      });
    }

    try {
      await ApiService.put('/drivers/location', {
        'delivery_id': _delivery['id'],
        'latitude': position.latitude,
        'longitude': position.longitude,
        'heading': position.heading.isFinite ? position.heading : null,
        'speed': position.speed.isFinite ? position.speed : null,
      });
    } catch (e) {
      print('Location Update Error: $e');
    }
  }

  double? _firstCoordinate(List<dynamic> values) {
    for (final value in values) {
      final parsed = double.tryParse(value?.toString() ?? '');
      if (parsed != null && parsed.isFinite) return parsed;
    }
    return null;
  }

  LatLng? _pointFromValues(List<dynamic> latValues, List<dynamic> lngValues) {
    final lat = _firstCoordinate(latValues);
    final lng = _firstCoordinate(lngValues);
    if (lat == null || lng == null) return null;
    if (lat.abs() < 0.000001 && lng.abs() < 0.000001) return null;
    return LatLng(lat, lng);
  }

  LatLng _centerForPoints(List<LatLng> points) {
    if (points.isEmpty) return const LatLng(2.0469, 45.3182);
    final lat =
        points.map((p) => p.latitude).reduce((a, b) => a + b) / points.length;
    final lng =
        points.map((p) => p.longitude).reduce((a, b) => a + b) / points.length;
    return LatLng(lat, lng);
  }

  LatLng? _targetPointForStatus(
    String status,
    LatLng? customerPoint,
    LatLng? vendorPoint,
  ) {
    switch (_canonicalStatus(status)) {
      case 'assigned':
      case 'heading_to_vendor':
        return vendorPoint ?? customerPoint;
      case 'picked_up':
      case 'on_the_way':
      case 'arrived':
        return customerPoint ?? vendorPoint;
      default:
        return customerPoint ?? vendorPoint;
    }
  }

  String _targetLabelForStatus(String status) {
    switch (_canonicalStatus(status)) {
      case 'assigned':
      case 'heading_to_vendor':
        return 'To Vendor';
      case 'arrived':
        return 'At Customer';
      default:
        return 'To Customer';
    }
  }

  double? _remainingDistanceMeters(LatLng? driverPoint, LatLng? targetPoint) {
    if (driverPoint == null || targetPoint == null) return null;
    return _distance.as(LengthUnit.Meter, driverPoint, targetPoint);
  }

  String _formatMapDistance(double? meters) {
    if (meters == null || !meters.isFinite) return '--';
    if (meters < 1000) return '${meters.round()} m';
    return '${(meters / 1000).toStringAsFixed(1)} km';
  }

  String _formatMapEta(double? meters, String status) {
    if (_canonicalStatus(status) == 'arrived') return 'Arrived';
    if (meters == null || !meters.isFinite) return '--';
    final minutes = (meters / 416).ceil().clamp(1, 99);
    return '$minutes min';
  }

  String _currentStatus() {
    return (_delivery?['status'] ??
            _delivery?['delivery']?['status'] ??
            _delivery?['delivery_status'] ??
            'assigned')
        .toString();
  }

  String _canonicalStatus(String status) {
    switch (status.toLowerCase().trim()) {
      case 'accepted':
        return 'heading_to_vendor';
      case 'driver assigned':
        return 'assigned';
      case 'on the way':
        return 'on_the_way';
      case 'completed':
        return 'delivered';
      default:
        return status;
    }
  }

  bool _shouldStreamLocation(String status) {
    return const {
      'assigned',
      'accepted',
      'heading_to_vendor',
      'picked_up',
      'on_the_way',
      'arrived',
    }.contains(_canonicalStatus(status));
  }

  bool _canTransitionTo(String nextStatus) {
    final currentIndex = _statusFlow.indexOf(
      _canonicalStatus(_currentStatus()),
    );
    final nextIndex = _statusFlow.indexOf(nextStatus);
    return currentIndex >= 0 && nextIndex == currentIndex + 1;
  }

  String _extractErrorMessage(dynamic body, int statusCode) {
    try {
      final decoded = jsonDecode(body.toString());
      return (decoded['message'] ?? decoded['error'] ?? 'Request failed')
          .toString();
    } catch (_) {
      if (statusCode == 401 || statusCode == 403) {
        return 'Your session expired. Please log in again.';
      }
      if (statusCode == 409) {
        return 'This delivery was already updated. Please refresh.';
      }
      return 'Request failed. Please try again.';
    }
  }

  String _locationPlatformMessage(PlatformException error) {
    if (error.code == 'PERMISSION_DEFINITIONS_NOT_FOUND') {
      return 'Location permission is not available in this app build. Please reinstall the latest build.';
    }
    return 'Location error: ${error.message ?? error.code}';
  }

  void _showLocationSnackBar(
    String message, {
    bool openAppSettings = false,
    bool openLocationSettings = false,
  }) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        duration: const Duration(seconds: 6),
        action: (openAppSettings || openLocationSettings)
            ? SnackBarAction(
                label: 'Settings',
                onPressed: () {
                  if (openAppSettings) {
                    Geolocator.openAppSettings();
                  } else {
                    Geolocator.openLocationSettings();
                  }
                },
              )
            : null,
      ),
    );
  }

  Future<bool> _ensureLocationReady({required String actionName}) async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        print('DEBUG: GPS unavailable: location services disabled.');
        _showLocationSnackBar(
          'GPS is disabled. Turn on Location Services to $actionName.',
          openLocationSettings: true,
        );
        return false;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        print('DEBUG: GPS unavailable: location permission denied.');
        _showLocationSnackBar(
          'Location permission denied. Allow location access to $actionName.',
        );
        return false;
      }

      if (permission == LocationPermission.deniedForever) {
        print(
          'DEBUG: GPS unavailable: location permission permanently denied.',
        );
        _showLocationSnackBar(
          'Location permission is permanently denied. Open app settings and allow location access.',
          openAppSettings: true,
        );
        return false;
      }

      return true;
    } on PlatformException catch (e) {
      print(
        'DEBUG: GPS permission PlatformException: ${e.code} - ${e.message}',
      );
      _showLocationSnackBar(_locationPlatformMessage(e));
      return false;
    }
  }

  Future<Position?> _getCurrentPositionForPickup() async {
    try {
      final canUseLocation = await _ensureLocationReady(
        actionName: 'pick up orders',
      );
      if (!canUseLocation) {
        return null;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 12));
      _lastKnownPosition = position;
      return position;
    } on PlatformException catch (e) {
      // Handles: manifest missing permissions, service not available, etc.
      print('DEBUG: Pickup GPS PlatformException: ${e.code} - ${e.message}');
      _showLocationSnackBar(_locationPlatformMessage(e));
      return null;
    } on TimeoutException {
      print('DEBUG: Pickup GPS timed out.');
      _showLocationSnackBar(
        'Could not get your GPS location. Move to an open area and try again.',
      );
      return null;
    } catch (e) {
      print('DEBUG: Pickup GPS unavailable: $e');
      _showLocationSnackBar(
        'Could not get your GPS location. Please try again.',
      );
      return null;
    }
  }

  Future<void> _updateStatus(String status) async {
    if (_isUpdating) return;
    if (!_canTransitionTo(status) &&
        status != 'failed' &&
        status != 'accepted' &&
        status != 'rejected') {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Cannot change status from ${_currentStatus()} to $status.',
            ),
          ),
        );
      }
      return;
    }

    print(
      'DEBUG: Status button clicked. Current=${_currentStatus()}, Next=$status',
    );
    if (mounted) {
      setState(() {
        _isUpdating = true;
        _updatingStatus = status;
      });
    }
    try {
      String endpoint = '/driver/deliveries/${_delivery['id']}/status';
      if (status == 'heading_to_vendor') {
        endpoint = '/driver/deliveries/${_delivery['id']}/status';
      }
      if (status == 'picked_up') {
        endpoint = '/driver/deliveries/${_delivery['id']}/pickup';
      }
      if (status == 'on_the_way') {
        endpoint = '/driver/deliveries/${_delivery['id']}/on-the-way';
      }
      if (status == 'arrived') {
        endpoint = '/driver/deliveries/${_delivery['id']}/arrived';
      }
      if (status == 'delivered') {
        endpoint = '/driver/deliveries/${_delivery['id']}/delivered';
      }
      if (status == 'accepted') {
        endpoint = '/driver/deliveries/${_delivery['id']}/accept';
      }
      if (status == 'rejected') {
        endpoint = '/driver/deliveries/${_delivery['id']}/reject';
      }

      final Map<String, dynamic> payload = {'status': status};
      if (status == 'arrived') {
        final position = await _getCurrentPositionForPickup();
        if (position != null) {
          payload['latitude'] = position.latitude;
          payload['longitude'] = position.longitude;
        } else {
          print(
            'DEBUG: Arrival GPS skipped; backend will validate last synced driver location.',
          );
        }
      }

      print('DEBUG: API request started PATCH $endpoint');
      final response = await ApiService.patch(endpoint, payload);
      print('DEBUG: API response ${response.statusCode}: ${response.body}');
      if (response.statusCode == 200) {
        // Always start/stop GPS based on resulting status
        if (_shouldStreamLocation(status)) {
          _startLocationUpdates();
        }
        if (status == 'delivered') _stopLocationUpdates();
        await _fetchDetails(_delivery['id']);
        print('DEBUG: Updated delivery status: ${_currentStatus()}');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Delivery updated to ${status.replaceAll('_', ' ')}.',
              ),
            ),
          );
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _extractErrorMessage(response.body, response.statusCode),
            ),
          ),
        );
      }
    } catch (e) {
      print('DEBUG: Status update failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUpdating = false;
          _updatingStatus = null;
        });
      }
    }
  }

  Future<void> _rejectDelivery() async {
    final shouldReject = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Reject Order'),
        content: const Text('Are you sure you want to reject this order?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (shouldReject != true) return;
    if (mounted) {
      setState(() {
        _isUpdating = true;
        _updatingStatus = 'rejected';
      });
    }
    try {
      final response = await ApiService.patch(
        '/driver/deliveries/${_delivery['id']}/reject',
        {
          'status': 'rejected',
          'rejection_reason': 'Rejected by delivery personnel',
        },
      );
      if (response.statusCode == 200 && mounted) Navigator.pop(context);
    } finally {
      if (mounted) {
        setState(() {
          _isUpdating = false;
          _updatingStatus = null;
        });
      }
    }
  }

  Future<void> _markPickedUp() async {
    if (_isUpdating) return;
    final currentStatus = _canonicalStatus(_currentStatus());
    print('DEBUG: Mark Picked Up clicked. Current status=$currentStatus');

    if (currentStatus == 'picked_up') {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('This order is already picked up.')),
        );
      }
      return;
    }

    if (currentStatus != 'heading_to_vendor') {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Cannot pick up order from $currentStatus status.'),
          ),
        );
      }
      return;
    }

    if (mounted) {
      setState(() {
        _isUpdating = true;
        _updatingStatus = 'picked_up';
      });
    }

    try {
      final position = await _getCurrentPositionForPickup();
      if (position == null) {
        print(
          'DEBUG: Pickup cancelled because GPS location was not available.',
        );
        return;
      }

      await _updateLiveLocation(position);

      final Map<String, dynamic> payload = {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'heading': position.heading.isFinite ? position.heading : null,
        'speed': position.speed.isFinite ? position.speed : null,
      };

      final endpoint = '/driver/deliveries/${_delivery['id']}/pickup';
      print('DEBUG: API request started PATCH $endpoint');
      final response = await ApiService.patch(endpoint, payload);
      print('DEBUG: API response ${response.statusCode}: ${response.body}');

      if (response.statusCode == 200) {
        _startLocationUpdates();
        await _fetchDetails(_delivery['id']);
        print('DEBUG: Updated delivery status: ${_currentStatus()}');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Order picked up successfully.')),
          );
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _extractErrorMessage(response.body, response.statusCode),
            ),
          ),
        );
      }
    } catch (e) {
      print('DEBUG: Pickup failed: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUpdating = false;
          _updatingStatus = null;
        });
      }
    }
  }

  Future<_DeliveryCodeResult> _submitDeliveryCode(String code) async {
    if (_isVerifyingCode) {
      return const _DeliveryCodeResult.failure(
        'Verification is already in progress.',
      );
    }

    final orderId = _orderId;
    if (orderId == null) {
      return const _DeliveryCodeResult.failure(
        'Order information is unavailable. Please refresh and try again.',
      );
    }

    if (mounted) setState(() => _isVerifyingCode = true);
    try {
      final response = await ApiService.post(
        '/driver/orders/$orderId/verify-delivery-code',
        {'code': code},
      );
      dynamic payload;
      try {
        payload = jsonDecode(response.body);
      } catch (_) {
        payload = const <String, dynamic>{};
      }

      final success = _readBoolean(payload, booleanKeys: const ['success']);
      if (response.statusCode >= 200 &&
          response.statusCode < 300 &&
          success != false) {
        if (mounted) {
          setState(() {
            _isCodeVerified = true;
            _syncConfirmationState(payload);
          });
        }
        await _refreshCurrentDelivery();
        return const _DeliveryCodeResult.success();
      }

      return _DeliveryCodeResult.failure(
        _deliveryConfirmationError(
          payload,
          response.statusCode,
          fallback: 'Invalid delivery code. Please check and try again.',
        ),
      );
    } catch (_) {
      return const _DeliveryCodeResult.failure(
        'Unable to connect to the server. Check your internet connection and try again.',
      );
    } finally {
      if (mounted) setState(() => _isVerifyingCode = false);
    }
  }

  Future<void> _verifyCode() async {
    if (_isVerifyingCode ||
        _isPhotoUploading ||
        _isDeliveryCompleted ||
        _isCodeVerified) {
      return;
    }

    final verified = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      useSafeArea: true,
      builder: (_) => _DeliveryCodeDialog(
        codeLength: _deliveryCodeLength,
        onVerify: _submitDeliveryCode,
      ),
    );

    if (verified == true && mounted) {
      FocusManager.instance.primaryFocus?.unfocus();
      _showMessage('Delivery code verified successfully.', isSuccess: true);
    }
  }

  Future<void> _refreshCurrentDelivery() async {
    final deliveryId = _mapValue(_delivery)['id'];
    if (deliveryId != null) await _fetchDetails(deliveryId);
  }

  String _deliveryConfirmationError(
    dynamic payload,
    int statusCode, {
    required String fallback,
  }) {
    final message =
        _readString(payload, const ['message', 'error'])?.trim() ?? '';
    final normalized = message.toLowerCase();

    if (normalized.contains('expired')) {
      return 'This delivery code has expired. Please request a new code.';
    }
    if (normalized.contains('already completed') ||
        normalized.contains('already been completed') ||
        normalized.contains('order completed')) {
      return 'This order has already been completed.';
    }
    if (normalized.contains('code') &&
        (normalized.contains('invalid') ||
            normalized.contains('incorrect') ||
            normalized.contains('wrong'))) {
      return 'Invalid delivery code. Please check and try again.';
    }
    if (statusCode == 401 || statusCode == 403) {
      return message.isNotEmpty
          ? message
          : 'Your session expired. Please log in again.';
    }
    return message.isNotEmpty ? message : fallback;
  }

  void _showMessage(String message, {bool isSuccess = false}) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isSuccess ? const Color(0xFF15803D) : null,
      ),
    );
  }

  Future<ImageSource?> _choosePhotoSource() {
    return showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: AppColors.surfaceDark,
      useSafeArea: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Add Delivery Photo',
              style: TextStyle(
                color: AppColors.textPrimaryDark,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Take a new photo or select one from your gallery.',
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.camera_alt, color: AppColors.primary),
              title: const Text(
                'Take Photo',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(
                Icons.photo_library_outlined,
                color: AppColors.primary,
              ),
              title: const Text(
                'Choose from Gallery',
                style: TextStyle(color: Colors.white),
              ),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
  }

  String? _supportedPhotoExtension(XFile photo) {
    final filename = photo.name.toLowerCase();
    final dotIndex = filename.lastIndexOf('.');
    if (dotIndex < 0 || dotIndex == filename.length - 1) return null;
    final extension = filename.substring(dotIndex + 1);
    if (!const {'jpg', 'jpeg', 'png'}.contains(extension)) return null;

    final mimeType = photo.mimeType?.toLowerCase();
    if (mimeType != null &&
        mimeType.isNotEmpty &&
        !const {'image/jpeg', 'image/jpg', 'image/png'}.contains(mimeType)) {
      return null;
    }
    return extension;
  }

  bool _hasValidPhotoSignature(Uint8List bytes, String extension) {
    if (extension == 'jpg' || extension == 'jpeg') {
      return bytes.length >= 3 &&
          bytes[0] == 0xFF &&
          bytes[1] == 0xD8 &&
          bytes[2] == 0xFF;
    }
    return bytes.length >= 8 &&
        bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4E &&
        bytes[3] == 0x47 &&
        bytes[4] == 0x0D &&
        bytes[5] == 0x0A &&
        bytes[6] == 0x1A &&
        bytes[7] == 0x0A;
  }

  Future<void> _uploadPhoto() async {
    if (_isUpdating || _isVerifyingCode || _isPhotoUploading) return;
    if (_isDeliveryCompleted) return;
    if (!_isCodeVerified) {
      _showMessage('Verify the delivery code before uploading a photo.');
      return;
    }

    var source = await _choosePhotoSource();
    while (source != null && mounted) {
      XFile? photo;
      try {
        photo = await ImagePicker().pickImage(
          source: source,
          maxWidth: 1920,
          maxHeight: 1920,
          imageQuality: 82,
          requestFullMetadata: false,
        );
      } on PlatformException catch (error) {
        _showMessage(
          error.code.contains('permission')
              ? 'Camera or photo permission was denied. Allow access in Settings and try again.'
              : 'Unable to open the camera or gallery. Please try again.',
        );
        return;
      } catch (_) {
        _showMessage('Unable to open the camera or gallery. Please try again.');
        return;
      }

      if (photo == null || !mounted) return;
      final extension = _supportedPhotoExtension(photo);
      if (extension == null) {
        _showMessage('Select a JPG, JPEG, or PNG image.');
        return;
      }

      Uint8List bytes;
      try {
        bytes = await photo.readAsBytes();
      } catch (_) {
        _showMessage('The selected photo could not be read. Please try again.');
        return;
      }

      if (bytes.isEmpty) {
        _showMessage('The selected photo is empty. Please choose another one.');
        return;
      }
      if (!_hasValidPhotoSignature(bytes, extension)) {
        _showMessage(
          'The selected file is not a valid JPG, JPEG, or PNG image.',
        );
        return;
      }
      if (bytes.length > _maximumPhotoBytes) {
        _showMessage(
          'The photo is larger than 5 MB after compression. Please choose a smaller image.',
        );
        return;
      }
      if (!mounted) return;

      final action = await showDialog<_PhotoPreviewAction>(
        context: context,
        barrierDismissible: false,
        useSafeArea: true,
        builder: (_) => _DeliveryPhotoPreviewDialog(bytes: bytes),
      );
      if (!mounted || action == null || action == _PhotoPreviewAction.cancel) {
        return;
      }
      if (action == _PhotoPreviewAction.retake) {
        source = ImageSource.camera;
        continue;
      }

      await _sendDeliveryPhoto(bytes, extension);
      return;
    }
  }

  Future<void> _sendDeliveryPhoto(Uint8List bytes, String extension) async {
    if (_isPhotoUploading) return;
    final orderId = _orderId;
    if (orderId == null) {
      _showMessage(
        'Order information is unavailable. Please refresh and try again.',
      );
      return;
    }

    if (mounted) setState(() => _isPhotoUploading = true);
    try {
      final filename =
          'delivery_${orderId}_${DateTime.now().millisecondsSinceEpoch}.$extension';
      final response = await ApiService.uploadFileBytes(
        '/driver/orders/$orderId/delivery-proof',
        'delivery_photo',
        bytes,
        filename,
      );
      dynamic payload;
      try {
        payload = jsonDecode(response.body);
      } catch (_) {
        payload = const <String, dynamic>{};
      }

      final success = _readBoolean(payload, booleanKeys: const ['success']);
      if (response.statusCode >= 200 &&
          response.statusCode < 300 &&
          success != false) {
        if (mounted) {
          setState(() {
            _uploadedBytes = bytes;
            _isCodeVerified = true;
            _isDeliveryCompleted = true;
            _syncConfirmationState(payload);
          });
        }
        _stopLocationUpdates();
        await _refreshCurrentDelivery();
        if (mounted) {
          setState(() {
            _uploadedBytes = bytes;
            _isDeliveryCompleted = true;
          });
          _showMessage(
            'Delivery proof uploaded successfully.',
            isSuccess: true,
          );
        }
        return;
      }

      _showMessage(
        _deliveryConfirmationError(
          payload,
          response.statusCode,
          fallback: 'Delivery photo upload failed. Please try again.',
        ),
      );
    } catch (_) {
      _showMessage(
        'Unable to connect to the server. Check your internet connection and try again.',
      );
    } finally {
      if (mounted) setState(() => _isPhotoUploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppColors.backgroundDark,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: Icon(Icons.arrow_back, color: AppColors.textPrimaryDark),
        ),
        title: Text(
          'Delivery Details',
          style: TextStyle(
            color: AppColors.textPrimaryDark,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _delivery == null
            ? Center(
                child: Text(
                  'Failed to load delivery details',
                  style: TextStyle(color: AppColors.textPrimaryDark),
                ),
              )
            : Builder(
                builder: (context) {
                  final customerName =
                      (_delivery['customer_name'] ??
                              _delivery['customer']?['name'] ??
                              'Unknown Customer')
                          .toString();
                  final phone =
                      (_delivery['phone'] ??
                              _delivery['customer']?['phone'] ??
                              _delivery['customer_phone'] ??
                              'No phone')
                          .toString();
                  final destinations = List<Map<String, dynamic>>.from(
                    ((_delivery['destinations'] as List?) ?? const []).map(
                      (item) => Map<String, dynamic>.from(item as Map),
                    ),
                  );
                  final address =
                      (_delivery['address'] ??
                              _delivery['customer']?['address'] ??
                              _delivery['customer_address'] ??
                              'No address')
                          .toString();
                  final vendorName =
                      (_delivery['vendor_name'] ??
                              _delivery['vendor']?['name'] ??
                              'Unknown Vendor')
                          .toString();
                  final vendorAddress =
                      (_delivery['vendor_address'] ??
                              _delivery['vendor']?['address'] ??
                              'N/A')
                          .toString();

                  final horizontalPadding =
                      MediaQuery.sizeOf(context).width < 360
                      ? 12.0
                      : AppSpacing.l;
                  return SingleChildScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: EdgeInsets.symmetric(
                      horizontal: horizontalPadding,
                      vertical: AppSpacing.l,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildStatusCard(),
                        const SizedBox(height: AppSpacing.l),
                        _buildMapSection(),
                        const SizedBox(height: AppSpacing.xl),
                        _buildInfoSection('CUSTOMER INFO', [
                          _buildInfoRow(Icons.person, 'Name', customerName),
                          _buildInfoRow(Icons.phone, 'Phone', phone),
                          _buildInfoRow(Icons.location_on, 'Address', address),
                          ...destinations.map(
                            (destination) => _buildInfoRow(
                              Icons.phone_in_talk_outlined,
                              'Stop ${destination['sequence_no']} Contact',
                              '${destination['phone']} - ${destination['address_line']}',
                            ),
                          ),
                        ]),
                        const SizedBox(height: AppSpacing.xl),
                        _buildInfoSection('VENDOR INFO', [
                          _buildInfoRow(Icons.business, 'Station', vendorName),
                          _buildInfoRow(
                            Icons.map,
                            'Vendor Address',
                            vendorAddress,
                          ),
                        ]),
                        const SizedBox(height: AppSpacing.xl),
                        _buildItemsSection(),
                        const SizedBox(height: 40),
                        _buildActionButtons(),
                        const SizedBox(height: 32),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }

  Widget _buildMapSection() {
    final status = _canonicalStatus(
      (_delivery['delivery']?['status'] ?? _delivery['status'] ?? '')
          .toString(),
    );
    if (!{
      'assigned',
      'heading_to_vendor',
      'picked_up',
      'on_the_way',
      'arrived',
    }.contains(status)) {
      return const SizedBox.shrink();
    }

    final customerPoint = _pointFromValues(
      [
        _delivery['customer']?['latitude'],
        _delivery['customer_latitude'],
        _delivery['customer_lat'],
        _delivery['dest_lat'],
        _delivery['latitude'],
      ],
      [
        _delivery['customer']?['longitude'],
        _delivery['customer_longitude'],
        _delivery['customer_lng'],
        _delivery['dest_lng'],
        _delivery['longitude'],
      ],
    );
    final vendorPoint = _pointFromValues(
      [
        _delivery['vendor']?['latitude'],
        _delivery['vendor_latitude'],
        _delivery['vendor_lat'],
        _delivery['pickup_lat'],
      ],
      [
        _delivery['vendor']?['longitude'],
        _delivery['vendor_longitude'],
        _delivery['vendor_lng'],
        _delivery['pickup_lng'],
      ],
    );
    final driverPoint = _pointFromValues(
      [
        _delivery['delivery']?['driver_latitude'],
        _delivery['driver_latitude'],
        _delivery['driver_lat'],
        _delivery['current_latitude'],
        _delivery['current_lat'],
      ],
      [
        _delivery['delivery']?['driver_longitude'],
        _delivery['driver_longitude'],
        _delivery['driver_lng'],
        _delivery['current_longitude'],
        _delivery['current_lng'],
      ],
    );

    final targetPoint = _targetPointForStatus(
      status,
      customerPoint,
      vendorPoint,
    );
    final points = [
      if (driverPoint != null) driverPoint,
      if (targetPoint != null) targetPoint,
      if (customerPoint != null && customerPoint != targetPoint) customerPoint,
      if (vendorPoint != null && vendorPoint != targetPoint) vendorPoint,
    ];

    if (points.isEmpty) {
      return Container(
        height: 220,
        width: double.infinity,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.surfaceDark.withOpacity(0.35),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderDark),
        ),
        child: const Text(
          'Waiting for map location...',
          style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w700),
        ),
      );
    }

    final routePoints = [
      if (driverPoint != null) driverPoint,
      if (targetPoint != null) targetPoint,
    ];
    final fitPoints = routePoints.length > 1 ? routePoints : points;
    final remainingMeters = _remainingDistanceMeters(driverPoint, targetPoint);
    final targetLabel = _targetLabelForStatus(status);

    final markers = <Marker>[
      if (vendorPoint != null)
        Marker(
          point: vendorPoint,
          width: 86,
          height: 64,
          child: _buildMapMarker(
            Icons.storefront,
            'Vendor',
            Colors.orangeAccent,
          ),
        ),
      if (customerPoint != null)
        Marker(
          point: customerPoint,
          width: 96,
          height: 64,
          child: _buildMapMarker(
            Icons.person_pin_circle,
            'Customer',
            Colors.redAccent,
          ),
        ),
      if (driverPoint != null)
        Marker(
          point: driverPoint,
          width: 86,
          height: 64,
          child: _buildMapMarker(
            Icons.local_shipping,
            'Driver',
            AppColors.primary,
          ),
        ),
    ];

    return Container(
      height: 292,
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderDark),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            ColoredBox(
              color: const Color(0xFFF4F7FA),
              child: FlutterMap(
                key: ValueKey(
                  'driver-map-$status-${driverPoint?.latitude}-${driverPoint?.longitude}-${targetPoint?.latitude}-${targetPoint?.longitude}',
                ),
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: _centerForPoints(fitPoints),
                  initialZoom: fitPoints.length > 1 ? 14 : 15,
                  initialCameraFit: fitPoints.length > 1
                      ? CameraFit.bounds(
                          bounds: LatLngBounds.fromPoints(fitPoints),
                          padding: const EdgeInsets.fromLTRB(42, 42, 42, 94),
                        )
                      : null,
                ),
                children: [
                  TileLayer(
                    urlTemplate: MapTileConfig.urlTemplate,
                    subdomains: MapTileConfig.subdomains,
                    userAgentPackageName: 'com.deliveryapp.customer',
                    tileBuilder: MapTileConfig.needsColorInversion
                        ? darkModeTileBuilder
                        : null,
                  ),
                  if (routePoints.length > 1)
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: routePoints,
                          color: AppColors.primary,
                          strokeWidth: 5,
                        ),
                      ],
                    ),
                  MarkerLayer(markers: markers),
                ],
              ),
            ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: _buildMapMetricCard(
                targetLabel: targetLabel,
                distanceText: _formatMapDistance(remainingMeters),
                etaText: _formatMapEta(remainingMeters, status),
                hasDriverLocation: driverPoint != null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMapMarker(IconData icon, String label, Color color) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 8)],
          ),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
        const SizedBox(height: 3),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.72),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMapMetricCard({
    required String targetLabel,
    required String distanceText,
    required String etaText,
    required bool hasDriverLocation,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.94),
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 12,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: hasDriverLocation
                  ? AppColors.primary.withOpacity(0.12)
                  : Colors.orange.withOpacity(0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(
              hasDriverLocation ? Icons.navigation : Icons.gps_not_fixed,
              color: hasDriverLocation ? AppColors.primary : Colors.orange,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  hasDriverLocation ? targetLabel : 'Waiting for driver GPS',
                  style: const TextStyle(
                    color: Color(0xFF0F172A),
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  hasDriverLocation
                      ? '$distanceText remaining'
                      : 'Keep tracking open while location loads',
                  style: const TextStyle(
                    color: Color(0xFF64748B),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              etaText,
              style: const TextStyle(
                color: Color(0xFF1D4ED8),
                fontWeight: FontWeight.w900,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusCard() {
    final status =
        (_delivery['status'] ??
                _delivery['delivery']?['status'] ??
                _delivery['delivery_status'] ??
                'assigned')
            .toString();
    final color = _getStatusColor(status);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.l),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, color: color),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Current Status',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
                Text(
                  status.toUpperCase().replaceAll('_', ' '),
                  softWrap: true,
                  style: TextStyle(
                    color: color,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: Colors.grey,
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surfaceDark.withOpacity(0.3),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.borderDark.withOpacity(0.3)),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.primary, size: 18),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  softWrap: true,
                  style: const TextStyle(color: Colors.grey, fontSize: 10),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  softWrap: true,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemsSection() {
    final List items = _delivery['items'] ?? [];
    return _buildInfoSection(
      'ORDERED ITEMS',
      items
          .map(
            (i) => _buildInfoRow(
              Icons.inventory_2,
              (i['product_name'] ?? 'Unknown').toString(),
              'Qty: ${(i['quantity'] ?? 0).toString()}',
            ),
          )
          .toList(),
    );
  }

  Widget _buildDeliveryProofCard() {
    if (_uploadedBytes == null) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceDark,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF22C55E)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.check_circle, color: Color(0xFF4ADE80), size: 18),
              SizedBox(width: 8),
              Text(
                'Delivery Proof Uploaded',
                style: TextStyle(
                  color: Color(0xFF4ADE80),
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.memory(
              _uploadedBytes!,
              height: 160,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    final status =
        (_delivery['status'] ??
                _delivery['delivery']?['status'] ??
                _delivery['delivery_status'] ??
                'assigned')
            .toString();
    final canonicalStatus = _canonicalStatus(status);
    final isPickupLoading = _isUpdating && _updatingStatus == 'picked_up';
    final confirmationBusy =
        _isUpdating || _isVerifyingCode || _isPhotoUploading;

    if (_isDeliveryCompleted || canonicalStatus == 'delivered') {
      return Column(
        children: [
          _buildDeliveryProofCard(),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF15803D).withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF22C55E)),
            ),
            child: const Row(
              children: [
                Icon(Icons.check_circle, color: Color(0xFF4ADE80)),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Delivery Completed Successfully',
                    style: TextStyle(
                      color: Color(0xFF4ADE80),
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const CustomButton(
            text: 'Code Verified',
            onPressed: null,
            backgroundColor: AppColors.primary,
          ),
          const SizedBox(height: 12),
          const CustomButton(
            text: 'Delivery Photo Uploaded',
            onPressed: null,
            backgroundColor: AppColors.surfaceDark,
            textColor: Colors.white,
          ),
        ],
      );
    }

    if (canonicalStatus == 'pending') {
      return const Center(
        child: Text(
          'Waiting for assignment',
          style: TextStyle(color: Colors.grey),
        ),
      );
    }
    if (canonicalStatus == 'assigned') {
      return Column(
        children: [
          CustomButton(
            text: 'Accept Order',
            isLoading: _isUpdating && _updatingStatus == 'accepted',
            onPressed: _isUpdating ? null : () => _updateStatus('accepted'),
          ),
          const SizedBox(height: 12),
          CustomButton(
            text: 'Reject Order',
            isLoading: _isUpdating && _updatingStatus == 'rejected',
            onPressed: _isUpdating ? null : _rejectDelivery,
            backgroundColor: Colors.red,
            textColor: Colors.white,
          ),
        ],
      );
    }
    if (canonicalStatus == 'heading_to_vendor') {
      return CustomButton(
        text: 'Mark Picked Up',
        isLoading: isPickupLoading,
        onPressed: _isUpdating ? null : _markPickedUp,
      );
    }
    if (canonicalStatus == 'picked_up') {
      return CustomButton(
        text: 'Start Delivery',
        isLoading: _isUpdating && _updatingStatus == 'on_the_way',
        onPressed: _isUpdating ? null : () => _updateStatus('on_the_way'),
      );
    }

    // Delivery Confirmation Flow
    if (canonicalStatus == 'on_the_way') {
      return CustomButton(
        text: 'Arrived at Customer',
        isLoading: _isUpdating && _updatingStatus == 'arrived',
        onPressed: _isUpdating ? null : () => _updateStatus('arrived'),
      );
    }

    if (canonicalStatus == 'arrived') {
      return Column(
        children: [
          _buildDeliveryProofCard(),
          CustomButton(
            text: _isCodeVerified
                ? 'Code Verified'
                : 'Confirm Delivery by Code',
            isLoading: _isVerifyingCode,
            onPressed: confirmationBusy || _isCodeVerified ? null : _verifyCode,
            backgroundColor: _isCodeVerified
                ? AppColors.surfaceDark
                : AppColors.primary,
          ),
          const SizedBox(height: 12),
          CustomButton(
            text: 'Take Delivery Photo',
            isLoading: _isPhotoUploading,
            onPressed: confirmationBusy || !_isCodeVerified
                ? null
                : _uploadPhoto,
            backgroundColor: _isCodeVerified
                ? AppColors.primary
                : AppColors.surfaceDark,
            textColor: Colors.white,
          ),
        ],
      );
    }
    return Center(
      child: Text(
        canonicalStatus == 'failed' || canonicalStatus == 'rejected'
            ? 'This delivery is no longer active.'
            : 'No delivery action is available.',
        style: const TextStyle(color: Colors.grey),
        textAlign: TextAlign.center,
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (_canonicalStatus(status)) {
      case 'assigned':
        return Colors.blue;
      case 'heading_to_vendor':
        return Colors.lightBlue;
      case 'picked_up':
        return Colors.orange;
      case 'on_the_way':
        return Colors.amber;
      case 'arrived':
        return Colors.cyan;
      case 'delivered':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }
}

class _DeliveryCodeResult {
  final bool isSuccess;
  final String? errorMessage;

  const _DeliveryCodeResult.success() : isSuccess = true, errorMessage = null;

  const _DeliveryCodeResult.failure(this.errorMessage) : isSuccess = false;
}

class _DeliveryCodeDialog extends StatefulWidget {
  final int codeLength;
  final Future<_DeliveryCodeResult> Function(String code) onVerify;

  const _DeliveryCodeDialog({required this.codeLength, required this.onVerify});

  @override
  State<_DeliveryCodeDialog> createState() => _DeliveryCodeDialogState();
}

class _DeliveryCodeDialogState extends State<_DeliveryCodeDialog> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;
    final code = _controller.text.trim();
    if (code.isEmpty) {
      setState(() => _errorMessage = 'Please enter the delivery code.');
      _focusNode.requestFocus();
      return;
    }
    if (code.length != widget.codeLength || !RegExp(r'^\d+$').hasMatch(code)) {
      setState(() => _errorMessage = 'Enter a valid numeric delivery code.');
      _focusNode.requestFocus();
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    final result = await widget.onVerify(code);
    if (!mounted) return;

    if (result.isSuccess) {
      FocusManager.instance.primaryFocus?.unfocus();
      Navigator.of(context).pop(true);
      return;
    }

    setState(() {
      _isSubmitting = false;
      _errorMessage =
          result.errorMessage ??
          'Invalid delivery code. Please check and try again.';
    });
    _focusNode.requestFocus();
  }

  void _cancel() {
    if (_isSubmitting) return;
    FocusManager.instance.primaryFocus?.unfocus();
    Navigator.of(context).pop(false);
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final horizontalInset = mediaQuery.size.width < 360 ? 14.0 : 24.0;

    return PopScope(
      canPop: !_isSubmitting,
      child: SafeArea(
        child: AnimatedPadding(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: EdgeInsets.fromLTRB(
            horizontalInset,
            20,
            horizontalInset,
            mediaQuery.viewInsets.bottom + 20,
          ),
          child: Center(
            child: SingleChildScrollView(
              child: Material(
                color: AppColors.backgroundDark,
                elevation: 24,
                borderRadius: BorderRadius.circular(24),
                clipBehavior: Clip.antiAlias,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 430),
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Enter Delivery Code',
                            style: TextStyle(
                              color: AppColors.textPrimaryDark,
                              fontSize: 23,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Enter the 6-digit code provided by the customer.',
                            style: TextStyle(
                              color: Colors.white70,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 20),
                          Theme(
                            data: Theme.of(context).copyWith(
                              textSelectionTheme: TextSelectionThemeData(
                                cursorColor: Colors.black,
                                selectionColor: Colors.blue.shade200,
                                selectionHandleColor: AppColors.primary,
                              ),
                            ),
                            child: TextField(
                              controller: _controller,
                              focusNode: _focusNode,
                              autofocus: true,
                              enabled: !_isSubmitting,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: false,
                                    signed: false,
                                  ),
                              textInputAction: TextInputAction.done,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
                                LengthLimitingTextInputFormatter(
                                  widget.codeLength,
                                ),
                              ],
                              textAlign: TextAlign.center,
                              cursorColor: Colors.black,
                              style: const TextStyle(
                                color: Colors.black,
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 6,
                              ),
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: Colors.white,
                                hintText: List.filled(
                                  widget.codeLength,
                                  '0',
                                ).join(),
                                hintStyle: const TextStyle(
                                  color: Color(0xFF64748B),
                                  fontSize: 28,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 6,
                                ),
                                counterText: '',
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 18,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide.none,
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: const BorderSide(
                                    color: Color(0xFFCBD5E1),
                                  ),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: const BorderSide(
                                    color: AppColors.primary,
                                    width: 2,
                                  ),
                                ),
                                disabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: const BorderSide(
                                    color: Color(0xFFCBD5E1),
                                  ),
                                ),
                              ),
                              onChanged: (_) {
                                if (_errorMessage != null) {
                                  setState(() => _errorMessage = null);
                                }
                              },
                              onSubmitted: (_) => _submit(),
                            ),
                          ),
                          AnimatedSize(
                            duration: const Duration(milliseconds: 150),
                            child: _errorMessage == null
                                ? const SizedBox(height: 20)
                                : Padding(
                                    padding: const EdgeInsets.only(top: 10),
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        const Icon(
                                          Icons.error_outline,
                                          color: Color(0xFFF87171),
                                          size: 18,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            _errorMessage!,
                                            softWrap: true,
                                            style: const TextStyle(
                                              color: Color(0xFFFCA5A5),
                                              fontSize: 13,
                                              height: 1.35,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextButton(
                                  onPressed: _isSubmitting ? null : _cancel,
                                  child: const Text('Cancel'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: ElevatedButton(
                                  onPressed: _isSubmitting ? null : _submit,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.primary,
                                    foregroundColor: Colors.white,
                                    minimumSize: const Size.fromHeight(52),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                  child: _isSubmitting
                                      ? const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2.5,
                                          ),
                                        )
                                      : const Text(
                                          'Verify',
                                          style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

enum _PhotoPreviewAction { retake, upload, cancel }

class _DeliveryPhotoPreviewDialog extends StatefulWidget {
  final Uint8List bytes;

  const _DeliveryPhotoPreviewDialog({required this.bytes});

  @override
  State<_DeliveryPhotoPreviewDialog> createState() =>
      _DeliveryPhotoPreviewDialogState();
}

class _DeliveryPhotoPreviewDialogState
    extends State<_DeliveryPhotoPreviewDialog> {
  bool _actionSelected = false;

  void _complete(_PhotoPreviewAction action) {
    if (_actionSelected) return;
    setState(() => _actionSelected = true);
    Navigator.pop(context, action);
  }

  @override
  Widget build(BuildContext context) {
    final horizontalInset = MediaQuery.sizeOf(context).width < 360
        ? 14.0
        : 24.0;
    return SafeArea(
      child: Dialog(
        insetPadding: EdgeInsets.symmetric(
          horizontal: horizontalInset,
          vertical: 20,
        ),
        backgroundColor: AppColors.backgroundDark,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Delivery Photo Preview',
                  style: TextStyle(
                    color: AppColors.textPrimaryDark,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Make sure the delivered order is clearly visible.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 18),
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    constraints: BoxConstraints(
                      minHeight: 180,
                      maxHeight: MediaQuery.sizeOf(context).height * 0.46,
                    ),
                    color: Colors.black,
                    alignment: Alignment.center,
                    child: Image.memory(
                      widget.bytes,
                      fit: BoxFit.contain,
                      gaplessPlayback: true,
                      errorBuilder: (_, _, _) => const Padding(
                        padding: EdgeInsets.all(32),
                        child: Text(
                          'The selected photo cannot be previewed.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.white70),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                OutlinedButton.icon(
                  onPressed: _actionSelected
                      ? null
                      : () => _complete(_PhotoPreviewAction.retake),
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Retake'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(50),
                    side: const BorderSide(color: Colors.white38),
                  ),
                ),
                const SizedBox(height: 10),
                ElevatedButton.icon(
                  onPressed: _actionSelected
                      ? null
                      : () => _complete(_PhotoPreviewAction.upload),
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: const Text('Upload Photo'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(52),
                  ),
                ),
                const SizedBox(height: 4),
                TextButton(
                  onPressed: _actionSelected
                      ? null
                      : () => _complete(_PhotoPreviewAction.cancel),
                  child: const Text('Cancel'),
                ),
              ],
            ),
          ),
        ),
      ),
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
