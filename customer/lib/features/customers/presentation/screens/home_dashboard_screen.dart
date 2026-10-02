import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/services/customer_notification_service.dart';
import '../widgets/ai_guide_assistant.dart';
import '../../../../shared/widgets/customer_bottom_nav.dart';

class HomeDashboardScreen extends StatefulWidget {
  const HomeDashboardScreen({super.key});

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  List<dynamic> _recentOrders = [];
  String _userName = 'Guest';
  String? _photoUrl;
  String _displayLocation = 'Set delivery location';
  List<dynamic> _categories = [];
  List<dynamic> _offers = [];
  List<dynamic> _discountedProducts = [];
  List<dynamic> _limitedTimeDeals = [];
  bool _isLoadingOffers = false;
  bool _isClaimingOffer = false;
  String? _promotionMessage;
  io.Socket? _socket;
  Timer? _promotionRefreshTimer;
  bool _paymentSuccessToastShown = false;

  // Search
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  String _searchQuery = '';
  bool _searchActive = false;

  @override
  void initState() {
    super.initState();
    _fetchData();
    _connectSocket();
    _promotionRefreshTimer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => _fetchOffers(),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CustomerNotificationService>().start();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_paymentSuccessToastShown) return;

    final rawArgs = ModalRoute.of(context)?.settings.arguments;
    if (rawArgs is! Map) return;

    final message = rawArgs['flash_message']?.toString().trim();
    if (message == null || message.isEmpty) return;

    _paymentSuccessToastShown = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.check_circle_outline, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(child: Text(message)),
            ],
          ),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    _socket?.disconnect();
    _socket?.dispose();
    _promotionRefreshTimer?.cancel();
    super.dispose();
  }

  bool _isLiveOffer(dynamic value) {
    if (value is! Map) return false;

    final active = value['is_active'];
    if (active == false || active == 0 || active == '0') return false;

    final expiryValue = value['end_date'] ?? value['offer_expiry'];
    if (expiryValue != null && expiryValue.toString().trim().isNotEmpty) {
      final expiry = DateTime.tryParse(expiryValue.toString());
      if (expiry == null || expiry.isBefore(DateTime.now())) return false;
    }

    if (value['product_id'] != null) {
      final stock =
          double.tryParse(
            (value['stock'] ?? value['stock_quantity'] ?? 0).toString(),
          ) ??
          0;
      if (stock <= 0) return false;
      final productActive = value['product_is_active'] ?? value['is_active'];
      if (productActive == false ||
          productActive == 0 ||
          productActive == '0') {
        return false;
      }
    }

    return true;
  }

  bool _isAvailablePromotionalProduct(dynamic value) {
    if (value is! Map || !_isLiveOffer(value)) return false;
    final stock =
        double.tryParse(
          (value['stock'] ?? value['stock_quantity'] ?? 0).toString(),
        ) ??
        0;
    final hasOffer = value['has_offer'] == true || value['has_offer'] == 1;
    return stock > 0 && hasOffer;
  }

  String? _formatOfferExpiry(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final expiry = DateTime.tryParse(value)?.toLocal();
    if (expiry == null) return null;
    return DateFormat('dd MMM, h:mm a').format(expiry);
  }

  Future<void> _fetchOffers() async {
    if (_isLoadingOffers) return;
    try {
      setState(() => _isLoadingOffers = true);
      final response = await ApiService.get('/customer/offers/feed');
      if (mounted && response.statusCode == 200) {
        final body = jsonDecode(response.body);
        final nearbyOffers = body['nearby_offers'];
        final feedOffers = body['offers'];
        final discountedProducts = body['discounted_products'];
        final limitedTimeDeals = body['limited_time_deals'];
        final liveNearbyOffers = nearbyOffers is List
            ? nearbyOffers.where(_isLiveOffer).toList()
            : <dynamic>[];
        final liveFeedOffers = feedOffers is List
            ? feedOffers.where(_isLiveOffer).toList()
            : <dynamic>[];
        final liveDiscountedProducts = discountedProducts is List
            ? discountedProducts.where(_isAvailablePromotionalProduct).toList()
            : <dynamic>[];
        final liveLimitedTimeDeals = limitedTimeDeals is List
            ? limitedTimeDeals.where(_isAvailablePromotionalProduct).toList()
            : <dynamic>[];

        setState(() {
          _offers = liveNearbyOffers.isNotEmpty
              ? liveNearbyOffers
              : liveFeedOffers;
          _discountedProducts = liveDiscountedProducts;
          _limitedTimeDeals = liveLimitedTimeDeals;
        });
      }
    } catch (e) {
      print('Error loading promotions: $e');
    } finally {
      if (mounted) setState(() => _isLoadingOffers = false);
    }
  }

  Future<void> _connectSocket() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('token');
      if (token == null || token.isEmpty) return;

      final socketUrl = ApiService.baseUrl.replaceFirst('/api', '');
      _socket?.dispose();
      _socket = io.io(
        socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .setAuth({'token': token})
            .disableAutoConnect()
            .build(),
      );

      _socket!
        ..onConnect((_) {
          debugPrint('Customer socket connected');
        })
        ..on('offer-created', (data) {
          debugPrint('Offer created event received: $data');
          if (mounted) {
            setState(() {
              _promotionMessage = 'New promotion available!';
            });
            _fetchOffers();
          }
        })
        ..on('offer-updated', (_) => _fetchOffers())
        ..on('offer-deleted', (_) => _fetchOffers())
        ..on('inventory-updated', (_) => _fetchOffers())
        ..onDisconnect((_) => debugPrint('Customer socket disconnected'))
        ..onConnectError((error) => debugPrint('Customer socket error: $error'))
        ..connect();
    } catch (e) {
      print('Error connecting customer socket: $e');
    }
  }

  Future<void> _fetchData() async {
    try {
      setState(() => _isLoadingOffers = true);

      // Fetch profile data dynamically
      try {
        final profileResponse = await ApiService.get('/customer/profile');
        if (profileResponse.statusCode == 200) {
          final data = jsonDecode(profileResponse.body);
          final firstName = data['first_name'] ?? '';
          final lastName = data['last_name'] ?? '';
          final fullName = '$firstName $lastName'.trim();
          final displayName = fullName.isNotEmpty
              ? fullName
              : (data['username'] ?? 'Customer');

          final rawPhotoUrl = data['photo_url'];
          String? photoUrl;
          if (rawPhotoUrl != null && rawPhotoUrl.isNotEmpty) {
            if (rawPhotoUrl.startsWith('/uploads')) {
              final host = ApiService.baseUrl.replaceAll('/api', '');
              photoUrl = '$host$rawPhotoUrl';
            } else {
              photoUrl = rawPhotoUrl;
            }
          }

          setState(() {
            _userName = displayName;
            _photoUrl = photoUrl;
          });
        }
      } catch (e) {
        print('Error fetching profile in home: $e');
      }

      // Fetch location: try dedicated /customer/location endpoint first
      try {
        final locationResponse = await ApiService.get('/customer/location');
        if (locationResponse.statusCode == 200) {
          final loc = jsonDecode(locationResponse.body);
          final city = loc['city'] ?? '';
          final area = loc['area'] ?? '';
          final addr = loc['address'] ?? '';

          String display = '';
          if (area.isNotEmpty && city.isNotEmpty) {
            display = '$area, $city';
          } else if (city.isNotEmpty) {
            display = city;
          } else if (addr.isNotEmpty) {
            display = addr;
          }

          if (display.isNotEmpty && mounted) {
            setState(() => _displayLocation = display);
          }
        } else {
          // Fall back to addresses table
          final addressesResponse = await ApiService.get('/customer/addresses');
          if (addressesResponse.statusCode == 200) {
            final List decoded = jsonDecode(addressesResponse.body);
            final list = decoded
                .map((e) => Map<String, dynamic>.from(e))
                .toList();
            if (list.isNotEmpty) {
              final defaultAddr = list.firstWhere(
                (a) => a['is_default'] == 1 || a['is_default'] == true,
                orElse: () => list.first,
              );
              final city = defaultAddr['city'] ?? '';
              final area = defaultAddr['area'] ?? '';
              final label = defaultAddr['label'] ?? '';
              final addrLine = defaultAddr['address_line'] ?? '';

              String display = '';
              if (area.isNotEmpty && city.isNotEmpty) {
                display = '$area, $city';
              } else if (city.isNotEmpty) {
                display = city;
              } else if (addrLine.isNotEmpty) {
                display = addrLine;
              } else {
                display = label;
              }

              if (display.isNotEmpty && mounted) {
                setState(() => _displayLocation = display);
              }
            }
          }
        }
      } catch (e) {
        print('Error fetching location in home: $e');
      }

      final ordersResponse = await ApiService.get('/customer/orders');
      if (mounted && ordersResponse.statusCode == 200) {
        setState(() => _recentOrders = jsonDecode(ordersResponse.body));
      }

      final catResponse = await ApiService.get('/customer/categories');
      if (mounted && catResponse.statusCode == 200) {
        setState(() => _categories = jsonDecode(catResponse.body));
      }

      await _fetchOffers();
    } catch (e) {
      print('Error fetching home data: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingOffers = false;
        });
      }
    }
  }

  Future<void> _claimNow() async {
    if (_isClaimingOffer) return;
    setState(() => _isClaimingOffer = true);
    try {
      final response = await ApiService.get('/customer/offers');
      if (!mounted) return;
      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        final raw = body['offers'];
        final now = DateTime.now();
        final offers = (raw is List ? raw : [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .where((o) {
              final endDate = o['end_date'];
              if (endDate != null && endDate.toString().isNotEmpty) {
                final exp = DateTime.tryParse(endDate.toString());
                if (exp != null && exp.isBefore(now)) return false;
              }
              return true;
            })
            .toList();

        if (offers.isEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.white),
                  SizedBox(width: 10),
                  Text('No active promotions available.'),
                ],
              ),
              backgroundColor: AppColors.primary,
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          );
        } else if (offers.length == 1) {
          Navigator.pushNamed(
            context,
            AppRoutes.offerDetails,
            arguments: {'offer': offers.first},
          );
        } else {
          Navigator.pushNamed(
            context,
            AppRoutes.offersList,
            arguments: {'offers': offers},
          );
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Failed to load offers. Please try again.'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Network error. Please try again.'),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isClaimingOffer = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // subscribe to theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = cs.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final surfaceColor = cs.surface;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final unreadNotifications = context
        .watch<CustomerNotificationService>()
        .unreadCount;

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeader(
                      context,
                      bgColor: bgColor,
                      surfaceColor: surfaceColor,
                      textPrimary: textPrimary,
                      textSecondary: textSecondary,
                      borderColor: borderColor,
                      unreadNotifications: unreadNotifications,
                    ),
                    _buildPromoBanner(context),
                    _buildOffersSection(
                      context,
                      surfaceColor,
                      textPrimary,
                      textSecondary,
                      borderColor,
                    ),
                    _buildDiscountedProductsSection(
                      context,
                      surfaceColor,
                      textPrimary,
                      textSecondary,
                      borderColor,
                    ),
                    _buildLimitedTimeDealsSection(
                      context,
                      surfaceColor,
                      textPrimary,
                      textSecondary,
                      borderColor,
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 24,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Our Services',
                            style: TextStyle(
                              color: textPrimary,
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          GestureDetector(
                            onTap: () => Navigator.pushNamed(
                              context,
                              AppRoutes.selectService,
                            ),
                            child: const Text(
                              'View All',
                              style: TextStyle(
                                color: AppColors.primary,
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    _buildServicesGrid(
                      context,
                      surfaceColor: surfaceColor,
                      textPrimary: textPrimary,
                      textSecondary: textSecondary,
                      borderColor: borderColor,
                    ),
                    if (_recentOrders.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 24,
                        ),
                        child: Text(
                          'Recent Orders',
                          style: TextStyle(
                            color: textPrimary,
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ..._recentOrders
                        .take(3)
                        .map(
                          (order) => _buildRecentOrder(
                            context,
                            order,
                            surfaceColor: surfaceColor,
                            textPrimary: textPrimary,
                            textSecondary: textSecondary,
                            borderColor: borderColor,
                          ),
                        ),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: const CustomerBottomNav(
        currentTab: CustomerNavTab.home,
      ),
      floatingActionButton: const AiGuideAssistant(contextPage: 'home'),
    );
  }

  Widget _buildHeader(
    BuildContext context, {
    required Color bgColor,
    required Color surfaceColor,
    required Color textPrimary,
    required Color textSecondary,
    required Color borderColor,
    required int unreadNotifications,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: surfaceColor.withOpacity(0.8),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.location_on,
                        color: AppColors.primary,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Your Location',
                            style: TextStyle(
                              color: textSecondary,
                              fontSize: 12,
                            ),
                          ),
                          InkWell(
                            onTap: () async {
                              await Navigator.pushNamed(
                                context,
                                AppRoutes.selectLocation,
                              );
                              if (mounted) _fetchData();
                            },
                            child: Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    _displayLocation,
                                    style: TextStyle(
                                      color: textPrimary,
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                Icon(
                                  Icons.keyboard_arrow_down,
                                  color: textSecondary,
                                  size: 20,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => Navigator.pushNamed(context, AppRoutes.notifications),
                child: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: surfaceColor.withOpacity(0.8),
                    shape: BoxShape.circle,
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    clipBehavior: Clip.none,
                    children: [
                      Icon(
                        Icons.notifications_outlined,
                        color: textPrimary,
                        size: 24,
                      ),
                      if (unreadNotifications > 0)
                        Positioned(
                          right: 2,
                          top: 2,
                          child: Container(
                            constraints: const BoxConstraints(
                              minWidth: 18,
                              minHeight: 18,
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.error,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              unreadNotifications > 99 ? '99+' : '$unreadNotifications',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          // Greeting text
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back,',
                style: TextStyle(color: textSecondary, fontSize: 14),
              ),
              Text(
                _userName,
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Live search bar
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 56,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  color: surfaceColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _searchActive ? AppColors.primary : borderColor,
                    width: _searchActive ? 1.5 : 1,
                  ),
                  boxShadow: _searchActive
                      ? [
                          BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.08),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ]
                      : [],
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.search,
                      color: _searchActive ? AppColors.primary : textSecondary,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        focusNode: _searchFocusNode,
                        style: TextStyle(color: textPrimary, fontSize: 15),
                        onChanged: (val) {
                          setState(() {
                            _searchQuery = val.trim().toLowerCase();
                            _searchActive = val.trim().isNotEmpty;
                          });
                        },
                        onTap: () {
                          setState(() => _searchActive = true);
                        },
                        decoration: InputDecoration(
                          hintText: 'Search services, products, offers...',
                          hintStyle: TextStyle(
                            color: textSecondary.withValues(alpha: 0.7),
                            fontSize: 14,
                          ),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                    if (_searchActive)
                      GestureDetector(
                        onTap: () {
                          _searchController.clear();
                          _searchFocusNode.unfocus();
                          setState(() {
                            _searchQuery = '';
                            _searchActive = false;
                          });
                        },
                        child: Icon(
                          Icons.close,
                          color: textSecondary,
                          size: 20,
                        ),
                      )
                    else
                      Icon(Icons.tune, color: textSecondary, size: 22),
                  ],
                ),
              ),
              // Results overlay
              if (_searchActive && _searchQuery.isNotEmpty)
                _buildSearchResults(
                  textPrimary,
                  textSecondary,
                  surfaceColor,
                  borderColor,
                ),
            ],
          ),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> _getSearchResults() {
    final q = _searchQuery;
    final results = <Map<String, dynamic>>[];

    // --- Categories / Services ---
    for (final cat in _categories) {
      final name = (cat['name'] ?? '').toString().toLowerCase();
      final desc = (cat['description'] ?? '').toString().toLowerCase();
      if (name.contains(q) || desc.contains(q)) {
        String route = AppRoutes.selectStation;
        if (name.contains('gas') || name.contains('cylinder')) {
          route = AppRoutes.selectGasStation;
        } else if (name.contains('spare') || name.contains('part')) {
          route = AppRoutes.spareParts;
        } else if (name.contains('wash')) {
          route = AppRoutes.carWashServices;
        }
        results.add({
          'type': 'service',
          'label': cat['name'] ?? 'Service',
          'subtitle': cat['description'] ?? '',
          'icon': name.contains('wash')
              ? Icons.local_car_wash
              : name.contains('gas')
              ? Icons.propane_tank
              : name.contains('spare')
              ? Icons.build
              : Icons.local_gas_station,
          'route': route,
          'args': {'product': cat['name']},
        });
      }
    }

    // --- Offers ---
    for (final offer in _offers) {
      final name = (offer['name'] ?? offer['title'] ?? '')
          .toString()
          .toLowerCase();
      final vendor = (offer['vendor_name'] ?? '').toString().toLowerCase();
      if (name.contains(q) || vendor.contains(q)) {
        final discountValue =
            offer['discount_value'] ?? offer['discount_percentage'] ?? 0;
        results.add({
          'type': 'offer',
          'label': offer['name'] ?? offer['title'] ?? 'Offer',
          'subtitle':
              '${offer['vendor_name'] ?? 'Vendor'} · $discountValue% off',
          'icon': Icons.local_offer,
          'route': AppRoutes.offerDetails,
          'args': {'offer': offer},
        });
      }
    }

    // --- Discounted Products ---
    for (final product in [..._discountedProducts, ..._limitedTimeDeals]) {
      final name = (product['product_name'] ?? product['name'] ?? '')
          .toString()
          .toLowerCase();
      if (name.contains(q)) {
        results.add({
          'type': 'product',
          'label': product['product_name'] ?? product['name'] ?? 'Product',
          'subtitle': product['vendor_name'] ?? '',
          'icon': Icons.shopping_bag,
          'route': AppRoutes.productDetails,
          'args': Map<String, dynamic>.from(product),
        });
      }
    }

    return results;
  }

  Widget _buildSearchResults(
    Color textPrimary,
    Color textSecondary,
    Color surfaceColor,
    Color borderColor,
  ) {
    final results = _getSearchResults();
    return Container(
      margin: const EdgeInsets.only(top: 6),
      constraints: const BoxConstraints(maxHeight: 320),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor.withValues(alpha: 0.8)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: results.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Icon(
                    Icons.search_off,
                    color: textSecondary.withValues(alpha: 0.5),
                    size: 22,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'No results for "$_searchQuery"',
                    style: TextStyle(color: textSecondary, fontSize: 14),
                  ),
                ],
              ),
            )
          : ListView.separated(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 8),
              physics: const BouncingScrollPhysics(),
              itemCount: results.length,
              separatorBuilder: (_, __) =>
                  Divider(height: 1, color: borderColor.withValues(alpha: 0.5)),
              itemBuilder: (context, index) {
                final result = results[index];
                final typeColor = result['type'] == 'offer'
                    ? Colors.orange
                    : result['type'] == 'product'
                    ? AppColors.success
                    : AppColors.primary;
                return InkWell(
                  onTap: () {
                    _searchController.clear();
                    _searchFocusNode.unfocus();
                    setState(() {
                      _searchQuery = '';
                      _searchActive = false;
                    });
                    Navigator.pushNamed(
                      context,
                      result['route'] as String,
                      arguments: result['args'],
                    );
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: typeColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            result['icon'] as IconData,
                            color: typeColor,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                result['label'] as String,
                                style: TextStyle(
                                  color: textPrimary,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              if ((result['subtitle'] as String).isNotEmpty)
                                Text(
                                  result['subtitle'] as String,
                                  style: TextStyle(
                                    color: textSecondary,
                                    fontSize: 12,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: typeColor.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            result['type'] as String,
                            style: TextStyle(
                              color: typeColor,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          Icons.arrow_forward_ios,
                          color: textSecondary.withValues(alpha: 0.5),
                          size: 12,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }

  Widget _buildPromoBanner(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 180),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(24),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          children: [
            Positioned(
              right: -20,
              bottom: -20,
              child: Opacity(
                opacity: 0.15,
                child: Icon(
                  Icons.delivery_dining,
                  size: 160,
                  color: Colors.white,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Flexible(
                    child: Text(
                      'Special Offers',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Flexible(
                    child: Text(
                      'Exclusive discounts from our\nvendor partners.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        height: 1.4,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  GestureDetector(
                    onTap: _isClaimingOffer ? null : _claimNow,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: _isClaimingOffer
                          ? const SizedBox(
                              width: 80,
                              height: 20,
                              child: Center(
                                child: SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      AppColors.primary,
                                    ),
                                  ),
                                ),
                              ),
                            )
                          : const Text(
                              'CLAIM NOW',
                              style: TextStyle(
                                color: AppColors.primary,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
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

  Widget _buildOffersSection(
    BuildContext context,
    Color surfaceColor,
    Color textPrimary,
    Color textSecondary,
    Color borderColor,
  ) {
    if (_isLoadingOffers) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        child: Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
      );
    }

    if (_offers.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Nearby Offers',
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              GestureDetector(
                onTap: _fetchOffers,
                child: Icon(Icons.refresh, color: AppColors.primary),
              ),
            ],
          ),
          if (_promotionMessage != null)
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 8),
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.all(12),
                child: Text(
                  _promotionMessage!,
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          SizedBox(
            height: 160,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _offers.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final offer = _offers[index];
                final discountType =
                    offer['offer_type']?.toString() ?? 'percentage';
                final discountValue =
                    offer['discount_value'] ??
                    offer['discount_percentage'] ??
                    0;
                final discountText = discountType == 'percentage'
                    ? '${discountValue.toString()}% off'
                    : discountType == 'fixed_amount'
                    ? '\$${discountValue.toString()}'
                    : discountType == 'free_delivery'
                    ? 'Free delivery'
                    : 'Special deal';
                return GestureDetector(
                  onTap: () => Navigator.pushNamed(
                    context,
                    AppRoutes.offerDetails,
                    arguments: {'offer': offer},
                  ),
                  child: Container(
                    width: 220,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: surfaceColor,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: borderColor),
                    ),
                    child: Stack(
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    offer['name'] ?? 'Promo',
                                    style: TextStyle(
                                      color: textPrimary,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 36),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              offer['vendor_name']?.toString() ?? '',
                              style: TextStyle(
                                color: AppColors.primary,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              offer['description'] ?? discountText,
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 13,
                                height: 1.4,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const Spacer(),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    discountText,
                                    style: const TextStyle(
                                      color: AppColors.primary,
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                Icon(
                                  Icons.local_offer,
                                  color: AppColors.primary.withOpacity(0.8),
                                  size: 20,
                                ),
                              ],
                            ),
                          ],
                        ),
                        Positioned(
                          top: 0,
                          right: 0,
                          child: Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: surfaceColor,
                              shape: BoxShape.circle,
                              border: Border.all(color: borderColor),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: _buildLogoWidget(
                              offer['vendor_logo'],
                              size: 34,
                              fallbackIcon: Icons.store,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDiscountedProductsSection(
    BuildContext context,
    Color surfaceColor,
    Color textPrimary,
    Color textSecondary,
    Color borderColor,
  ) {
    if (_discountedProducts.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Discounted Products',
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Icon(Icons.flash_on, color: Colors.orange),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 220,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _discountedProducts.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final product = _discountedProducts[index];
                final String name =
                    product['product_name'] ?? product['name'] ?? '';
                final double originalPrice =
                    (product['original_price'] ??
                            product['selling_price'] ??
                            0.0)
                        .toDouble();
                final double discountedPrice =
                    (product['discounted_price'] ?? product['price'] ?? 0.0)
                        .toDouble();
                final String? offerBadge = product['offer_badge']?.toString();
                final String imageUrl = product['image_url']?.toString() ?? '';
                final String fullImageUrl = imageUrl.startsWith('http')
                    ? imageUrl
                    : '${ApiService.baseUrl.replaceAll('/api', '')}$imageUrl';

                return GestureDetector(
                  onTap: () {
                    Navigator.pushNamed(
                      context,
                      AppRoutes.productDetails,
                      arguments: Map<String, dynamic>.from(product),
                    ).then((_) => _fetchOffers());
                  },
                  child: Container(
                    width: 160,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: surfaceColor,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: imageUrl.isNotEmpty
                                ? Image.network(
                                    fullImageUrl,
                                    width: double.infinity,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => const Icon(
                                      Icons.handyman,
                                      color: Colors.grey,
                                      size: 40,
                                    ),
                                  )
                                : const Icon(
                                    Icons.handyman,
                                    color: Colors.grey,
                                    size: 40,
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          name,
                          style: TextStyle(
                            color: textPrimary,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Text(
                              '\$${originalPrice.toStringAsFixed(2)}',
                              style: const TextStyle(
                                color: Colors.grey,
                                decoration: TextDecoration.lineThrough,
                                fontSize: 11,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.red.shade100,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                offerBadge ?? 'SALE',
                                style: const TextStyle(
                                  color: Colors.red,
                                  fontSize: 8,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '\$${discountedPrice.toStringAsFixed(2)}',
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLimitedTimeDealsSection(
    BuildContext context,
    Color surfaceColor,
    Color textPrimary,
    Color textSecondary,
    Color borderColor,
  ) {
    if (_limitedTimeDeals.isEmpty) {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Limited Time Deals',
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Icon(Icons.timer, color: Colors.redAccent),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 220,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _limitedTimeDeals.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final product = _limitedTimeDeals[index];
                final String name =
                    product['product_name'] ?? product['name'] ?? '';
                final double originalPrice =
                    (product['original_price'] ??
                            product['selling_price'] ??
                            0.0)
                        .toDouble();
                final double discountedPrice =
                    (product['discounted_price'] ?? product['price'] ?? 0.0)
                        .toDouble();
                final String? offerBadge = product['offer_badge']?.toString();
                final String? offerExpiry = product['offer_expiry']?.toString();
                final String? formattedExpiry = _formatOfferExpiry(offerExpiry);
                final String imageUrl = product['image_url']?.toString() ?? '';
                final String fullImageUrl = imageUrl.startsWith('http')
                    ? imageUrl
                    : '${ApiService.baseUrl.replaceAll('/api', '')}$imageUrl';

                return GestureDetector(
                  onTap: () {
                    Navigator.pushNamed(
                      context,
                      AppRoutes.productDetails,
                      arguments: Map<String, dynamic>.from(product),
                    ).then((_) => _fetchOffers());
                  },
                  child: Container(
                    width: 160,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: surfaceColor,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: imageUrl.isNotEmpty
                                ? Image.network(
                                    fullImageUrl,
                                    width: double.infinity,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => const Icon(
                                      Icons.handyman,
                                      color: Colors.grey,
                                      size: 40,
                                    ),
                                  )
                                : const Icon(
                                    Icons.handyman,
                                    color: Colors.grey,
                                    size: 40,
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          name,
                          style: TextStyle(
                            color: textPrimary,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Text(
                              '\$${originalPrice.toStringAsFixed(2)}',
                              style: const TextStyle(
                                color: Colors.grey,
                                decoration: TextDecoration.lineThrough,
                                fontSize: 11,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.red.shade100,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                offerBadge ?? 'DEAL',
                                style: const TextStyle(
                                  color: Colors.red,
                                  fontSize: 8,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '\$${discountedPrice.toStringAsFixed(2)}',
                          style: const TextStyle(
                            color: Colors.redAccent,
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                        if (formattedExpiry != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Ends $formattedExpiry',
                            style: const TextStyle(
                              color: Colors.orange,
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildServicesGrid(
    BuildContext context, {
    required Color surfaceColor,
    required Color textPrimary,
    required Color textSecondary,
    required Color borderColor,
  }) {
    if (_categories.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        child: Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
          childAspectRatio: 0.85,
        ),
        itemCount: _categories.length,
        itemBuilder: (context, index) {
          final category = _categories[index];
          final name = category['name']?.toString().toLowerCase() ?? '';
          // Car wash is matched first and by several spellings ("Car service",
          // "Car Wash", "carwash") — otherwise it fell through to the fuel
          // station route and opened the Petrol page by mistake.
          String route;
          if (_isCarWashCategory(name)) {
            route = AppRoutes.carWashServices;
          } else if (name.contains('gas')) {
            route = AppRoutes.selectGasStation;
          } else if (name.contains('spare')) {
            route = AppRoutes.spareParts;
          } else {
            route = AppRoutes.selectStation;
          }
          return _ZoomOutCategoryCard(
            key: ValueKey('cat_${category['id']}'),
            onTap: () => Navigator.pushNamed(
              context,
              route,
              arguments: {'product': category['name']},
            ),
            child: Container(
              decoration: BoxDecoration(
                color: surfaceColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: borderColor),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(20),
                        topRight: Radius.circular(20),
                      ),
                      child: _serviceCardImage(
                        name,
                        borderColor,
                        remoteImageUrl: category['image_url']?.toString(),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          category['name'] ?? 'Service',
                          style: TextStyle(
                            color: textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          category['description']?.toString().trim().isNotEmpty == true
                              ? category['description'].toString()
                              : _isCarWashCategory(name)
                                  ? 'Book a professional car service'
                                  : 'Select to view options',
                          style: TextStyle(color: textSecondary, fontSize: 12),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  /// True for any spelling of the car wash category ("Car service", "Car Wash",
  /// "carwash"). Used for both routing and card artwork.
  bool _isCarWashCategory(String name) {
    final n = name.toLowerCase();
    return n.contains('wash') || n.contains('service') || n.contains('carwash');
  }

  /// Card artwork for a service category.
  /// Order of preference: vendor/admin-uploaded image → bundled asset →
  /// designed illustration. Never leaves a flat colour block.
  Widget _serviceCardImage(
    String categoryName,
    Color borderColor, {
    String? remoteImageUrl,
  }) {
    // 1. An image uploaded via the admin Categories page always wins.
    final raw = (remoteImageUrl ?? '').trim();
    if (raw.isNotEmpty) {
      final url = raw.startsWith('http')
          ? raw
          : '${ApiService.baseUrl.replaceAll('/api', '')}$raw';
      return Image.network(
        url,
        width: double.infinity,
        height: double.infinity,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return _serviceImageLoading(borderColor);
        },
        errorBuilder: (_, __, ___) =>
            _serviceAssetImage(categoryName, borderColor),
      );
    }
    // 2. Fall back to the bundled asset for this category.
    return _serviceAssetImage(categoryName, borderColor);
  }

  Widget _serviceAssetImage(String categoryName, Color borderColor) {
    String? assetPath;
    final catName = categoryName.toLowerCase();
    if (_isCarWashCategory(categoryName)) {
      assetPath = 'assets/images/car_service.png';
    } else if (catName.contains('gas') ||
        catName.contains('cylinder')) {
      assetPath = 'assets/images/gas.png';
    } else if (catName.contains('spare') ||
        catName.contains('part')) {
      assetPath = 'assets/images/spare_parts.png';
    } else if (catName.contains('fuel') ||
        catName.contains('petrol') ||
        catName.contains('diesel')) {
      assetPath = 'assets/images/diesel.png';
    }

    if (assetPath != null) {
      return Image.asset(
        assetPath,
        width: double.infinity,
        height: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) =>
            _serviceIllustration(categoryName, borderColor),
      );
    }
    return _serviceIllustration(categoryName, borderColor);
  }

  Widget _serviceImageLoading(Color borderColor) {
    return Container(
      color: borderColor.withValues(alpha: 0.15),
      child: const Center(
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }

  /// Designed gradient illustration used when no photo is available — far more
  /// presentable than the flat placeholder block it replaces.
  Widget _serviceIllustration(String categoryName, Color borderColor) {
    late final List<Color> colors;
    late final IconData icon;
    if (_isCarWashCategory(categoryName)) {
      colors = const [Color(0xFF2563EB), Color(0xFF0EA5E9)];
      icon = Icons.local_car_wash;
    } else if (categoryName.contains('gas') ||
        categoryName.contains('cylinder')) {
      colors = const [Color(0xFFF97316), Color(0xFFFBBF24)];
      icon = Icons.propane_tank;
    } else if (categoryName.contains('spare') ||
        categoryName.contains('part')) {
      colors = const [Color(0xFF6366F1), Color(0xFF8B5CF6)];
      icon = Icons.build;
    } else {
      colors = const [Color(0xFF0F766E), Color(0xFF14B8A6)];
      icon = Icons.local_gas_station;
    }

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -18,
            bottom: -18,
            child: Icon(
              icon,
              size: 96,
              color: Colors.white.withValues(alpha: 0.18),
            ),
          ),
          Center(
            child: Icon(icon, size: 40, color: Colors.white.withValues(alpha: 0.95)),
          ),
        ],
      ),
    );
  }

  Widget _buildRecentOrder(
    BuildContext context,
    dynamic order, {
    required Color surfaceColor,
    required Color textPrimary,
    required Color textSecondary,
    required Color borderColor,
  }) {
    DateTime? date;
    try {
      date = DateTime.parse(order['created_at']);
    } catch (_) {}
    final formattedDate = date != null
        ? DateFormat('MMM dd, yyyy').format(date)
        : 'Unknown date';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: borderColor.withOpacity(0.6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.local_gas_station,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Order from ${order['vendor_name'] ?? 'Vendor'}',
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Ordered on $formattedDate',
                  style: TextStyle(color: textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '\$${order['total_amount'] ?? '0'}',
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                order['status'].toString().toUpperCase(),
                style: TextStyle(
                  color: order['status'] == 'Delivered'
                      ? AppColors.success
                      : AppColors.warning,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNav(
    BuildContext context, {
    required Color bgColor,
    required Color borderColor,
    required Color textSecondary,
    required int unreadCount,
  }) {
    return Container(
      height: 80,
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(top: BorderSide(color: borderColor)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(
            context,
            Icons.home_filled,
            'Home',
            true,
            textSecondary: textSecondary,
            route: AppRoutes.home,
          ),
          _buildNavItem(
            context,
            Icons.receipt_long,
            'Orders',
            false,
            textSecondary: textSecondary,
            route: AppRoutes.history,
          ),
          _buildNavItem(
            context,
            Icons.local_gas_station,
            'Stations',
            false,
            textSecondary: textSecondary,
            route: AppRoutes.selectStation,
          ),
          _buildNavItem(
            context,
            Icons.person,
            'Profile',
            false,
            textSecondary: textSecondary,
            route: AppRoutes.profile,
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context,
    IconData icon,
    String label,
    bool isSelected, {
    int badgeCount = 0,
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
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              alignment: Alignment.center,
              clipBehavior: Clip.none,
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
                ),
                // Icon
                AnimatedScale(
                  scale: isSelected ? 1.05 : 0.95,
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOutBack,
                  child: Icon(
                    icon,
                    color: isSelected ? Colors.white : inactiveColor,
                    size: 24,
                  ),
                ),
                // Badge
                if (badgeCount > 0)
                  Positioned(
                    right: isSelected ? -4 : -6,
                    top: isSelected ? -4 : -6,
                    child: TweenAnimationBuilder<double>(
                      tween: Tween<double>(begin: 0.5, end: 1.0),
                      duration: const Duration(milliseconds: 350),
                      curve: Curves.elasticOut,
                      builder: (context, scale, child) {
                        return Transform.scale(
                          scale: scale,
                          child: child,
                        );
                      },
                      child: Container(
                        constraints: const BoxConstraints(
                          minWidth: 18,
                          minHeight: 18,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        decoration: BoxDecoration(
                          color: AppColors.error,
                          borderRadius: BorderRadius.circular(9),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          badgeCount > 99 ? '99+' : badgeCount.toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutBack,
              style: TextStyle(
                color: isSelected ? activeColor : inactiveColor,
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
              ),
              child: Text(label),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLogoWidget(
    dynamic logo, {
    double size = 34,
    IconData fallbackIcon = Icons.store,
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

bool _hasCategoryEntrancePlayed = false;

class _ZoomOutCategoryCard extends StatefulWidget {
  final Widget child;
  final VoidCallback onTap;

  const _ZoomOutCategoryCard({
    super.key,
    required this.child,
    required this.onTap,
  });

  @override
  State<_ZoomOutCategoryCard> createState() => _ZoomOutCategoryCardState();
}

class _ZoomOutCategoryCardState extends State<_ZoomOutCategoryCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _zoomOutAnimation;
  bool _isPressed = false;
  bool _isHovered = false;
  late bool _shouldPlayEntrance;

  @override
  void initState() {
    super.initState();
    _shouldPlayEntrance = !_hasCategoryEntrancePlayed;

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );

    if (_shouldPlayEntrance) {
      _zoomOutAnimation = Tween<double>(begin: 1.06, end: 1.0).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
      );
      _controller.forward().then((_) {
        _hasCategoryEntrancePlayed = true;
      });
    } else {
      _zoomOutAnimation = const AlwaysStoppedAnimation(1.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    double userScale = _isPressed
        ? 0.96
        : _isHovered
            ? 1.02
            : 1.0;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: GestureDetector(
        onTapDown: (_) => setState(() => _isPressed = true),
        onTapUp: (_) => setState(() => _isPressed = false),
        onTapCancel: () => setState(() => _isPressed = false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: userScale,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          child: _shouldPlayEntrance
              ? AnimatedBuilder(
                  animation: _zoomOutAnimation,
                  builder: (context, child) {
                    return Transform.scale(
                      scale: _zoomOutAnimation.value,
                      child: child,
                    );
                  },
                  child: widget.child,
                )
              : widget.child,
        ),
      ),
    );
  }
}
