import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/customer_notification_service.dart';
import '../../../../core/utils/api_service.dart';
import '../models/car_wash_view_data.dart';

/// Customer receipt and live tracker for one Car Wash booking.
///
/// Customer notification socket updates trigger an immediate refresh. Polling
/// is retained as a safe fallback while a booking is still active.
class CarWashBookingDetailsScreen extends StatefulWidget {
  const CarWashBookingDetailsScreen({super.key});

  @override
  State<CarWashBookingDetailsScreen> createState() =>
      _CarWashBookingDetailsScreenState();
}

class _CarWashBookingDetailsScreenState
    extends State<CarWashBookingDetailsScreen>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _booking;
  int? _bookingId;
  bool _loading = true;
  bool _fetching = false;
  bool _cancelling = false;
  bool _paying = false;
  bool _reviewing = false;
  String _error = '';
  Timer? _pollTimer;
  Timer? _socketDebounce;
  CustomerNotificationService? _notifications;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bookingId == null) {
      final raw = ModalRoute.of(context)?.settings.arguments;
      final args =
          raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
      _bookingId = int.tryParse(
        '${args['bookingId'] ?? args['booking_id'] ?? args['id'] ?? ''}',
      );
      unawaited(_fetchBooking(showLoader: true));
    }

    final service = context.read<CustomerNotificationService>();
    if (!identical(service, _notifications)) {
      _notifications?.removeListener(_onNotification);
      _notifications = service..addListener(_onNotification);
      unawaited(service.start());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_fetchBooking());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    _socketDebounce?.cancel();
    _notifications?.removeListener(_onNotification);
    super.dispose();
  }

  void _onNotification() {
    if (!mounted || _booking == null) return;
    _socketDebounce?.cancel();
    _socketDebounce = Timer(
      const Duration(milliseconds: 450),
      () => unawaited(_fetchBooking()),
    );
  }

  void _startPolling() {
    _pollTimer?.cancel();
    if (_booking == null ||
        CarWashViewData.isTerminal(_booking!['status'])) {
      return;
    }
    _pollTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => unawaited(_fetchBooking()),
    );
  }

  Future<void> _fetchBooking({bool showLoader = false}) async {
    if (_bookingId == null) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Booking not found.';
        });
      }
      return;
    }
    if (_fetching) return;
    _fetching = true;
    final previous = _booking == null
        ? null
        : CarWashViewData.normalizeStatus(_booking!['status']);
    if (showLoader && mounted) setState(() => _loading = true);

    try {
      final response =
          await ApiService.get('/customer/car-wash/bookings/$_bookingId');
      final decoded =
          response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
      if (!mounted) return;
      if (response.statusCode == 200 &&
          decoded is Map &&
          decoded['success'] == true &&
          decoded['data'] is Map) {
        final next = Map<String, dynamic>.from(decoded['data']);
        final nextStatus = CarWashViewData.normalizeStatus(next['status']);
        setState(() {
          _booking = next;
          _loading = false;
          _error = '';
        });
        _startPolling();
        if (previous != null && previous != nextStatus) {
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(
              SnackBar(
                content: Text(CarWashViewData.statusMessage(nextStatus)),
                backgroundColor: CarWashViewData.statusColor(nextStatus),
              ),
            );
        }
      } else {
        setState(() {
          _loading = false;
          _error = decoded is Map
              ? decoded['message']?.toString() ?? 'Booking not found.'
              : 'Booking not found.';
        });
      }
    } catch (_) {
      if (mounted && _booking == null) {
        setState(() {
          _loading = false;
          _error = ApiService.connectionErrorMessage;
        });
      }
    } finally {
      _fetching = false;
    }
  }

  double _number(dynamic value) => value is num
      ? value.toDouble()
      : double.tryParse('$value') ?? 0;

  bool _bool(dynamic value) =>
      value == true ||
      value == 1 ||
      value?.toString() == '1' ||
      value?.toString().toLowerCase() == 'true';

  String _value(List<String> keys, {String fallback = ''}) {
    for (final key in keys) {
      final value = _booking?[key];
      if (value != null && value.toString().trim().isNotEmpty) {
        return value.toString().trim();
      }
    }
    return fallback;
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final status = CarWashViewData.normalizeStatus(_booking?['status']);
    final canCancel = const {'pending', 'confirmed'}.contains(status);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF0F172A)),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Booking Details',
          style: TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh booking',
            onPressed: _fetching ? null : _fetchBooking,
            icon: const Icon(Icons.refresh, color: Color(0xFF475569)),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _booking == null
              ? _errorView()
              : RefreshIndicator(
                  onRefresh: _fetchBooking,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(16),
                    children: [
                      Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 720),
                          child: Column(
                            children: [
                              _statusHeader(status),
                              const SizedBox(height: 14),
                              _timeline(status),
                              const SizedBox(height: 14),
                              _vendorServiceCard(),
                              const SizedBox(height: 14),
                              _bookingCard(),
                              const SizedBox(height: 14),
                              _vehicleWorkerCard(),
                              if (_addons.isNotEmpty) ...[
                                const SizedBox(height: 14),
                                _addonsCard(),
                              ],
                              if (_customerNotes.isNotEmpty) ...[
                                const SizedBox(height: 14),
                                _notesCard(),
                              ],
                              const SizedBox(height: 14),
                              _paymentCard(status),
                              const SizedBox(height: 14),
                              _priceCard(),
                              const SizedBox(height: 14),
                              _recordCard(),
                              if (status == 'completed') ...[
                                const SizedBox(height: 14),
                                _completionCard(),
                              ],
                              if (canCancel) ...[
                                const SizedBox(height: 20),
                                SizedBox(
                                  width: double.infinity,
                                  height: 48,
                                  child: OutlinedButton.icon(
                                    onPressed:
                                        _cancelling ? null : _cancelBooking,
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: AppColors.error,
                                      side: const BorderSide(
                                        color: Color(0xFFDC2626),
                                      ),
                                    ),
                                    icon: _cancelling
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : const Icon(Icons.cancel_outlined),
                                    label: const Text('Cancel Booking'),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
    );
  }

  Widget _errorView() => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.cloud_off_outlined,
                size: 52,
                color: Color(0xFF94A3B8),
              ),
              const SizedBox(height: 12),
              Text(_error, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => _fetchBooking(showLoader: true),
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );

  Widget _statusHeader(String status) {
    final color = CarWashViewData.statusColor(status);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            color.withValues(alpha: 0.13),
            color.withValues(alpha: 0.035),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  CarWashViewData.statusIcon(status),
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      CarWashViewData.statusLabel(status),
                      style: TextStyle(
                        color: color,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      CarWashViewData.statusMessage(status),
                      style: const TextStyle(
                        color: Color(0xFF475569),
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.82),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'BOOKING REFERENCE',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.2,
                    color: Color(0xFF64748B),
                    fontWeight: FontWeight.w800,
                  ),
                ),
                SelectableText(
                  CarWashViewData.bookingReference(_booking!),
                  style: const TextStyle(
                    fontSize: 19,
                    letterSpacing: 0.8,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _timeline(String status) {
    final items = CarWashViewData.timeline(_booking!);
    return _section(
      'Booking Tracking',
      Icons.route_outlined,
      [
        ...List.generate(items.length, (index) {
          final item = items[index];
          final completed = item.reached && !item.isCurrent;
          final color = item.isCurrent
              ? CarWashViewData.statusColor(item.status)
              : completed
                  ? const Color(0xFF047857)
                  : const Color(0xFFCBD5E1);
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: item.reached ? color : const Color(0xFFF8FAFC),
                      shape: BoxShape.circle,
                      border: Border.all(color: color, width: 2),
                    ),
                    child: Icon(
                      completed ? Icons.check : item.icon,
                      size: 16,
                      color:
                          item.reached ? Colors.white : const Color(0xFF94A3B8),
                    ),
                  ),
                  if (index < items.length - 1)
                    Container(
                      width: 2,
                      height: item.formattedTime.isEmpty ? 29 : 40,
                      color: completed
                          ? const Color(0xFF047857)
                          : const Color(0xFFE2E8F0),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.label,
                              style: TextStyle(
                                color: item.reached
                                    ? const Color(0xFF0F172A)
                                    : const Color(0xFF94A3B8),
                                fontSize: 13,
                                fontWeight: item.reached
                                    ? FontWeight.w800
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                          if (item.isCurrent)
                            Text(
                              'CURRENT',
                              style: TextStyle(
                                color: color,
                                fontSize: 8,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                        ],
                      ),
                      if (item.formattedTime.isNotEmpty)
                        Text(
                          item.formattedTime,
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 10,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          );
        }),
        if (const {'cancelled', 'rejected', 'payment_failed'}.contains(status))
          _terminalNotice(status),
      ],
      trailing: CarWashViewData.isTerminal(status)
          ? null
          : const Text(
              'LIVE',
              style: TextStyle(
                color: Color(0xFF047857),
                fontSize: 9,
                fontWeight: FontWeight.w900,
              ),
            ),
    );
  }

  Widget _terminalNotice(String status) {
    final color = CarWashViewData.statusColor(status);
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(CarWashViewData.statusIcon(status), color: color, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              CarWashViewData.statusMessage(status),
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _vendorServiceCard() {
    final logo = CarWashViewData.imageUrl(
      _booking!['vendor_logo'] ?? _booking!['logo'],
    );
    final fallback = Container(
      color: const Color(0xFFEFF6FF),
      child: const Icon(Icons.storefront_outlined, color: AppColors.primary),
    );
    return _section('Vendor & Service', Icons.local_car_wash_outlined, [
      Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              width: 58,
              height: 58,
              child: logo.isEmpty
                  ? fallback
                  : Image.network(
                      logo,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => fallback,
                      loadingBuilder: (_, child, progress) =>
                          progress == null ? child : fallback,
                    ),
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  CarWashViewData.vendorName(_booking!),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text(
                  CarWashViewData.serviceName(_booking!),
                  style: const TextStyle(
                    color: Color(0xFF475569),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ]);
  }

  Widget _bookingCard() => _section(
        'Booking Information',
        Icons.event_note_outlined,
        [
          _detail(
            Icons.confirmation_number_outlined,
            'Reference',
            CarWashViewData.bookingReference(_booking!),
          ),
          _detail(
            Icons.calendar_month_outlined,
            'Date & time',
            CarWashViewData.scheduledDateTime(_booking!),
          ),
          if (_serviceLocation.isNotEmpty)
            _detail(
              Icons.location_on_outlined,
              'Service location',
              _serviceLocation,
            ),
        ],
      );

  Widget _vehicleWorkerCard() {
    final type =
        _value(const ['vehicle_type_name', 'vehicle_type'], fallback: 'Vehicle');
    final plate = _value(const ['vehicle_plate', 'plate_number', 'plate']);
    final brand = _value(const ['vehicle_brand', 'brand']);
    final model = _value(const ['vehicle_model', 'model']);
    final color = _value(const ['vehicle_color', 'color']);
    final makeModel = [brand, model].where((part) => part.isNotEmpty).join(' ');
    final legacyVehicle = _legacyNote('Vehicle');
    final worker = _value(const ['worker_name', 'assigned_worker_name']);
    final workerPhone =
        _value(const ['worker_phone', 'assigned_worker_phone']);
    return _section('Vehicle & Worker', Icons.directions_car_outlined, [
      _detail(
        Icons.directions_car_outlined,
        'Vehicle',
        [type, plate].where((part) => part.isNotEmpty).join(' - '),
      ),
      if (makeModel.isNotEmpty || legacyVehicle.isNotEmpty)
        _detail(
          Icons.info_outline,
          'Brand & model',
          makeModel.isNotEmpty ? makeModel : legacyVehicle,
        ),
      if (color.isNotEmpty)
        _detail(Icons.palette_outlined, 'Color', color),
      const Divider(height: 22),
      _detail(
        Icons.engineering_outlined,
        'Assigned worker',
        worker.isEmpty ? 'Not assigned yet' : worker,
        muted: worker.isEmpty,
      ),
      if (workerPhone.isNotEmpty)
        _detail(Icons.phone_outlined, 'Worker phone', workerPhone),
    ]);
  }

  List<Map<String, dynamic>> get _addons {
    final raw = _booking?['addons'] ?? _booking?['add_ons'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Widget _addonsCard() => _section(
        'Add-ons',
        Icons.add_circle_outline,
        _addons
            .map(
              (addon) => _detail(
                Icons.check_circle_outline,
                addon['name']?.toString() ?? 'Add-on',
                '+\$${_number(addon['price']).toStringAsFixed(2)}',
              ),
            )
            .toList(),
      );

  String _legacyNote(String label) {
    final raw = _value(const ['notes', 'customer_notes']);
    for (final line in raw.split('\n')) {
      if (line.toLowerCase().startsWith('${label.toLowerCase()}:')) {
        return line.substring(line.indexOf(':') + 1).trim();
      }
    }
    return '';
  }

  String get _serviceLocation {
    final direct = _value(const [
      'service_address',
      'service_location',
      'location',
      'address',
    ]);
    return direct.isNotEmpty ? direct : _legacyNote('Location');
  }

  String get _customerNotes {
    return _value(const ['customer_notes', 'notes'])
        .split('\n')
        .where((line) {
          final value = line.trim().toLowerCase();
          return value.isNotEmpty &&
              !value.startsWith('vehicle:') &&
              !value.startsWith('location:');
        })
        .join('\n')
        .trim();
  }

  Widget _notesCard() => _section('Customer Notes', Icons.notes_outlined, [
        Text(
          _customerNotes,
          style: const TextStyle(
            color: Color(0xFF475569),
            fontSize: 13,
            height: 1.45,
          ),
        ),
      ]);

  Widget _paymentCard(String status) {
    final raw = _value(const ['payment_status'], fallback: 'unpaid')
        .toLowerCase();
    final paid = const {'paid', 'completed'}.contains(raw);
    final failed = const {'failed', 'declined', 'payment_failed'}.contains(raw);
    final label = paid
        ? 'Paid'
        : raw == 'refunded'
            ? 'Refunded'
            : failed
                ? 'Payment Failed'
                : 'Unpaid';
    final color = paid
        ? const Color(0xFF047857)
        : failed
            ? const Color(0xFFDC2626)
            : const Color(0xFFF59E0B);
    final reference = _value(const [
      'transaction_reference',
      'transaction_ref',
      'payment_reference',
      'payment_ref',
    ]);
    final canPay = !paid && const {'pending', 'confirmed'}.contains(status);
    return _section('Payment', Icons.account_balance_wallet_outlined, [
      _detail(
        Icons.wallet_outlined,
        'Payment method',
        _paymentMethod(_value(const ['payment_method'], fallback: 'waafi')),
      ),
      _statusDetail('Payment status', label, color),
      if (reference.isNotEmpty)
        _detail(Icons.receipt_long_outlined, 'Transaction ref', reference),
      if (paid)
        _detail(
          Icons.schedule_outlined,
          'Paid on',
          CarWashViewData.formatDateTime(
            _booking!['paid_at'] ?? _booking!['payment_date'],
          ),
        ),
      if (canPay) ...[
        const SizedBox(height: 4),
        SizedBox(
          width: double.infinity,
          height: 46,
          child: ElevatedButton.icon(
            onPressed: _paying ? null : _showPaySheet,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF047857),
              foregroundColor: Colors.white,
            ),
            icon: _paying
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.phone_android_outlined),
            label: Text(_paying ? 'Sending request...' : 'Pay Now with Waafi'),
          ),
        ),
      ],
    ]);
  }

  String _paymentMethod(String raw) {
    switch (raw.toLowerCase()) {
      case 'waafi':
      case 'evc':
      case 'evc_plus':
        return 'Waafi (EVC Plus)';
      case 'cash':
      case 'cash_on_delivery':
        return 'Cash';
      case 'card':
        return 'Payment Card';
      default:
        return raw.replaceAll('_', ' ');
    }
  }

  Widget _statusDetail(String label, String value, Color color) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          children: [
            const Icon(
              Icons.payments_outlined,
              size: 18,
              color: Color(0xFF64748B),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 112,
              child: Text(
                label,
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Text(
                value,
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      );

  Widget _priceCard() => _section('Price Breakdown', Icons.receipt_outlined, [
        _price('Service', _number(_booking!['base_price'])),
        if (_number(_booking!['vehicle_price']) != 0)
          _price('Vehicle adjustment', _number(_booking!['vehicle_price'])),
        if (_number(_booking!['addons_price']) > 0)
          _price('Add-ons', _number(_booking!['addons_price'])),
        if (_number(_booking!['discount']) > 0)
          _price('Discount', -_number(_booking!['discount'])),
        const Divider(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Final Total',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
            ),
            Text(
              '\$${_number(_booking!['total_price']).toStringAsFixed(2)}',
              style: const TextStyle(
                color: Color(0xFF047857),
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ]);

  Widget _price(String label, double amount) => Padding(
        padding: const EdgeInsets.only(bottom: 7),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontSize: 13,
              ),
            ),
            Text(
              '\$${amount.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      );

  Widget _recordCard() {
    final completed = _booking!['completed_at'] ??
        _booking!['finished_at'] ??
        _booking!['completion_date'];
    return _section('Booking Record', Icons.history_outlined, [
      _detail(
        Icons.add_circle_outline,
        'Created',
        CarWashViewData.formatDateTime(_booking!['created_at']),
      ),
      if (completed != null && completed.toString().isNotEmpty)
        _detail(
          Icons.task_alt,
          'Completed',
          CarWashViewData.formatDateTime(completed),
        ),
    ]);
  }

  Widget _completionCard() {
    final reviewed =
        _bool(_booking!['has_review'] ?? _booking!['review_submitted']);
    final canReview = !reviewed &&
        _bool(
          _booking!['can_review'] ??
              _booking!['review_allowed'] ??
              _booking!['supports_review'],
        );
    final vendorId = int.tryParse('${_booking!['vendor_id'] ?? ''}');
    final serviceId = int.tryParse('${_booking!['service_id'] ?? ''}');
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFECFDF5),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFA7F3D0)),
      ),
      child: Column(
        children: [
          const Icon(Icons.verified, color: Color(0xFF047857), size: 38),
          const SizedBox(height: 8),
          const Text(
            'Your Car service has been completed.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFF065F46),
              fontSize: 15,
              fontWeight: FontWeight.w900,
            ),
          ),
          if (reviewed)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text(
                'Thank you for rating this service.',
                style: TextStyle(color: Color(0xFF047857), fontSize: 12),
              ),
            ),
          if (canReview || vendorId != null) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                if (canReview)
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _reviewing ? null : _showReviewSheet,
                      icon: const Icon(Icons.star_outline),
                      label: const Text('Rate Service'),
                    ),
                  ),
                if (canReview && vendorId != null) const SizedBox(width: 8),
                if (vendorId != null)
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => Navigator.pushNamed(
                        context,
                        AppRoutes.carWashBooking,
                        arguments: {
                          'vendorId': vendorId,
                          if (serviceId != null) 'serviceId': serviceId,
                        },
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF047857),
                        foregroundColor: Colors.white,
                      ),
                      icon: const Icon(Icons.replay),
                      label: const Text('Book Again'),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _cancelBooking() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel booking?'),
        content: const Text(
          'The vendor will be notified. This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep booking'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Cancel booking'),
          ),
        ],
      ),
    );
    if (accepted != true || _cancelling) return;
    setState(() => _cancelling = true);
    try {
      final response = await ApiService.patch(
        '/customer/car-wash/bookings/$_bookingId/cancel',
        {},
      );
      final body =
          response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
      if (!mounted) return;
      if (response.statusCode == 200 &&
          body is Map &&
          body['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Your booking has been cancelled.')),
        );
        await _fetchBooking();
      } else {
        _showError(
          body is Map
              ? body['message']?.toString() ?? 'Could not cancel booking.'
              : 'Could not cancel booking.',
        );
      }
    } catch (_) {
      if (mounted) _showError(ApiService.connectionErrorMessage);
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  Future<void> _showPaySheet() async {
    final phone = TextEditingController();
    String? error;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            20 + MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Pay with Waafi',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phone,
                autofocus: true,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: 'Waafi / EVC Plus number',
                  errorText: error,
                  border: const OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    final digits = phone.text.replaceAll(RegExp(r'\D'), '');
                    if (digits.length < 7 || digits.length > 15) {
                      setSheetState(
                        () => error = 'Enter a valid Waafi/EVC Plus number.',
                      );
                      return;
                    }
                    final value = phone.text.trim();
                    Navigator.pop(sheetContext);
                    unawaited(_payNow(value));
                  },
                  child: const Text('Send Payment Request'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    phone.dispose();
  }

  Future<void> _payNow(String phone) async {
    if (_paying) return;
    setState(() => _paying = true);
    try {
      final response = await ApiService.post(
        '/customer/car-wash/bookings/$_bookingId/pay',
        {'payment_phone': phone},
      );
      final body =
          response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
      if (!mounted) return;
      final data = body is Map ? body['data'] : null;
      final payment = data is Map && data['payment'] is Map
          ? Map<String, dynamic>.from(data['payment'])
          : <String, dynamic>{};
      if (response.statusCode == 200 &&
          body is Map &&
          body['success'] == true &&
          payment['status'] == 'paid') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment confirmed.')),
        );
      } else {
        _showError(
          (payment['message'] ??
                  (body is Map ? body['message'] : null) ??
                  'Payment failed. Please try again.')
              .toString(),
        );
      }
      await _fetchBooking();
    } catch (_) {
      if (mounted) _showError(ApiService.connectionErrorMessage);
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  Future<void> _showReviewSheet() async {
    var rating = 5;
    final comment = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            20 + MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Rate your Car Wash',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (index) => IconButton(
                    onPressed: () => setSheetState(() => rating = index + 1),
                    icon: Icon(
                      index < rating ? Icons.star : Icons.star_border,
                      color: const Color(0xFFF59E0B),
                    ),
                  ),
                ),
              ),
              TextField(
                controller: comment,
                maxLength: 1000,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Write a review (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    final value = comment.text.trim();
                    Navigator.pop(sheetContext);
                    unawaited(_submitReview(rating, value));
                  },
                  child: const Text('Submit Review'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    comment.dispose();
  }

  Future<void> _submitReview(int rating, String comment) async {
    if (_reviewing) return;
    setState(() => _reviewing = true);
    try {
      final response = await ApiService.post(
        '/customer/car-wash/bookings/$_bookingId/rate',
        {'rating': rating, 'comment': comment},
      );
      final body =
          response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
      if (!mounted) return;
      if ((response.statusCode == 200 || response.statusCode == 201) &&
          body is Map &&
          body['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thank you for your review.')),
        );
        await _fetchBooking();
      } else {
        _showError(
          body is Map
              ? body['message']?.toString() ?? 'Review could not be submitted.'
              : 'Review could not be submitted.',
        );
      }
    } catch (_) {
      if (mounted) _showError(ApiService.connectionErrorMessage);
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  Widget _section(
    String title,
    IconData icon,
    List<Widget> children, {
    Widget? trailing,
  }) =>
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                if (trailing != null) trailing,
              ],
            ),
            const Divider(height: 22),
            ...children,
          ],
        ),
      );

  Widget _detail(
    IconData icon,
    String label,
    String value, {
    bool muted = false,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: const Color(0xFF64748B)),
            const SizedBox(width: 10),
            SizedBox(
              width: 112,
              child: Text(
                label,
                style: const TextStyle(
                  color: Color(0xFF64748B),
                  fontSize: 12,
                ),
              ),
            ),
            Expanded(
              child: Text(
                value.isEmpty ? 'Not provided' : value,
                style: TextStyle(
                  color:
                      muted ? const Color(0xFF94A3B8) : const Color(0xFF0F172A),
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
}
