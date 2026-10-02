import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../models/car_wash_view_data.dart';
import '../widgets/checkout_progress.dart';

/// Car Wash booking flow:
///   1. Select service  2. Add-ons  3. Vehicle details
///   4. Date, time, location & payment  5. Review & confirm
/// All prices shown live; the backend recomputes the authoritative total.
class CarWashBookingScreen extends StatefulWidget {
  const CarWashBookingScreen({super.key});

  @override
  State<CarWashBookingScreen> createState() => _CarWashBookingScreenState();
}

class _CarWashBookingScreenState extends State<CarWashBookingScreen> {
  // Catalog
  Map<String, dynamic>? _vendor;
  List<Map<String, dynamic>> _services = [];
  List<Map<String, dynamic>> _addons = [];
  List<Map<String, dynamic>> _vehicleTypes = [];

  bool _isLoading = true;
  String _errorMessage = '';
  int? _vendorId;
  int? _requestedServiceId;

  // Wizard state
  int _step = 0;
  static const int _lastStep = 4;

  // Selections
  Map<String, dynamic>? _selectedService;
  final Set<int> _selectedAddonIds = {};
  Map<String, dynamic>? _selectedVehicleType;
  String _fallbackVehicleType = '';

  // Vehicle form
  final _brandCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _colorCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();

  // Schedule
  DateTime? _selectedDate;
  String? _selectedTime;
  String _locationMode = 'at_vendor'; // at_vendor | my_address
  // Payment is always Waafi (EVC Plus) — reuses the app's existing integration.
  final _paymentPhoneCtrl = TextEditingController();

  // Validation + submission
  final Map<String, String> _fieldErrors = {};
  bool _submitting = false;
  bool _isProcessing = false;
  CheckoutStage _stage = CheckoutStage.sending;
  String? _stageFailReason;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_vendorId == null) {
      final args =
          ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
      _vendorId = args?['vendorId'] is int
          ? args!['vendorId'] as int
          : int.tryParse('${args?['vendorId']}');
      _requestedServiceId = args?['serviceId'] is int
          ? args!['serviceId'] as int
          : int.tryParse('${args?['serviceId']}');
      _fetchCatalog();
    }
  }

  @override
  void dispose() {
    _brandCtrl.dispose();
    _modelCtrl.dispose();
    _plateCtrl.dispose();
    _colorCtrl.dispose();
    _notesCtrl.dispose();
    _addressCtrl.dispose();
    _paymentPhoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchCatalog() async {
    if (_vendorId == null) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'No service provider selected.';
      });
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });
    try {
      final response = await ApiService.get(
        '/customer/car-wash/vendors/$_vendorId/catalog',
      );
      final body = jsonDecode(response.body);
      if (response.statusCode == 200 && body['success'] == true) {
        final data = body['data'];
        final services = List<Map<String, dynamic>>.from(
          data['services'] ?? [],
        );
        Map<String, dynamic>? requestedService;
        if (_requestedServiceId != null) {
          for (final service in services) {
            if (int.tryParse('${service['id']}') == _requestedServiceId) {
              requestedService = service;
              break;
            }
          }
        }
        if (!mounted) return;
        setState(() {
          _vendor = Map<String, dynamic>.from(data['vendor'] ?? {});
          _services = services;
          _selectedService ??= requestedService;
          _addons = List<Map<String, dynamic>>.from(data['addons'] ?? []);
          _vehicleTypes = List<Map<String, dynamic>>.from(
            data['vehicle_types'] ?? [],
          );
          _isLoading = false;
        });
      } else {
        if (!mounted) return;
        setState(() {
          _errorMessage =
              body['message']?.toString() ??
              'This car service provider is unavailable.';
          _isLoading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _errorMessage = ApiService.connectionErrorMessage;
        _isLoading = false;
      });
    }
  }

  // ── Pricing (mirror of the backend formula, display only) ────────────────
  double _asDouble(dynamic v) =>
      v is num ? v.toDouble() : double.tryParse('$v') ?? 0;

  double get _basePrice => _asDouble(_selectedService?['base_price']);
  double get _vehiclePrice => _asDouble(_selectedVehicleType?['extra_price']);
  double get _addonsPrice => _addons
      .where((a) => _selectedAddonIds.contains(a['id']))
      .fold(0.0, (s, a) => s + _asDouble(a['price']));
  double get _total {
    final t = _basePrice + _vehiclePrice + _addonsPrice;
    return t < 0 ? 0 : t;
  }

  int get _durationMinutes {
    final base = (_selectedService?['estimated_minutes'] ?? 0) as num;
    final extra = _addons
        .where((a) => _selectedAddonIds.contains(a['id']))
        .fold<num>(0, (s, a) => s + ((a['duration_minutes'] ?? 0) as num));
    return (base + extra).toInt();
  }

  // ── Time slots from vendor opening hours ─────────────────────────────────
  List<String> get _timeSlots {
    int parseHour(dynamic t, int fallback) {
      final s = (t ?? '').toString();
      final h = int.tryParse(s.split(':').first);
      return h ?? fallback;
    }

    final open = parseHour(_vendor?['opening_time'], 8);
    final close = parseHour(_vendor?['closing_time'], 20);
    final slots = <String>[];
    for (int h = open; h < close; h++) {
      slots.add('${h.toString().padLeft(2, '0')}:00');
    }
    // For today, drop slots that have already passed.
    if (_selectedDate != null) {
      final now = DateTime.now();
      final isToday =
          _selectedDate!.year == now.year &&
          _selectedDate!.month == now.month &&
          _selectedDate!.day == now.day;
      if (isToday) {
        return slots
            .where((s) => int.parse(s.split(':').first) > now.hour)
            .toList();
      }
    }
    return slots;
  }

  // ── Step validation ──────────────────────────────────────────────────────
  bool _validateStep() {
    _fieldErrors.clear();
    switch (_step) {
      case 0:
        if (_selectedService == null) {
          _fieldErrors['service'] = 'Select a service to continue.';
        }
        break;
      case 2:
        // A vehicle type is required only when the vendor offers any.
        if (_vehicleTypes.isNotEmpty && _selectedVehicleType == null) {
          _fieldErrors['vehicle_type'] = 'Select your vehicle type.';
        }
        if (_plateCtrl.text.trim().isEmpty) {
          _fieldErrors['plate'] = 'Plate number is required.';
        } else if (_plateCtrl.text.trim().length > 20) {
          _fieldErrors['plate'] = 'Plate number is too long.';
        }
        break;
      case 3:
        if (_selectedDate == null) {
          _fieldErrors['date'] = 'Choose a booking date.';
        }
        if (_selectedTime == null) {
          _fieldErrors['time'] = 'Choose a time slot.';
        }
        if (_locationMode == 'my_address' && _addressCtrl.text.trim().isEmpty) {
          _fieldErrors['address'] = 'Enter your address for mobile service.';
        }
        final phoneDigits = _paymentPhoneCtrl.text.replaceAll(
          RegExp(r'\D'),
          '',
        );
        if (phoneDigits.length < 7 || phoneDigits.length > 15) {
          _fieldErrors['payment_phone'] =
              'Enter a valid Waafi/EVC Plus number.';
        }
        break;
    }
    setState(() {});
    return _fieldErrors.isEmpty;
  }

  void _next() {
    if (!_validateStep()) return;
    if (_step < _lastStep) setState(() => _step++);
  }

  void _back() {
    if (_step > 0) {
      setState(() => _step--);
    } else {
      Navigator.pop(context);
    }
  }

  // ── Submission ───────────────────────────────────────────────────────────
  Future<void> _confirmBooking() async {
    // `_isProcessing` stays true while this progress screen is visible, so it
    // cannot be used as a retry guard. Only block an active request.
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _isProcessing = true;
      _stage = CheckoutStage.sending;
      _stageFailReason = null;
    });

    try {
      final dateStr =
          '${_selectedDate!.year}-${_selectedDate!.month.toString().padLeft(2, '0')}-${_selectedDate!.day.toString().padLeft(2, '0')}';

      // Step 1: Sending payment request
      await Future.delayed(const Duration(milliseconds: 600));
      if (mounted) setState(() => _stage = CheckoutStage.awaitingApproval);

      final response = await ApiService.post('/customer/car-wash/bookings', {
        'vendor_id': _vendorId,
        'service_id': _selectedService!['id'],
        'addon_ids': _selectedAddonIds.toList(),
        'vehicle_type_id': _selectedVehicleType?['id'],
        'vehicle_type_name':
            _selectedVehicleType?['name'] ?? _fallbackVehicleType,
        'vehicle_brand': _brandCtrl.text.trim(),
        'vehicle_model': _modelCtrl.text.trim(),
        'vehicle_plate': _plateCtrl.text.trim(),
        'vehicle_color': _colorCtrl.text.trim(),
        'scheduled_date': dateStr,
        'scheduled_time': _selectedTime,
        'service_address': _locationMode == 'my_address'
            ? _addressCtrl.text.trim()
            : 'At car wash location',
        'notes': _notesCtrl.text.trim(),
        'payment_phone': _paymentPhoneCtrl.text.trim(),
      });
      final body = jsonDecode(response.body);
      if (!mounted) return;

      final statusStr = body['status']?.toString();
      final isCancelled = statusStr == 'cancelled';
      final isPaid =
          (response.statusCode == 201 || response.statusCode == 200) &&
          body['success'] == true &&
          (statusStr == 'paid' || statusStr == 'confirmed');
      final isNoWorker =
          response.statusCode == 400 && body['code'] == 'NO_WORKER_AVAILABLE';

      if (isPaid) {
        setState(() => _stage = CheckoutStage.verifying);
        await Future.delayed(const Duration(milliseconds: 500));
        if (mounted) setState(() => _stage = CheckoutStage.creatingOrder);
        await Future.delayed(const Duration(milliseconds: 500));
        if (mounted) setState(() => _stage = CheckoutStage.completed);
        await Future.delayed(const Duration(milliseconds: 1200));

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Payment successful. Your booking has been confirmed.',
              ),
              backgroundColor: AppColors.success,
              duration: Duration(seconds: 4),
            ),
          );
          Navigator.pushNamedAndRemoveUntil(
            context,
            AppRoutes.home,
            (route) => false,
          );
        }
      } else if (isCancelled) {
        setState(() {
          _stage = CheckoutStage.cancelled;
          _stageFailReason =
              'Payment was cancelled on phone. No booking was created.';
        });
      } else if (isNoWorker) {
        final suggested = body['suggestedSlots'] is List
            ? (body['suggestedSlots'] as List).join(', ')
            : '';
        final debug = body['debug'];
        debugPrint('Car wash availability debug: $debug');
        final msg = suggested.isNotEmpty
            ? 'No worker is available at this time. Please choose another time. (Suggested: $suggested)'
            : 'No worker is available at this time. Please choose another time.';
        setState(() {
          _stage = CheckoutStage.failed;
          _stageFailReason = msg;
        });
      } else {
        final rawMessage =
            body['message']?.toString() ??
            'Payment could not be completed. Please try again.';
        final normalized = rawMessage.toLowerCase();
        final isWorkerIssue =
            normalized.contains('no worker is available') ||
            normalized.contains('worker available') ||
            normalized.contains('choose another time');
        final msg = isWorkerIssue ? rawMessage : rawMessage;
        setState(() {
          _stage = CheckoutStage.failed;
          _stageFailReason = msg;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _stage = CheckoutStage.failed;
          _stageFailReason = ApiService.connectionErrorMessage;
        });
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  static const _stepTitles = [
    'Select Service',
    'Add-ons',
    'Vehicle Details',
    'Date & Location',
    'Review Booking',
  ];

  @override
  Widget build(BuildContext context) {
    if (_isProcessing) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      final bgColor = isDark ? AppColors.backgroundDark : AppColors.background;

      return Scaffold(
        backgroundColor: bgColor,
        body: CheckoutProgressView(
          stage: _stage,
          failReason: _stageFailReason,
          canRetry:
              _stage == CheckoutStage.failed ||
              _stage == CheckoutStage.cancelled ||
              _stage == CheckoutStage.timedOut,
          onRetry: () => _confirmBooking(),
          onCancel: () {
            setState(() {
              _isProcessing = false;
              _stageFailReason = null;
            });
          },
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF0F172A)),
          onPressed: _back,
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _vendor?['business_name']?.toString() ?? 'Car Service Booking',
              style: const TextStyle(
                color: Color(0xFF0F172A),
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            Text(
              _stepTitles[_step],
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
            ),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage.isNotEmpty
          ? _buildError()
          : Column(
              children: [
                _buildProgress(),
                Expanded(child: _buildStep()),
                _buildBottomBar(),
              ],
            ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 52, color: Color(0xFF94A3B8)),
            const SizedBox(height: 14),
            Text(
              _errorMessage,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _isLoading ? null : () => _fetchCatalog(),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
              ),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProgress() {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: List.generate(_lastStep + 1, (i) {
          final done = i <= _step;
          return Expanded(
            child: Container(
              margin: EdgeInsets.only(right: i == _lastStep ? 0 : 6),
              height: 4,
              decoration: BoxDecoration(
                color: done ? AppColors.primary : AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case 0:
        return _buildServiceStep();
      case 1:
        return _buildAddonStep();
      case 2:
        return _buildVehicleStep();
      case 3:
        return _buildScheduleStep();
      default:
        return _buildReviewStep();
    }
  }

  // Step 0 — services
  Widget _buildServiceStep() {
    if (_services.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.local_car_wash, size: 52, color: Color(0xFF94A3B8)),
              SizedBox(height: 14),
              Text(
                'This Vendor has not added any Car services yet.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Color(0xFF0F172A),
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'No Car services are available from this Vendor yet.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF64748B), fontSize: 14),
              ),
            ],
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_fieldErrors['service'] != null)
          _errorBanner(_fieldErrors['service']!),
        ..._services.map((s) {
          final selected = _selectedService?['id'] == s['id'];
          final selectService = () => setState(() {
            _selectedService = s;
            _fieldErrors.remove('service');
          });
          return Semantics(
            button: true,
            selected: selected,
            label:
                '${s['name'] ?? 'Car service'}, '
                '\$${_asDouble(s['base_price']).toStringAsFixed(2)}',
            child: GestureDetector(
              onTap: selectService,
              child: Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: selected ? AppColors.primary : AppColors.border,
                    width: selected ? 2 : 1,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.035),
                      blurRadius: 14,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildServiceArtwork(s, selected: selected),
                        const SizedBox(width: 13),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      s['name']?.toString() ?? 'Car Wash',
                                      style: const TextStyle(
                                        color: Color(0xFF0F172A),
                                        fontWeight: FontWeight.w800,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                  if (selected)
                                    const Icon(
                                      Icons.check_circle,
                                      color: AppColors.primary,
                                      size: 21,
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                (s['description'] ?? '')
                                        .toString()
                                        .trim()
                                        .isEmpty
                                    ? 'Professional vehicle care by this vendor.'
                                    : s['description'].toString(),
                                style: const TextStyle(
                                  fontSize: 12,
                                  height: 1.35,
                                  color: Color(0xFF64748B),
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                children: [
                                  _serviceMetaChip(
                                    Icons.schedule_outlined,
                                    '~${s['estimated_minutes'] ?? 0} min',
                                  ),
                                  _serviceMetaChip(
                                    Icons.check_circle_outline,
                                    'Available',
                                    color: const Color(0xFF047857),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'SERVICE PRICE',
                                style: TextStyle(
                                  fontSize: 9,
                                  letterSpacing: 1,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF94A3B8),
                                ),
                              ),
                              Text(
                                '\$${_asDouble(s['base_price']).toStringAsFixed(2)}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFF047857),
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(
                          height: 38,
                          child: ElevatedButton.icon(
                            onPressed: selectService,
                            style: ElevatedButton.styleFrom(
                              elevation: 0,
                              backgroundColor: selected
                                  ? const Color(0xFF0F766E)
                                  : AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            icon: Icon(
                              selected ? Icons.check : Icons.add,
                              size: 16,
                            ),
                            label: Text(
                              selected ? 'Selected' : 'Select service',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
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
          );
        }),
      ],
    );
  }

  Widget _buildServiceArtwork(
    Map<String, dynamic> service, {
    required bool selected,
  }) {
    final imageUrl = CarWashViewData.serviceImage(service);
    final fallback = Container(
      color: selected
          ? AppColors.primary.withValues(alpha: 0.12)
          : const Color(0xFFEFF6FF),
      alignment: Alignment.center,
      child: Icon(
        CarWashViewData.serviceIcon(service['name']),
        color: AppColors.primary,
        size: 34,
      ),
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(15),
      child: SizedBox(
        width: 82,
        height: 82,
        child: imageUrl.isEmpty
            ? fallback
            : Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => fallback,
                loadingBuilder: (_, child, progress) =>
                    progress == null ? child : fallback,
              ),
      ),
    );
  }

  Widget _serviceMetaChip(
    IconData icon,
    String label, {
    Color color = const Color(0xFF475569),
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  // Step 1 — add-ons
  Widget _buildAddonStep() {
    if (_addons.isEmpty) {
      return const Center(
        child: Text(
          'No optional add-ons offered. Continue to the next step.',
          style: TextStyle(color: Color(0xFF64748B)),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _addons.map((a) {
        final selected = _selectedAddonIds.contains(a['id']);
        return GestureDetector(
          onTap: () => setState(() {
            selected
                ? _selectedAddonIds.remove(a['id'])
                : _selectedAddonIds.add(a['id'] as int);
          }),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? AppColors.success : AppColors.border,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  selected ? Icons.check_box : Icons.check_box_outline_blank,
                  color: selected ? AppColors.success : AppColors.border,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        a['name'] ?? '',
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                      Text(
                        '+${a['duration_minutes']} min',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Color(0xFF94A3B8),
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  '+\$${_asDouble(a['price']).toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF16A34A),
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  // Step 2 — vehicle
  // Step 2 — vehicle
  Widget _buildVehicleStep() {
    // Only the vendor's own active vehicle types — no hard-coded list.
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Vehicle type',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: Color(0xFF0F172A),
          ),
        ),
        if (_fieldErrors['vehicle_type'] != null)
          _inlineError(_fieldErrors['vehicle_type']!),
        const SizedBox(height: 8),
        if (_vehicleTypes.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: const Text(
              'This vendor has not configured vehicle types. You can continue — '
              'no vehicle surcharge will be applied.',
              style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            ),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _vehicleTypes.map((vt) {
              final name = vt['name'].toString();
              final selected = _selectedVehicleType?['id'] == vt['id'];
              final extra = _asDouble(vt['extra_price']);
              return GestureDetector(
                onTap: () => setState(() {
                  _selectedVehicleType = vt;
                  _fallbackVehicleType = '';
                  _fieldErrors.remove('vehicle_type');
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.primary.withValues(alpha: 0.1)
                        : AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected ? AppColors.primary : AppColors.border,
                    ),
                  ),
                  child: Text(
                    extra != 0
                        ? '$name  ${extra > 0 ? '+' : ''}\$${extra.toStringAsFixed(2)}'
                        : name,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: selected
                          ? AppColors.primary
                          : const Color(0xFF0F172A),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        const SizedBox(height: 18),
        _textField('Brand (e.g. Toyota)', _brandCtrl, maxLength: 30),
        _textField('Model (e.g. RAV4)', _modelCtrl, maxLength: 30),
        _textField(
          'Plate number *',
          _plateCtrl,
          errorKey: 'plate',
          capitalize: true,
          maxLength: 20,
        ),
        _textField('Color', _colorCtrl, maxLength: 24),
        _textField('Notes (optional)', _notesCtrl, maxLines: 2, maxLength: 250),
      ],
    );
  }

  // Step 3 — schedule + location + payment
  Widget _buildScheduleStep() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Booking date',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: Color(0xFF0F172A),
          ),
        ),
        if (_fieldErrors['date'] != null) _inlineError(_fieldErrors['date']!),
        const SizedBox(height: 8),
        GestureDetector(
          onTap: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: context,
              initialDate: _selectedDate ?? now,
              firstDate: now, // past dates are impossible to pick
              lastDate: now.add(const Duration(days: 30)),
            );
            if (picked != null) {
              setState(() {
                _selectedDate = picked;
                _selectedTime = null;
                _fieldErrors.remove('date');
              });
            }
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.calendar_today,
                  size: 18,
                  color: Color(0xFF2563EB),
                ),
                const SizedBox(width: 10),
                Text(
                  _selectedDate == null
                      ? 'Choose a date'
                      : '${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: _selectedDate == null
                        ? const Color(0xFF64748B)
                        : const Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        const Text(
          'Time slot',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: Color(0xFF0F172A),
          ),
        ),
        if (_fieldErrors['time'] != null) _inlineError(_fieldErrors['time']!),
        const SizedBox(height: 8),
        if (_selectedDate == null)
          const Text(
            'Pick a date first to see available slots.',
            style: TextStyle(fontSize: 13, color: Color(0xFF475569)),
          )
        else if (_timeSlots.isEmpty)
          const Text(
            'No slots remain for this date. Pick another day.',
            style: TextStyle(fontSize: 13, color: Color(0xFFEF4444)),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _timeSlots.map((slot) {
              final selected = _selectedTime == slot;
              return GestureDetector(
                onTap: () => setState(() {
                  _selectedTime = slot;
                  _fieldErrors.remove('time');
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: selected ? AppColors.primary : AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected ? AppColors.primary : AppColors.border,
                    ),
                  ),
                  child: Text(
                    slot,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: selected ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        const SizedBox(height: 18),
        const Text(
          'Service location',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        _radioTile(
          'at_vendor',
          'At car Servives location',
          Icons.storefront_outlined,
        ),
        _radioTile(
          'my_address',
          'Mobile Services at my address',
          Icons.home_outlined,
        ),
        if (_locationMode == 'my_address') ...[
          const SizedBox(height: 8),
          _textField(
            'Your address *',
            _addressCtrl,
            errorKey: 'address',
            maxLength: 200,
          ),
        ],
        const SizedBox(height: 18),
        const Text(
          'Payment',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 8),
        // Waafi is the app's payment provider — no generic methods.
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFECFDF5),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFA7F3D0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.account_balance_wallet,
                    size: 20,
                    color: Color(0xFF059669),
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Waafi (EVC Plus)',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: Color(0xFF065F46),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              const Text(
                'When you confirm, a payment request is sent to your phone. '
                'Approve the EVC prompt to complete your booking.',
                style: TextStyle(fontSize: 12, color: Color(0xFF047857)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _paymentPhoneCtrl,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(15),
                ],
                style: const TextStyle(
                  color: Color(0xFF0F172A),
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
                onChanged: (v) {
                  if (_fieldErrors.containsKey('payment_phone')) {
                    setState(() => _fieldErrors.remove('payment_phone'));
                  }
                },
                decoration: InputDecoration(
                  labelText: 'Waafi / EVC Plus number *',
                  labelStyle: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF475569),
                  ),
                  hintText: '61xxxxxxx',
                  hintStyle: const TextStyle(
                    color: Color(0xFF94A3B8),
                    fontSize: 13,
                  ),
                  errorText: _fieldErrors['payment_phone'],
                  isDense: true,
                  filled: true,
                  fillColor: AppColors.surface,
                  prefixIcon: const Icon(
                    Icons.phone_android,
                    size: 18,
                    color: Color(0xFF059669),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(
                      color: AppColors.primary,
                      width: 1.5,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // Step 4 — review
  Widget _buildReviewStep() {
    final addons = _addons
        .where((a) => _selectedAddonIds.contains(a['id']))
        .toList();
    final vehicleLabel = _selectedVehicleType?['name'] ?? _fallbackVehicleType;
    final vehicleInfo = [
      _brandCtrl.text.trim(),
      _modelCtrl.text.trim(),
      _colorCtrl.text.trim(),
    ].where((x) => x.isNotEmpty).join(' • ');

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _reviewCard('Vendor', [
          _reviewRow(
            Icons.storefront_outlined,
            _vendor?['business_name']?.toString() ?? '',
          ),
          if ((_vendor?['address'] ?? '').toString().isNotEmpty)
            _reviewRow(
              Icons.location_on_outlined,
              _vendor!['address'].toString(),
            ),
        ]),
        _reviewCard('Service', [
          _reviewRow(
            Icons.local_car_wash_outlined,
            '${_selectedService?['name']}  —  \$${_basePrice.toStringAsFixed(2)}',
          ),
          _reviewRow(Icons.timer_outlined, '~$_durationMinutes min total'),
          ...addons.map(
            (a) => _reviewRow(
              Icons.add_circle_outline,
              '${a['name']}  +\$${_asDouble(a['price']).toStringAsFixed(2)}',
            ),
          ),
        ]),
        _reviewCard('Vehicle', [
          _reviewRow(
            Icons.directions_car_outlined,
            '$vehicleLabel — ${_plateCtrl.text.trim().toUpperCase()}',
          ),
          if (vehicleInfo.isNotEmpty)
            _reviewRow(Icons.info_outline, vehicleInfo),
        ]),
        _reviewCard('Schedule', [
          _reviewRow(
            Icons.calendar_today_outlined,
            '${_selectedDate?.day}/${_selectedDate?.month}/${_selectedDate?.year} at $_selectedTime',
          ),
          _reviewRow(
            Icons.place_outlined,
            _locationMode == 'my_address'
                ? 'Mobile Services at my address: ${_addressCtrl.text.trim()}'
                : 'At car Servives location',
          ),
          _reviewRow(
            Icons.account_balance_wallet_outlined,
            'Waafi (EVC Plus) — ${_paymentPhoneCtrl.text.trim()}',
          ),
        ]),
        _priceBreakdown(),
      ],
    );
  }

  Widget _priceBreakdown() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          _priceRow('Service price', _basePrice),
          if (_vehiclePrice != 0)
            _priceRow('Vehicle adjustment', _vehiclePrice),
          if (_addonsPrice > 0) _priceRow('Add-ons', _addonsPrice),
          const Divider(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Total',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              Text(
                '\$${_total.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF16A34A),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _priceRow(String label, double value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
          ),
          Text(
            '\$${value.toStringAsFixed(2)}',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar() {
    final isReview = _step == _lastStep;
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        12 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Total',
                style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
              ),
              Text(
                '\$${_total.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF16A34A),
                ),
              ),
            ],
          ),
          const SizedBox(width: 16),
          Expanded(
            child: SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _submitting
                    ? null
                    : isReview
                    ? _confirmBooking
                    : _next,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: AppColors.primary.withValues(
                    alpha: 0.5,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        isReview ? 'Confirm & Pay with Waafi' : 'Continue',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Small helpers ────────────────────────────────────────────────────────
  Widget _textField(
    String label,
    TextEditingController ctrl, {
    String? errorKey,
    int maxLines = 1,
    bool capitalize = false,
    int? maxLength,
  }) {
    final error = errorKey != null ? _fieldErrors[errorKey] : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: ctrl,
        maxLines: maxLines,
        maxLength: maxLength,
        maxLengthEnforcement: MaxLengthEnforcement.enforced,
        style: const TextStyle(
          color: Color(0xFF0F172A),
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
        textCapitalization: capitalize
            ? TextCapitalization.characters
            : TextCapitalization.words,
        onChanged: (v) {
          if (errorKey != null && _fieldErrors.containsKey(errorKey)) {
            setState(() => _fieldErrors.remove(errorKey));
          }
        },
        decoration: InputDecoration(
          labelText: label,
          labelStyle: const TextStyle(fontSize: 13, color: Color(0xFF475569)),
          hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
          errorText: error,
          isDense: true,
          filled: true,
          fillColor: AppColors.surface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: AppColors.primary, width: 1.5),
          ),
        ),
      ),
    );
  }

  Widget _radioTile(String value, String label, IconData icon) {
    final selected = _locationMode == value;
    return GestureDetector(
      onTap: () => setState(() => _locationMode = value),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.08)
              : AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.primary : const Color(0xFFCBD5E1),
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 20,
              color: selected ? AppColors.primary : const Color(0xFF64748B),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: selected ? AppColors.primary : const Color(0xFF0F172A),
                ),
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              size: 20,
              color: selected ? AppColors.primary : const Color(0xFFCBD5E1),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorBanner(String message) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        message,
        style: const TextStyle(color: Color(0xFFEF4444), fontSize: 13),
      ),
    );
  }

  Widget _inlineError(String message) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        message,
        style: const TextStyle(color: Color(0xFFEF4444), fontSize: 12),
      ),
    );
  }

  Widget _reviewCard(String title, List<Widget> rows) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: Color(0xFF475569),
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 8),
          ...rows,
        ],
      ),
    );
  }

  Widget _reviewRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: const Color(0xFF2563EB)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Color(0xFF0F172A),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
