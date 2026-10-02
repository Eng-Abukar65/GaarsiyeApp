import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_typography.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../shared/widgets/customer_bottom_nav.dart';

class SelectFuelStationScreen extends StatefulWidget {
  const SelectFuelStationScreen({super.key});

  @override
  State<SelectFuelStationScreen> createState() =>
      _SelectFuelStationScreenState();
}

class _SelectFuelStationScreenState extends State<SelectFuelStationScreen> {
  List<dynamic> _allVendors = [];
  List<dynamic> _filteredVendors = [];
  String? _product;
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedFilter = 'Nearest';
  double? _customerLat;
  double? _customerLng;

  double _asDouble(dynamic value, {double fallback = 0.0}) {
    if (value == null) return fallback;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? fallback;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final rawArgs = ModalRoute.of(context)?.settings.arguments;
    final args = (rawArgs != null && rawArgs is Map)
        ? Map<String, dynamic>.from(rawArgs)
        : null;
    if (args != null && args.containsKey('product')) {
      _product = args['product'];
    }
    _fetchVendors();
  }

  Future<void> _fetchVendors() async {
    setState(() => _isLoading = true);
    try {
      await _loadCustomerLocation();
      final endpoint = _product != null
          ? '/customer/vendors-search?product=$_product'
          : '/customer/vendors';
      final response = await ApiService.get(endpoint);
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        final List<dynamic> items = decoded is List
            ? List<dynamic>.from(decoded)
            : (decoded is Map && decoded['data'] is List
                  ? List<dynamic>.from(decoded['data'])
                  : []);

        for (var v in items) {
          print(
            'DEBUG VENDOR STATUS: Received vendor ${v['business_name'] ?? v['name']}, is_open: ${v['is_open']}, status_label: ${v['status_label']}',
          );
        }
        setState(() {
          _allVendors = items;
          _applyFilters();
        });
      }
    } catch (e) {
      print('Error fetching vendors: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _loadCustomerLocation() async {
    try {
      final response = await ApiService.get('/customer/location');
      if (response.statusCode != 200) return;
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      _customerLat = _asNullableDouble(data['latitude']);
      _customerLng = _asNullableDouble(data['longitude']);
    } catch (e) {
      debugPrint('Customer location unavailable for station distance: $e');
    }
  }

  double? _asNullableDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }

  double? _vendorDistanceKm(dynamic vendor) {
    final customerLat = _customerLat;
    final customerLng = _customerLng;
    final vendorLat = _asNullableDouble(
      vendor['latitude'] ?? vendor['vendor_latitude'] ?? vendor['lat'],
    );
    final vendorLng = _asNullableDouble(
      vendor['longitude'] ?? vendor['vendor_longitude'] ?? vendor['lng'],
    );
    if (customerLat == null ||
        customerLng == null ||
        vendorLat == null ||
        vendorLng == null) {
      return null;
    }

    const earthRadiusKm = 6371.0;
    final dLat = _degToRad(vendorLat - customerLat);
    final dLng = _degToRad(vendorLng - customerLng);
    final a =
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_degToRad(customerLat)) *
            math.cos(_degToRad(vendorLat)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  double _degToRad(double degrees) => degrees * (math.pi / 180.0);

  String _formatDistance(dynamic vendor) {
    final distance = _vendorDistanceKm(vendor);
    if (distance == null) return 'Distance unavailable';
    if (distance < 1) return '${(distance * 1000).round()} m away';
    return '${distance.toStringAsFixed(distance < 10 ? 1 : 0)} km away';
  }

  void _applyFilters() {
    List<dynamic> result = List<dynamic>.from(_allVendors);

    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      result = result.where((v) {
        final name = (v['business_name'] ?? v['name'] ?? '')
            .toString()
            .toLowerCase();
        final addr = (v['address'] ?? '').toString().toLowerCase();
        return name.contains(q) || addr.contains(q);
      }).toList();
    }

    if (_selectedFilter == 'Open Now') {
      result = result.where((v) => v['status_label'] == 'OPEN').toList();
    } else if (_selectedFilter == 'Nearest') {
      result.sort((a, b) {
        final dA = _vendorDistanceKm(a) ?? double.infinity;
        final dB = _vendorDistanceKm(b) ?? double.infinity;
        return dA.compareTo(dB);
      });
    } else if (_selectedFilter == 'Top Rated') {
      result.sort((a, b) {
        final rA = _asDouble(a['rating']);
        final rB = _asDouble(b['rating']);
        return rB.compareTo(rA);
      });
    } else if (_selectedFilter == 'Lowest Price') {
      result.sort((a, b) {
        final pA = _asDouble(a['price'], fallback: 999.0);
        final pB = _asDouble(b['price'], fallback: 999.0);
        return pA.compareTo(pB);
      });
    }

    setState(() {
      _filteredVendors = result;
    });
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    final bool isEmptyList = _filteredVendors.isEmpty;
    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            _buildHeader(context),

            // Search and Filters
            _buildSearchAndFilters(),

            // Station List
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : isEmptyList
                  ? Center(
                      child: Text(
                        'No vendors available matching filters',
                        style: TextStyle(color: textSecondary, fontSize: 16),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(AppSpacing.m),
                      physics: const BouncingScrollPhysics(),
                      itemCount: _filteredVendors.length,
                      itemBuilder: (context, index) {
                        return _buildStationCard(
                          context,
                          _filteredVendors[index],
                        );
                      },
                    ),
            ),

            // Bottom Nav
            const CustomerBottomNav(currentTab: CustomerNavTab.stations),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final theme = Theme.of(context);
    final textPrimary = theme.colorScheme.onSurface;
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(Icons.arrow_back, color: textPrimary),
            style: IconButton.styleFrom(
              backgroundColor: isDark
                  ? AppColors.surfaceDark.withAlpha(76)
                  : Colors.black.withAlpha(25),
            ),
          ),
          const SizedBox(width: AppSpacing.m),
          Text(
            'Select Fuel Station',
            style: TextStyle(
              color: textPrimary,
              fontSize: 20,
              fontWeight: FontWeight.bold,
              letterSpacing: -0.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = theme.colorScheme.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final searchBg = isDark
        ? AppColors.surfaceDark.withAlpha(127)
        : Colors.grey.shade100;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
      child: Column(
        children: [
          Container(
            height: 54,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: searchBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: borderColor.withAlpha(100)),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.search,
                  color: textSecondary.withAlpha(200),
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    style: TextStyle(
                      color: textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w400,
                    ),
                    onChanged: (val) {
                      setState(() {
                        _searchQuery = val;
                        _applyFilters();
                      });
                    },
                    decoration: InputDecoration(
                      hintText: 'Search for fuel stations...',
                      hintStyle: TextStyle(
                        color: textSecondary.withAlpha(160),
                        fontSize: 15,
                        fontWeight: FontWeight.w400,
                      ),
                      border: InputBorder.none,
                    ),
                  ),
                ),
                if (_searchQuery.isNotEmpty)
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _searchQuery = '';
                        _applyFilters();
                      });
                    },
                    child: Icon(
                      Icons.clear,
                      color: textSecondary,
                      size: 20,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.m),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            child: Row(
              children: [
                _buildFilterChip('Nearest', _selectedFilter == 'Nearest', () {
                  setState(() {
                    _selectedFilter = 'Nearest';
                    _applyFilters();
                  });
                }),
                _buildFilterChip(
                  'Top Rated',
                  _selectedFilter == 'Top Rated',
                  () {
                    setState(() {
                      _selectedFilter = 'Top Rated';
                      _applyFilters();
                    });
                  },
                ),
                _buildFilterChip(
                  'Lowest Price',
                  _selectedFilter == 'Lowest Price',
                  () {
                    setState(() {
                      _selectedFilter = 'Lowest Price';
                      _applyFilters();
                    });
                  },
                ),
                _buildFilterChip('Open Now', _selectedFilter == 'Open Now', () {
                  setState(() {
                    _selectedFilter = 'Open Now';
                    _applyFilters();
                  });
                }),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, bool isSelected, VoidCallback onTap) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final chipBg = isDark
        ? AppColors.surfaceDark.withAlpha(128)
        : Colors.grey.shade200;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : chipBg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        ),
        child: Row(
          children: [
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : textSecondary,
                fontSize: 13,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.expand_more,
              size: 14,
              color: isSelected ? Colors.white : textSecondary,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStationCard(BuildContext context, dynamic vendor) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = theme.colorScheme.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final cardBg = isDark
        ? AppColors.surfaceDark.withAlpha(51)
        : Colors.grey.shade100;
    final imageBg = isDark ? AppColors.surfaceCard : Colors.grey.shade200;

    final statusLabel = vendor['status_label']?.toString() ?? 'OPEN';
    final isOpen = statusLabel == 'OPEN';
    final rating = _asDouble(vendor['rating']);
    print(
      'DEBUG RENDER STATUS: Vendor ${vendor['business_name'] ?? vendor['name']}, rendered status: $statusLabel',
    );

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.m),
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderColor.withAlpha(127)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: imageBg,
              borderRadius: BorderRadius.circular(AppSpacing.radiusM),
            ),
            clipBehavior: Clip.antiAlias,
            child: _buildLogoWidget(vendor['logo'] ?? vendor['logo_url']),
          ),
          const SizedBox(width: AppSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      vendor['business_name'] ?? vendor['name'] ?? 'Station',
                      style: TextStyle(
                        color: textPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    Row(
                      children: [
                        Icon(
                          rating > 0 ? Icons.star : Icons.star_border,
                          color: Colors.amber,
                          size: 14,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          rating > 0 ? rating.toStringAsFixed(1) : 'New',
                          style: const TextStyle(
                            color: Colors.amber,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.location_on, color: textSecondary, size: 12),
                    const SizedBox(width: 4),
                    Text(
                      _formatDistance(vendor),
                      style: TextStyle(color: textSecondary, fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'STATUS',
                          style: AppTypography.badge.copyWith(
                            color: textSecondary.withAlpha(153),
                            fontSize: 9,
                          ),
                        ),
                        Text(
                          statusLabel,
                          style: TextStyle(
                            color: isOpen ? AppColors.primary : AppColors.error,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    ElevatedButton(
                      onPressed: () {
                        Navigator.pushNamed(
                          context,
                          AppRoutes.selectFuelType,
                          arguments: {'vendor': vendor, 'product': _product},
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 8,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(
                            AppSpacing.radiusM,
                          ),
                        ),
                      ),
                      child: const Text(
                        'Select',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNav(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    return Container(
      padding: const EdgeInsets.only(top: 12, bottom: 24, left: 16, right: 16),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(
          top: BorderSide(color: borderColor.withAlpha(76), width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(
            context,
            Icons.home_outlined,
            'HOME',
            false,
            route: AppRoutes.home,
          ),
          _buildNavItem(
            context,
            Icons.history,
            'ORDERS',
            false,
            route: AppRoutes.history,
          ),
          _buildNavItem(
            context,
            Icons.local_gas_station,
            'STATIONS',
            true,
            route: AppRoutes.selectStation,
          ),
          _buildNavItem(
            context,
            Icons.person_outline,
            'PROFILE',
            false,
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
    String? route,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final unselectedColor = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    return GestureDetector(
      onTap: () {
        if (route != null && !isSelected) {
          Navigator.pushNamed(context, route);
        }
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            color: isSelected ? AppColors.primary : unselectedColor,
            size: 24,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppTypography.label.copyWith(
              fontSize: 10,
              color: isSelected ? AppColors.primary : unselectedColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogoWidget(
    dynamic logo, {
    double size = 80,
    IconData fallbackIcon = Icons.local_gas_station,
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
