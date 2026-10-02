import 'dart:convert';
import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';

/// Car Wash landing page: approved + active car wash vendors only,
/// with search, filters (open now / max price / min rating) and sorting.
class CarWashServiceScreen extends StatefulWidget {
  const CarWashServiceScreen({super.key});

  @override
  State<CarWashServiceScreen> createState() => _CarWashServiceScreenState();
}

class _CarWashServiceScreenState extends State<CarWashServiceScreen> {
  List<Map<String, dynamic>> _vendors = [];
  bool _isLoading = true;
  String _errorMessage = '';

  String _searchQuery = '';
  bool _openNowOnly = false;
  double? _maxPrice;
  double _minRating = 0;
  String _sortBy = 'rating'; // rating | price | name

  double _asDouble(dynamic v) =>
      v is num ? v.toDouble() : double.tryParse('$v') ?? 0;

  @override
  void initState() {
    super.initState();
    _fetchVendors();
  }

  Future<void> _fetchVendors() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });
    try {
      final response = await ApiService.get('/customer/car-wash/vendors');
      final body = jsonDecode(response.body);
      if (response.statusCode == 200 && body['success'] == true) {
        setState(() {
          _vendors = List<Map<String, dynamic>>.from(body['data'] ?? []);
          _isLoading = false;
        });
      } else {
        setState(() {
          _errorMessage =
              body['message']?.toString() ?? 'Failed to load car wash vendors.';
          _isLoading = false;
        });
      }
    } catch (_) {
      setState(() {
        _errorMessage = ApiService.connectionErrorMessage;
        _isLoading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _visibleVendors {
    var list = _vendors.where((v) {
      final q = _searchQuery.trim().toLowerCase();
      if (q.isNotEmpty) {
        final name = (v['business_name'] ?? '').toString().toLowerCase();
        final city = (v['city'] ?? '').toString().toLowerCase();
        if (!name.contains(q) && !city.contains(q)) return false;
      }
      if (_openNowOnly && v['is_open'] != true) return false;
      if (_maxPrice != null && _asDouble(v['starting_price']) > _maxPrice!) {
        return false;
      }
      if (_asDouble(v['rating']) < _minRating) return false;
      return true;
    }).toList();

    list.sort((a, b) {
      switch (_sortBy) {
        case 'price':
          return _asDouble(a['starting_price'])
              .compareTo(_asDouble(b['starting_price']));
        case 'name':
          return (a['business_name'] ?? '')
              .toString()
              .compareTo((b['business_name'] ?? '').toString());
        default:
          return _asDouble(b['rating']).compareTo(_asDouble(a['rating']));
      }
    });
    return list;
  }

  String _logoUrl(dynamic logo) {
    final raw = (logo ?? '').toString();
    if (raw.isEmpty) return '';
    return raw.startsWith('http')
        ? raw
        : '${ApiService.baseUrl.replaceAll('/api', '')}$raw';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        centerTitle: false,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Color(0xFF0F172A)),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Car Services',
          style: TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchVendors,
        color: AppColors.primary,
        child: Column(
          children: [
            _buildSearchAndFilters(),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Column(
        children: [
          TextField(
            onChanged: (v) => setState(() => _searchQuery = v),
            decoration: InputDecoration(
              hintText: 'Search car wash vendors...',
              hintStyle: const TextStyle(fontSize: 14),
              prefixIcon: const Icon(Icons.search, size: 20),
              isDense: true,
              filled: true,
              fillColor: AppColors.background,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _filterChip(
                  label: 'Open now',
                  selected: _openNowOnly,
                  onTap: () => setState(() => _openNowOnly = !_openNowOnly),
                ),
                _filterChip(
                  label: _maxPrice == null
                      ? 'Any price'
                      : '≤ \$${_maxPrice!.toStringAsFixed(0)}',
                  selected: _maxPrice != null,
                  onTap: _showPriceFilter,
                ),
                _filterChip(
                  label: _minRating == 0
                      ? 'Any rating'
                      : '${_minRating.toStringAsFixed(0)}★ +',
                  selected: _minRating > 0,
                  onTap: _showRatingFilter,
                ),
                _filterChip(
                  label: _sortBy == 'rating'
                      ? 'Top rated'
                      : _sortBy == 'price'
                          ? 'Lowest price'
                          : 'A–Z',
                  selected: true,
                  icon: Icons.swap_vert,
                  onTap: _showSortSheet,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
    IconData? icon,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.primary.withValues(alpha: 0.1)
                : AppColors.background,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 14, color: AppColors.primary),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color:
                      selected ? AppColors.primary : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showPriceFilter() {
    _showOptionsSheet(
      title: 'Filter by starting price',
      options: [
        ('Any price', () => setState(() => _maxPrice = null)),
        ('Up to \$5', () => setState(() => _maxPrice = 5)),
        ('Up to \$10', () => setState(() => _maxPrice = 10)),
        ('Up to \$20', () => setState(() => _maxPrice = 20)),
      ],
    );
  }

  void _showRatingFilter() {
    _showOptionsSheet(
      title: 'Filter by rating',
      options: [
        ('Any rating', () => setState(() => _minRating = 0)),
        ('3★ and above', () => setState(() => _minRating = 3)),
        ('4★ and above', () => setState(() => _minRating = 4)),
      ],
    );
  }

  void _showSortSheet() {
    _showOptionsSheet(
      title: 'Sort vendors',
      options: [
        ('Top rated first', () => setState(() => _sortBy = 'rating')),
        ('Lowest price first', () => setState(() => _sortBy = 'price')),
        ('Name A–Z', () => setState(() => _sortBy = 'name')),
      ],
    );
  }

  void _showOptionsSheet(
      {required String title,
      required List<(String, VoidCallback)> options}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text(
                title,
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            ...options.map(
              (o) => ListTile(
                title: Text(o.$1, style: const TextStyle(fontSize: 14)),
                onTap: () {
                  Navigator.pop(ctx);
                  o.$2();
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) return _buildSkeleton();
    if (_errorMessage.isNotEmpty) return _buildError();
    final vendors = _visibleVendors;
    if (vendors.isEmpty) return _buildEmpty();

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      itemCount: vendors.length,
      separatorBuilder: (_, i) => const SizedBox(height: 12),
      itemBuilder: (context, index) => _buildVendorCard(vendors[index]),
    );
  }

  Widget _buildSkeleton() {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: 4,
      separatorBuilder: (_, i) => const SizedBox(height: 12),
      itemBuilder: (_, i) => Container(
        height: 118,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  3,
                  (j) => Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    height: 12,
                    width: j == 0 ? 140 : (j == 1 ? 190 : 90),
                    decoration: BoxDecoration(
                      color: AppColors.background,
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        const Icon(Icons.cloud_off, size: 52, color: Color(0xFF94A3B8)),
        const SizedBox(height: 14),
        Text(
          _errorMessage,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
        ),
        const SizedBox(height: 16),
        Center(
          child: ElevatedButton(
            onPressed: _fetchVendors,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Retry'),
          ),
        ),
      ],
    );
  }

  Widget _buildEmpty() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: const [
        SizedBox(height: 80),
        Icon(Icons.local_car_wash, size: 52, color: Color(0xFF94A3B8)),
        SizedBox(height: 14),
        Text(
          'No car wash vendors match your filters.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Color(0xFF64748B), fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildVendorCard(Map<String, dynamic> vendor) {
    final logo = _logoUrl(vendor['logo']);
    final isOpen = vendor['is_open'] == true;
    final rating = _asDouble(vendor['rating']);
    final serviceCount = vendor['service_count'] ?? 0;
    final startingPrice = _asDouble(vendor['starting_price']);
    final minDuration = vendor['min_duration'] ?? 0;
    final location = [vendor['district'], vendor['city']]
        .where((x) => (x ?? '').toString().trim().isNotEmpty)
        .join(', ');

    return GestureDetector(
      onTap: () => Navigator.pushNamed(
        context,
        AppRoutes.carWashBooking,
        arguments: {'vendorId': vendor['id']},
      ),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: SizedBox(
                    width: 72,
                    height: 72,
                    child: logo.isNotEmpty
                        ? Image.network(
                            logo,
                            fit: BoxFit.cover,
                            errorBuilder: (a, b, c) => _logoFallback(),
                          )
                        : _logoFallback(),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              vendor['business_name'] ?? 'Car Wash',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Color(0xFF0F172A),
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: (isOpen
                                      ? AppColors.success
                                      : AppColors.error)
                                  .withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              isOpen ? 'Open' : 'Closed',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: isOpen
                                    ? AppColors.success
                                    : AppColors.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (location.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            const Icon(Icons.location_on_outlined,
                                size: 13, color: Color(0xFF94A3B8)),
                            const SizedBox(width: 3),
                            Expanded(
                              child: Text(
                                location,
                                style: const TextStyle(
                                    fontSize: 12, color: Color(0xFF64748B)),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          const Icon(Icons.star,
                              size: 14, color: Color(0xFFF59E0B)),
                          const SizedBox(width: 3),
                          Text(
                            rating > 0 ? rating.toStringAsFixed(1) : 'New',
                            style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF0F172A)),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            '$serviceCount services',
                            style: const TextStyle(
                                fontSize: 12, color: Color(0xFF64748B)),
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
                  child: Text(
                    'From \$${startingPrice.toStringAsFixed(2)}  •  ~$minDuration min',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'View Services',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _logoFallback() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF2563EB), Color(0xFF0EA5E9)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Icon(Icons.local_car_wash, color: Colors.white, size: 30),
    );
  }
}
