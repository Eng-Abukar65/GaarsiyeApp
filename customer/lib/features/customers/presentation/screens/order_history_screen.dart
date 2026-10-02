import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_typography.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../models/order_model.dart';
import '../widgets/order_tile.dart';
import '../widgets/ai_guide_assistant.dart';
import '../../../../shared/widgets/customer_bottom_nav.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/services/customer_notification_service.dart';
import '../models/car_wash_view_data.dart';

class OrderHistoryScreen extends StatefulWidget {
  const OrderHistoryScreen({super.key});

  @override
  State<OrderHistoryScreen> createState() => _OrderHistoryScreenState();
}

class _OrderHistoryScreenState extends State<OrderHistoryScreen> {
  final List<String> _filters = [
    'All Orders',
    'Delivered',
    'Processing',
    'Cancelled',
  ];
  // Car wash bookings live in their own module, visually separate from
  // fuel/gas/spare-parts delivery orders.
  final List<String> _carWashFilters = [
    'All',
    'Pending',
    'Active',
    'Completed',
    'Cancelled',
  ];
  String _module = 'deliveries'; // deliveries | car_wash
  int _selectedFilterIndex = 0;
  int _selectedCarWashFilterIndex = 0;
  List<dynamic> _orders = [];
  List<dynamic> _bookings = [];
  bool _isLoading = true;
  bool _carWashLoading = true;
  String _carWashError = '';
  String _searchQuery = '';
  Timer? _bookingPollTimer;
  Timer? _notificationDebounce;
  CustomerNotificationService? _notificationService;

  @override
  void initState() {
    super.initState();
    _fetchOrders();
    _fetchCarWashBookings();
    _bookingPollTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _fetchCarWashBookings(silent: true),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final service = context.read<CustomerNotificationService>();
    if (!identical(service, _notificationService)) {
      _notificationService?.removeListener(_handleNotificationUpdate);
      _notificationService = service..addListener(_handleNotificationUpdate);
      unawaited(service.start());
    }
  }

  @override
  void dispose() {
    _bookingPollTimer?.cancel();
    _notificationDebounce?.cancel();
    _notificationService?.removeListener(_handleNotificationUpdate);
    super.dispose();
  }

  void _handleNotificationUpdate() {
    if (!mounted) return;
    _notificationDebounce?.cancel();
    _notificationDebounce = Timer(
      const Duration(milliseconds: 500),
      () => _fetchCarWashBookings(silent: true),
    );
  }

  Future<void> _fetchOrders() async {
    try {
      final response = await ApiService.get('/customer/orders');
      if (!mounted) return;
      if (response.statusCode == 200) {
        setState(() => _orders = jsonDecode(response.body));
      }
    } catch (e) {
      debugPrint('Error fetching orders: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchCarWashBookings({bool silent = false}) async {
    if (!silent && mounted) {
      setState(() {
        _carWashLoading = true;
        _carWashError = '';
      });
    }
    try {
      final response = await ApiService.get('/customer/car-wash/bookings');
      if (!mounted) return;
      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        if (body is Map && body['success'] == true) {
          setState(
            () {
              _bookings = List<dynamic>.from(body['data'] ?? []);
              _carWashError = '';
            },
          );
        } else if (!silent) {
          setState(() {
            _carWashError = body is Map
                ? body['message']?.toString() ?? 'Could not load bookings.'
                : 'Could not load bookings.';
          });
        }
      }
    } catch (e) {
      debugPrint('Error fetching car wash bookings: $e');
      if (!silent && mounted) {
        setState(() => _carWashError = ApiService.connectionErrorMessage);
      }
    } finally {
      if (mounted) setState(() => _carWashLoading = false);
    }
  }

  Future<void> _refreshAll() async {
    await Future.wait([_fetchOrders(), _fetchCarWashBookings()]);
  }

  List<dynamic> get _filteredBookings {
    final filter = _carWashFilters[_selectedCarWashFilterIndex].toLowerCase();
    final query = _searchQuery.trim().toLowerCase();
    return _bookings.where((b) {
      final booking = b is Map ? Map<String, dynamic>.from(b) : <String, dynamic>{};
      final status = CarWashViewData.normalizeStatus(booking['status']);
      if (filter != 'all') {
      if (filter == 'active') {
          if (!CarWashViewData.isActive(status)) return false;
        } else if (status != filter) {
          return false;
        }
      }
      if (query.isEmpty) return true;
      final haystack = [
        CarWashViewData.bookingReference(booking),
        CarWashViewData.vendorName(booking),
        CarWashViewData.serviceName(booking),
        booking['vehicle_plate'],
      ].join(' ').toLowerCase();
      return haystack.contains(query);
    }).toList();
  }

  OrderStatus _mapStatus(String? status) {
    switch (status?.toLowerCase()) {
      case 'pending':
        return OrderStatus.pending;
      case 'accepted':
        return OrderStatus.accepted;
      case 'driver assigned':
        return OrderStatus.driverAssigned;
      case 'on the way':
        return OrderStatus.onTheWay;
      case 'delivered':
        return OrderStatus.delivered;
      case 'cancelled':
        return OrderStatus.cancelled;
      default:
        return OrderStatus.pending;
    }
  }

  List<dynamic> get _filteredOrders {
    final filterName = _filters[_selectedFilterIndex].toLowerCase();
    final query = _searchQuery.trim().toLowerCase();
    return _orders.where((o) {
      final status = (o['status'] ?? '').toString().toLowerCase();
      final matchesFilter = _selectedFilterIndex == 0 ||
          (filterName == 'processing'
              ? status == 'pending' ||
            status == 'accepted' ||
            status == 'driver assigned' ||
                  status == 'on the way'
              : status == filterName);
      if (!matchesFilter) return false;
      if (query.isEmpty) return true;
      return o.toString().toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // subscribe to theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = cs.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final surfaceColor = cs.surface;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Order History',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 20,
            letterSpacing: -0.5,
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.more_vert, color: textPrimary),
            onPressed: () {},
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: borderColor.withAlpha(102)),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshAll,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.all(AppSpacing.m),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _buildSearchField(
                  isDark: isDark,
                  textPrimary: textPrimary,
                  textSecondary: textSecondary,
                  surfaceColor: surfaceColor,
                  borderColor: borderColor,
                ),
                const SizedBox(height: AppSpacing.m),
                _buildModuleToggle(
                  surfaceColor: surfaceColor,
                  textSecondary: textSecondary,
                ),
                const SizedBox(height: AppSpacing.m),
                if (_module == 'deliveries')
                  _buildFilters(
                    isDark: isDark,
                    textSecondary: textSecondary,
                    surfaceColor: surfaceColor,
                  )
                else
                  _buildCarWashFilters(
                    textSecondary: textSecondary,
                    surfaceColor: surfaceColor,
                  ),
                const SizedBox(height: AppSpacing.l),
                Text(
                  _module == 'deliveries'
                      ? 'RECENT ACTIVITY'
                      : 'CAR SERVICES BOOKINGS',
                  style: AppTypography.label.copyWith(
                    color: textSecondary,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: AppSpacing.m),
                if ((_module == 'car_wash' &&
                        _carWashLoading &&
                        _bookings.isEmpty) ||
                    (_module == 'deliveries' && _isLoading))
                  Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  )
                else if (_module == 'car_wash' &&
                    _carWashError.isNotEmpty &&
                    _bookings.isEmpty)
                  _buildCarWashError(textSecondary)
                else if (_module == 'car_wash')
                  ...(_filteredBookings.isEmpty
                      ? [
                          Center(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 50.0),
                              child: Text(
                                'No car services bookings yet',
                                style: TextStyle(color: textSecondary),
                              ),
                            ),
                          )
                        ]
                      : _filteredBookings
                          .map((b) => _buildCarWashBookingItem(
                                context,
                                b,
                                borderColor: borderColor,
                                textSecondary: textSecondary,
                              ))
                          .toList())
                else if (_filteredOrders.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 50.0),
                      child: Text(
                        'No orders found',
                        style: TextStyle(color: textSecondary),
                      ),
                    ),
                  )
                else
                  ..._filteredOrders.map((order) => _buildOrderHistoryItem(
                        context,
                        order,
                        borderColor: borderColor,
                        textSecondary: textSecondary,
                      )),
                const SizedBox(height: AppSpacing.m),
                _buildLoadMoreButton(
                  textSecondary: textSecondary,
                  borderColor: borderColor,
                ),
                const SizedBox(height: 80),
              ]),
            ),
          ),
        ],
        ),
      ),
      bottomNavigationBar: const CustomerBottomNav(
        currentTab: CustomerNavTab.orders,
      ),
    );
  }

  Widget _buildSearchField({
    required bool isDark,
    required Color textPrimary,
    required Color textSecondary,
    required Color surfaceColor,
    required Color borderColor,
  }) {
    return TextField(
      onChanged: (value) => setState(() => _searchQuery = value),
      style: TextStyle(color: textPrimary),
      decoration: InputDecoration(
        filled: true,
        fillColor: surfaceColor.withAlpha(128),
        hintText: _module == 'car_wash'
            ? 'Search reference, vendor, service, or plate...'
            : 'Search orders, items, or IDs...',
        hintStyle: TextStyle(color: textSecondary.withAlpha(153), fontSize: 14),
        prefixIcon: Icon(Icons.search, color: textSecondary.withAlpha(153)),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }

  Widget _buildModuleToggle({
    required Color surfaceColor,
    required Color textSecondary,
  }) {
    Widget tab(String key, String label, IconData icon) {
      final selected = _module == key;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => _module = key),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? AppColors.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon,
                    size: 16,
                    color: selected ? Colors.white : textSecondary),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: selected ? Colors.white : textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: Row(
        children: [
          tab('deliveries', 'Deliveries', Icons.local_shipping_outlined),
          tab('car_wash', 'Car Service', Icons.car_repair),
        ],
      ),
    );
  }

  Widget _buildCarWashError(Color textSecondary) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 34),
      child: Column(
        children: [
          Icon(Icons.cloud_off_outlined, size: 42, color: textSecondary),
          const SizedBox(height: 10),
          Text(
            _carWashError,
            textAlign: TextAlign.center,
            style: TextStyle(color: textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _fetchCarWashBookings,
            icon: const Icon(Icons.refresh, size: 17),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildCarWashFilters({
    required Color textSecondary,
    required Color surfaceColor,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: List.generate(_carWashFilters.length, (index) {
          final isSelected = _selectedCarWashFilterIndex == index;
          return GestureDetector(
            onTap: () =>
                setState(() => _selectedCarWashFilterIndex = index),
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primary : surfaceColor,
                borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
              ),
              child: Text(
                _carWashFilters[index],
                style: TextStyle(
                  color: isSelected ? Colors.white : textSecondary,
                  fontSize: 14,
                  fontWeight:
                      isSelected ? FontWeight.bold : FontWeight.w500,
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildCarWashBookingItem(
    BuildContext context,
    dynamic booking, {
    required Color borderColor,
    required Color textSecondary,
  }) {
    final item = booking is Map
        ? Map<String, dynamic>.from(booking)
        : <String, dynamic>{};
    final textPrimary = Theme.of(context).colorScheme.onSurface;
    final status = CarWashViewData.normalizeStatus(item['status']);
    final statusColor = CarWashViewData.statusColor(status);
    final amount = double.tryParse('${item['total_price']}') ?? 0.0;
    final reference = CarWashViewData.bookingReference(item);
    final date = CarWashViewData.scheduledDateTime(item);

    return GestureDetector(
      onTap: () => Navigator.pushNamed(
        context,
        AppRoutes.carWashBookingDetails,
        arguments: {'bookingId': item['id']},
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.m),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(color: borderColor),
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                CarWashViewData.serviceIcon(item['service_name']),
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          reference,
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                              color: textPrimary),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      // Module badge keeps car wash visually separate.
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          CarWashViewData.statusLabel(status),
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: statusColor),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${booking['vendor_name'] ?? ''} • $date ${booking['scheduled_time'] ?? ''}',
                    style:
                        TextStyle(fontSize: 12, color: textSecondary),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      Text(
                        '\$${amount.toStringAsFixed(2)}',
                        style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                            color: Color(0xFF16A34A)),
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: () => Navigator.pushNamed(
                          context,
                          AppRoutes.carWashBookingDetails,
                          arguments: {'bookingId': item['id']},
                        ),
                        style: TextButton.styleFrom(
                          minimumSize: const Size(0, 32),
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                        ),
                        child: const Text(
                          'View Details',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'PROGRESS',
                        style: TextStyle(
                          color: textSecondary,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        CarWashViewData.progressSummary(status),
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: CarWashViewData.progress(status),
                      minHeight: 5,
                      backgroundColor: borderColor,
                      valueColor: AlwaysStoppedAnimation<Color>(statusColor),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilters({
    required bool isDark,
    required Color textSecondary,
    required Color surfaceColor,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          ...List.generate(_filters.length, (index) {
            final isSelected = _selectedFilterIndex == index;
            return GestureDetector(
              onTap: () => setState(() => _selectedFilterIndex = index),
              child: Container(
                margin: const EdgeInsets.only(right: 8),
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.primary : surfaceColor,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                ),
                child: Text(
                  _filters[index],
                  style: TextStyle(
                    color: isSelected ? Colors.white : textSecondary,
                    fontSize: 14,
                    fontWeight:
                        isSelected ? FontWeight.bold : FontWeight.w500,
                  ),
                ),
              ),
            );
          }),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: surfaceColor,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.tune, size: 18, color: textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadMoreButton({
    required Color textSecondary,
    required Color borderColor,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderColor, width: 2),
      ),
      child: Center(
        child: Text(
          'View Older Orders',
          style: TextStyle(
            color: textSecondary.withAlpha(204),
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildOrderHistoryItem(
    BuildContext context,
    dynamic order, {
    required Color borderColor,
    required Color textSecondary,
  }) {
    final status = _mapStatus(order['status']);
    final hasReview = _asBool(order['has_review']);
    final canReview = status == OrderStatus.delivered;
    final orderType = order['order_type']?.toString().trim();
    final typeLabel = orderType?.isNotEmpty == true ? orderType! : 'General';
    final normalizedType = typeLabel.toLowerCase();
    final typeIcon = normalizedType.contains('petrol') ||
            normalizedType.contains('diesel')
        ? Icons.local_gas_station
        : normalizedType.contains('gas')
        ? Icons.propane_tank
        : normalizedType.contains('spare')
        ? Icons.build_circle_outlined
        : normalizedType.contains('service') || normalizedType.contains('wash')
        ? Icons.car_repair
        : Icons.shopping_bag_outlined;

    return Column(
      children: [
        OrderTile(
          order: OrderModel(
            id: order['id'].toString(),
            title: '$typeLabel order from ${order['vendor_name'] ?? 'Vendor'}',
            station: order['vendor_name'] ?? 'Station',
            amount: double.tryParse(order['total_amount'].toString()) ?? 0.0,
            date: order['created_at'],
            status: status,
            icon: typeIcon,
          ),
          onTap: () => Navigator.pushNamed(
            context,
            AppRoutes.status,
            arguments: order,
          ),
        ),
        if (canReview)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.m),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: hasReview
                    ? null
                    : () async {
                        await Navigator.pushNamed(
                          context,
                          AppRoutes.ratingReview,
                          arguments: order,
                        );
                        if (mounted) _fetchOrders();
                      },
                icon: Icon(hasReview ? Icons.check_circle : Icons.star_border),
                label: Text(hasReview ? 'Reviewed' : 'Review Order'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: hasReview ? textSecondary : AppColors.primary,
                  side: BorderSide(color: hasReview ? borderColor : AppColors.primary),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ),
      ],
    );
  }

  bool _asBool(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    final text = value?.toString().toLowerCase().trim() ?? '';
    return text == 'true' || text == '1' || text == 'yes';
  }

  Widget _buildBottomNav(
    BuildContext context, {
    required Color bgColor,
    required Color borderColor,
    required Color textSecondary,
  }) {
    return Container(
      padding: const EdgeInsets.only(top: 12, bottom: 24, left: 16, right: 16),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(top: BorderSide(color: borderColor.withAlpha(77))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(context, Icons.home, 'HOME', false,
              textSecondary: textSecondary, route: AppRoutes.home),
          _buildNavItem(context, Icons.history, 'ORDERS', true,
              textSecondary: textSecondary, route: AppRoutes.history),
          _buildNavItem(context, Icons.local_gas_station, 'STATIONS', false,
              textSecondary: textSecondary, route: AppRoutes.selectStation),
          _buildNavItem(context, Icons.person, 'PROFILE', false,
              textSecondary: textSecondary, route: AppRoutes.profile),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    IconData icon,
    String label,
    bool isSelected, {
    required Color textSecondary,
    String? route,
  }) {
    final activeColor = AppColors.primary;
    final inactiveColor = textSecondary;

    return GestureDetector(
      onTap: () {
        if (route != null && !isSelected) {
          Navigator.pushNamed(context, route);
        }
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutBack,
        transform: Matrix4.translationValues(0, isSelected ? -5 : 0, 0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Circular Blue Background Container with Bounce & Soft Shadow
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutBack,
              width: isSelected ? 44 : 32,
              height: isSelected ? 44 : 32,
              decoration: BoxDecoration(
                color: isSelected ? activeColor : Colors.transparent,
                shape: BoxShape.circle,
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: activeColor.withOpacity(0.35),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : [],
              ),
              child: AnimatedScale(
                scale: isSelected ? 1.05 : 0.95,
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutBack,
                child: Icon(
                  icon,
                  color: isSelected ? Colors.white : inactiveColor,
                  size: 24,
                ),
              ),
            ),
            const SizedBox(height: 3),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutBack,
              style: TextStyle(
                color: isSelected ? activeColor : inactiveColor,
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
              ),
              child: Text(label),
            ),
          ],
        ),
      ),
    );
  }
}
