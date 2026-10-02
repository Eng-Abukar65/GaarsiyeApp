import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../models/time_slot_model.dart';
import '../models/cart_item_model.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/server_time_service.dart';

const Color _kOrange = Color(0xFFF97316);

class DeliveryTimeSelectionScreen extends StatefulWidget {
  const DeliveryTimeSelectionScreen({super.key});

  @override
  State<DeliveryTimeSelectionScreen> createState() =>
      _DeliveryTimeSelectionScreenState();
}

class _DeliveryTimeSelectionScreenState
    extends State<DeliveryTimeSelectionScreen> {
  // ── Time-slot configuration ────────────────────────────────────────────────
  static const int _slotIntervalMinutes = 30; // configurable slot spacing
  // Per-slot booking capacity. When a slot's booked count reaches this it is
  // shown as "Fully Booked" and disabled. Booked counts are keyed by an
  // ISO-ish slot key so this can be populated from the backend later.
  static const int _slotCapacity = 10;
  final Map<String, int> _bookedCounts = <String, int>{};

  // Delivery periods. Times are hidden until a period is selected/expanded.
  // `start`/`end` are 24h boundaries (end is exclusive; 24 = midnight next day).
  static const List<Map<String, dynamic>> _periods = <Map<String, dynamic>>[
    {'name': 'Morning', 'emoji': '🌅', 'icon': Icons.wb_twilight, 'start': 6, 'end': 12},
    {'name': 'Afternoon', 'emoji': '☀️', 'icon': Icons.wb_sunny, 'start': 12, 'end': 18},
    {'name': 'Evening', 'emoji': '🌙', 'icon': Icons.nightlight_round, 'start': 18, 'end': 24},
    {'name': 'Midnight', 'emoji': '🌃', 'icon': Icons.bedtime, 'start': 0, 'end': 6},
  ];

  int _selectedDateIndex = 0; // 0 = Today, 1 = Tomorrow
  DateTime? _selectedTime; // the chosen delivery time
  int _expandedPeriod = -1; // index of the currently expanded period (-1 = none)

  // Express is the only delivery option and is always selected.
  final TimeSlotModel _express = TimeSlotModel.slots.firstWhere(
    (s) => s.isExpress,
    orElse: () => TimeSlotModel.slots.first,
  );

  final List<String> _dateLabels = const <String>['Today', 'Tomorrow'];

  String _slotKey(DateTime t) =>
      '${t.year}-${t.month}-${t.day}-${t.hour}-${t.minute}';

  bool _isFullyBooked(DateTime t) =>
      (_bookedCounts[_slotKey(t)] ?? 0) >= _slotCapacity;

  // Generates the 30-minute slots for a single period on the given day. For
  // today, only times strictly in the future are returned.
  List<DateTime> _slotsForPeriod(int dayIndex, int periodIndex) {
    // Server-corrected clock: changing the phone's date/time must not change
    // which slots are offered. The backend re-validates the chosen slot anyway.
    final now = ServerTimeService.now();
    final base = DateTime(now.year, now.month, now.day).add(
      Duration(days: dayIndex),
    );
    final p = _periods[periodIndex];

    DateTime cursor = DateTime(
      base.year,
      base.month,
      base.day,
    ).add(Duration(hours: p['start'] as int));
    final DateTime end = DateTime(
      base.year,
      base.month,
      base.day,
    ).add(Duration(hours: p['end'] as int)); // exclusive; handles end == 24

    final slots = <DateTime>[];
    while (cursor.isBefore(end)) {
      if (dayIndex != 0 || cursor.isAfter(now)) slots.add(cursor);
      cursor = cursor.add(const Duration(minutes: _slotIntervalMinutes));
    }
    return slots;
  }

  // Period indices that still have at least one slot for the given day.
  List<int> _visiblePeriods(int dayIndex) {
    final result = <int>[];
    for (int p = 0; p < _periods.length; p++) {
      if (_slotsForPeriod(dayIndex, p).isNotEmpty) result.add(p);
    }
    return result;
  }

  // Which period a given time falls into (Morning/Afternoon/Evening/Midnight).
  int _periodIndexOf(DateTime t) {
    final h = t.hour;
    if (h >= 6 && h < 12) return 0;
    if (h >= 12 && h < 18) return 1;
    if (h >= 18) return 2;
    return 3; // 00:00–05:59
  }

  // 12-hour clock label, e.g. "10:30 AM".
  String _fmtTime(DateTime t) {
    final hour12 = t.hour == 0 ? 12 : (t.hour > 12 ? t.hour - 12 : t.hour);
    final minute = t.minute.toString().padLeft(2, '0');
    final period = t.hour >= 12 ? 'PM' : 'AM';
    return '$hour12:$minute $period';
  }

  // Human range label for a period header, e.g. "6:00 AM – 12:00 PM".
  String _periodRange(int periodIndex) {
    final p = _periods[periodIndex];
    String hourLabel(int h) {
      final hh = h % 24;
      final suffix = hh >= 12 ? 'PM' : 'AM';
      int display = hh % 12;
      if (display == 0) display = 12;
      return '$display:00 $suffix';
    }

    return '${hourLabel(p['start'] as int)} – ${hourLabel(p['end'] as int)}';
  }

  // Picks the first bookable slot for the given day, with its period index.
  ({DateTime time, int period})? _firstAvailable(int dayIndex) {
    for (int p = 0; p < _periods.length; p++) {
      for (final t in _slotsForPeriod(dayIndex, p)) {
        if (!_isFullyBooked(t)) return (time: t, period: p);
      }
    }
    return null;
  }

  // Chooses today's first slot; if today is exhausted, switches to tomorrow.
  // Also expands the period that contains the auto-selected time.
  void _initTimes() {
    final todayFirst = _firstAvailable(0);
    if (todayFirst != null) {
      _selectedDateIndex = 0;
      _selectedTime = todayFirst.time;
      _expandedPeriod = todayFirst.period;
    } else {
      _selectedDateIndex = 1;
      final tomorrowFirst = _firstAvailable(1);
      _selectedTime = tomorrowFirst?.time;
      _expandedPeriod = tomorrowFirst?.period ?? -1;
    }
  }

  @override
  void initState() {
    super.initState();
    _initTimes();
    // Sync with the server clock, then rebuild the slot list against it so a
    // tampered device clock cannot surface past (or wrongly future) slots.
    ServerTimeService.sync().then((_) {
      if (!mounted) return;
      setState(_initTimes);
    });
  }

  // Safe, typed fields extracted from route args
  Map<String, dynamic> _args = <String, dynamic>{};
  Map<String, dynamic> _product = <String, dynamic>{};
  Map<String, dynamic> _vendor = <String, dynamic>{};
  String _productName = '';
  String _vendorName = '';
  String _quantity = '0';
  String _subtotal = '0.00';

  // Cart-aware
  bool _isCartMode = false; // true when coming from cart/price_summary
  String _itemsSummary = ''; // e.g. "50L • Petrol" or "2x items"

  void _goHome() {
    Navigator.pushNamedAndRemoveUntil(
      context,
      AppRoutes.home,
      (route) => false,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    try {
      // Step 1: Get raw arguments
      final rawArgs = ModalRoute.of(context)?.settings.arguments;

      // Step 2: Safely coerce into Map<String, dynamic>
      if (rawArgs != null && rawArgs is Map) {
        _args = Map<String, dynamic>.from(rawArgs);
      } else {
        _args = <String, dynamic>{};
      }

      // Step 3: Check if this is a cart-mode checkout (from PriceSummary)
      final rawCartItems = _args['cart_items'];
      _isCartMode = rawCartItems is List && rawCartItems.isNotEmpty;

      if (_isCartMode) {
        // ── Cart Mode: Coming from Shopping Cart / Price Summary ──
        final cartItems = <CartItemModel>[];
        for (final item in rawCartItems as List) {
          if (item is CartItemModel) {
            cartItems.add(item);
          }
        }

        // Build items summary label
        if (cartItems.length == 1) {
          final item = cartItems.first;
          _productName = item.title;
          _vendorName = item.vendorName ?? '';
          final qty = item.quantity;
          _itemsSummary = '${qty}x • ${item.title}';
        } else {
          _productName = '${cartItems.length} Items';
          _vendorName = cartItems.firstOrNull?.vendorName ?? '';
          final totalQty = cartItems.fold<int>(0, (sum, i) => sum + i.quantity);
          _itemsSummary = '${cartItems.length} items (${totalQty}x total)';
        }
        _quantity = cartItems
            .fold<int>(0, (sum, i) => sum + i.quantity)
            .toString();

        // Subtotal from args
        final rawSubtotal = _args['subtotal'];
        final parsedSubtotal =
            double.tryParse(rawSubtotal?.toString() ?? '0') ?? 0.0;
        _subtotal = parsedSubtotal.toStringAsFixed(2);
      } else {
        // ── Single Product Mode: Coming from Fuel/Gas flows ──
        final rawProduct = _args['product'];
        if (rawProduct != null && rawProduct is Map) {
          _product = Map<String, dynamic>.from(rawProduct);
        } else {
          _product = <String, dynamic>{};
        }

        final rawVendor = _args['vendor'];
        if (rawVendor != null && rawVendor is Map) {
          _vendor = Map<String, dynamic>.from(rawVendor);
        } else {
          _vendor = <String, dynamic>{};
        }

        _productName =
            ((_product['product_name'] ?? _product['name']) ?? 'Fuel')
                .toString();
        _vendorName = ((_vendor['vendor_name'] ?? _vendor['name']) ?? '')
            .toString();
        _quantity = (_args['quantity'] ?? 0).toString();
        final rawTotal = _args['effective_total'] ?? _args['total'];
        final parsedTotal = double.tryParse(rawTotal?.toString() ?? '0') ?? 0.0;
        _subtotal = parsedTotal.toStringAsFixed(2);

        // Build items summary for single product
        final qty = double.tryParse(_quantity) ?? 0;
        final qtyStr = qty == qty.truncateToDouble()
            ? qty.toInt().toString()
            : qty.toString();
        final unit = (_args['unit'] ?? _product['unit'] ?? '')
            .toString()
            .toLowerCase();
        final isKg =
            unit == 'kg' ||
            _productName.toLowerCase().contains('gas') ||
            _productName.toLowerCase().contains('cylinder') ||
            (_product['category'] ?? '').toString().toLowerCase().contains(
              'gas',
            );
        final unitLabel = isKg ? 'KG' : 'L';
        _itemsSummary = '$qtyStr $unitLabel • $_productName';
      }
    } catch (e) {
      debugPrint(
        'DEBUG: [DeliveryTimeSelectionScreen] Error parsing arguments: $e',
      );
      _args = <String, dynamic>{};
      _product = <String, dynamic>{};
      _vendor = <String, dynamic>{};
      _productName = 'Fuel';
      _vendorName = '';
      _quantity = '0';
      _subtotal = '0.00';
      _isCartMode = false;
      _itemsSummary = '0L • Fuel';
    }

    // Defensive Logging
    debugPrint('DEBUG: [DeliveryTimeSelectionScreen] _args: $_args');
    debugPrint(
      'DEBUG: [DeliveryTimeSelectionScreen] _productName: $_productName',
    );
    debugPrint(
      'DEBUG: [DeliveryTimeSelectionScreen] _vendorName: $_vendorName',
    );
    debugPrint('DEBUG: [DeliveryTimeSelectionScreen] _quantity: $_quantity');
    debugPrint('DEBUG: [DeliveryTimeSelectionScreen] _subtotal: $_subtotal');
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context),
            _buildProgressBar(),
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: AppSpacing.s),
                    _buildSectionHeader(Icons.calendar_today, 'Select Date'),
                    _buildDateSelector(),
                    const SizedBox(height: AppSpacing.s),
                    _buildSectionHeader(Icons.bolt, 'Delivery Option'),
                    _buildExpressCard(),
                    _buildSectionHeader(Icons.schedule, 'Select Delivery Time'),
                    _buildPeriodList(),
                    _buildOrderSummaryCard(),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
            _buildFooter(context),
          ],
        ),
      ),
    );
  }

  // ── Header ──────────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.m,
        AppSpacing.m,
        AppSpacing.m,
        AppSpacing.s,
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
              ),
              child: const Icon(
                Icons.arrow_back,
                color: Colors.white,
                size: 20,
              ),
            ),
          ),
          const Expanded(
            child: Text(
              'Delivery Schedule',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
                letterSpacing: -0.3,
              ),
            ),
          ),
          GestureDetector(
            onTap: _goHome,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.1)),
              ),
              child: const Icon(
                Icons.home_outlined,
                color: Colors.white,
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Progress bar ─────────────────────────────────────────────────────────

  Widget _buildProgressBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: Container(
          height: 4,
          color: AppColors.border,
          child: const FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: 0.60,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [_kOrange, Color(0xFFFB923C)]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── Section header ───────────────────────────────────────────────────────

  Widget _buildSectionHeader(IconData icon, String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.l,
        AppSpacing.xl,
        AppSpacing.l,
        AppSpacing.m,
      ),
      child: Row(
        children: [
          Icon(icon, color: _kOrange, size: 18),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  // ── Date toggle ──────────────────────────────────────────────────────────

  Widget _buildDateSelector() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Container(
        height: 52,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
        ),
        child: Row(
          children: List.generate(_dateLabels.length, (i) => _buildDateTab(i)),
        ),
      ),
    );
  }

  Widget _buildDateTab(int index) {
    final bool isSelected = _selectedDateIndex == index;
    final String label = (index >= 0 && index < _dateLabels.length)
        ? _dateLabels[index]
        : '';
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() {
          _selectedDateIndex = index;
          // Auto-select the first bookable time for the newly chosen day and
          // expand the period that contains it.
          final first = _firstAvailable(index);
          _selectedTime = first?.time;
          _expandedPeriod = first?.period ?? -1;
        }),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeInOut,
          decoration: BoxDecoration(
            color: isSelected ? _kOrange : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            boxShadow: isSelected
                ? [
                    BoxShadow(
                      color: _kOrange.withOpacity(0.35),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ]
                : null,
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.white54,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── Express card (single, always-selected delivery option) ─────────────────

  Widget _buildExpressCard() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.l),
        decoration: BoxDecoration(
          color: _kOrange.withOpacity(0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _kOrange, width: 2),
          boxShadow: [
            BoxShadow(
              color: _kOrange.withOpacity(0.18),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: _kOrange.withOpacity(0.18),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.bolt, color: _kOrange, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text(
                        'Express',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: _kOrange,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'FASTEST',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _express.timeRange,
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                  ),
                ],
              ),
            ),
            // Always selected radio.
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: _kOrange, width: 2),
              ),
              child: Center(
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: _kOrange,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Delivery-time chips (dynamic, future-only) ─────────────────────────────

  // Period accordion: each period is a tappable header that expands to reveal
  // only its own 30-minute slots. Times stay hidden until a period is selected.
  Widget _buildPeriodList() {
    final periods = _visiblePeriods(_selectedDateIndex);

    if (periods.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.l,
          vertical: AppSpacing.m,
        ),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppSpacing.l),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.04),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withOpacity(0.08)),
          ),
          child: const Text(
            'No delivery times left for this day. Please choose Tomorrow.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white54, fontSize: 13),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Column(
        children: periods.map(_buildPeriodCard).toList(),
      ),
    );
  }

  Widget _buildPeriodCard(int periodIndex) {
    final p = _periods[periodIndex];
    final slots = _slotsForPeriod(_selectedDateIndex, periodIndex);
    final bool isExpanded = _expandedPeriod == periodIndex;
    final bool holdsSelected =
        _selectedTime != null &&
        _periodIndexOf(_selectedTime!) == periodIndex &&
        slots.any((s) => s.isAtSameMomentAs(_selectedTime!));
    final bool highlight = isExpanded || holdsSelected;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: highlight
            ? _kOrange.withOpacity(0.08)
            : Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlight ? _kOrange : Colors.white.withOpacity(0.10),
          width: highlight ? 1.5 : 1,
        ),
      ),
      child: Column(
        children: [
          // ── Period header ──────────────────────────────────────────────
          Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => setState(
                () => _expandedPeriod = isExpanded ? -1 : periodIndex,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 14,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: highlight
                            ? _kOrange.withOpacity(0.20)
                            : Colors.white.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        p['icon'] as IconData,
                        color: highlight ? _kOrange : Colors.white70,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                '${p['emoji']}  ${p['name']}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if (holdsSelected) ...[
                                const SizedBox(width: 8),
                                const Icon(
                                  Icons.check_circle,
                                  color: _kOrange,
                                  size: 16,
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _periodRange(periodIndex),
                            style: const TextStyle(
                              color: Colors.white54,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    AnimatedRotation(
                      turns: isExpanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: Icon(
                        Icons.keyboard_arrow_down,
                        color: highlight ? _kOrange : Colors.white54,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // ── Expanding slot grid ────────────────────────────────────────
          AnimatedSize(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeInOut,
            alignment: Alignment.topCenter,
            child: AnimatedOpacity(
              opacity: isExpanded ? 1 : 0,
              duration: const Duration(milliseconds: 200),
              child: isExpanded
                  ? Padding(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 16),
                      child: Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: slots.map(_buildTimeChip).toList(),
                      ),
                    )
                  : const SizedBox(width: double.infinity),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimeChip(DateTime time) {
    final bool fullyBooked = _isFullyBooked(time);
    final bool isSelected =
        _selectedTime != null && _selectedTime!.isAtSameMomentAs(time);
    final String label = _fmtTime(time);

    return GestureDetector(
      onTap: fullyBooked
          ? null
          : () => setState(() => _selectedTime = time),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        decoration: BoxDecoration(
          color: fullyBooked
              ? Colors.white.withOpacity(0.03)
              : isSelected
              ? _kOrange
              : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: fullyBooked
                ? Colors.white.withOpacity(0.06)
                : isSelected
                ? _kOrange
                : Colors.white.withOpacity(0.12),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: fullyBooked
                    ? Colors.white24
                    : isSelected
                    ? Colors.white
                    : Colors.white70,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                decoration: fullyBooked
                    ? TextDecoration.lineThrough
                    : TextDecoration.none,
              ),
            ),
            if (fullyBooked)
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Text(
                  'Fully Booked',
                  style: TextStyle(
                    color: Colors.redAccent,
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }


  // ── Order Summary card ───────────────────────────────────────────────────

  Widget _buildOrderSummaryCard() {
    final String dateLabel =
        (_selectedDateIndex >= 0 && _selectedDateIndex < _dateLabels.length)
        ? _dateLabels[_selectedDateIndex]
        : 'Today';
    final String timeLabel = _selectedTime != null
        ? _fmtTime(_selectedTime!)
        : 'No time available';

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.l,
        AppSpacing.s,
        AppSpacing.l,
        0,
      ),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.m),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: _kOrange.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: const Icon(
                    Icons.receipt_long,
                    color: _kOrange,
                    size: 16,
                  ),
                ),
                const SizedBox(width: 10),
                const Text(
                  'Order Summary',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            const Divider(color: Colors.white12, height: 1),
            const SizedBox(height: 12),
            _summaryRow(
              icon: Icons.calendar_today,
              label: 'Delivery Date',
              value: dateLabel,
            ),
            const SizedBox(height: 8),
            _summaryRow(
              icon: Icons.bolt,
              label: 'Delivery',
              value: 'Express  •  $timeLabel',
              valueColor: _kOrange,
            ),
            const SizedBox(height: 8),
            _summaryRow(
              icon: _isCartMode
                  ? Icons.shopping_bag_outlined
                  : Icons.local_gas_station,
              label: 'Items',
              value: _itemsSummary,
            ),
            const SizedBox(height: 8),
            _summaryRow(
              icon: Icons.attach_money,
              label: 'Subtotal',
              value: '\$${(_subtotal ?? '0.00').toString()}',
              valueColor: Colors.white,
            ),
          ],
        ),
      ),
    );
  }

  Widget _summaryRow({
    required IconData icon,
    required String label,
    required String value,
    Color valueColor = Colors.white70,
  }) {
    return Row(
      children: [
        Icon(icon, color: Colors.white38, size: 14),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.right,
            style: TextStyle(
              color: valueColor,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  // ── Footer CTA ──────────────────────────────────────────────────────────

  Widget _buildFooter(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.l,
        AppSpacing.m,
        AppSpacing.l,
        AppSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: _selectedTime == null
                  ? null
                  : () {
                      // Attach selected scheduling data to args before navigating.
                      final scheduledArgs = Map<String, dynamic>.from(_args);
                      final dateLabel =
                          (_selectedDateIndex >= 0 &&
                              _selectedDateIndex < _dateLabels.length)
                          ? _dateLabels[_selectedDateIndex]
                          : 'Today';
                      final timeLabel = _fmtTime(_selectedTime!);
                      scheduledArgs['delivery_date'] = dateLabel;
                      scheduledArgs['delivery_slot'] = 'Express';
                      scheduledArgs['delivery_time'] = timeLabel;
                      scheduledArgs['delivery_time_iso'] = _selectedTime!
                          .toIso8601String();
                      scheduledArgs['delivery_time_range'] =
                          '$dateLabel, $timeLabel';
                      Navigator.pushNamed(
                        context,
                        AppRoutes.deliveryLocationChoice,
                        arguments: scheduledArgs,
                      );
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: _kOrange,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                elevation: 0,
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Continue to Payment',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(width: 8),
                  Icon(Icons.arrow_forward, color: Colors.white, size: 18),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Delivery fees may vary based on selected time slot',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white38, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
