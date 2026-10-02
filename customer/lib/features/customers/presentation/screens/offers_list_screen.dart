import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/utils/api_service.dart';

class OffersListScreen extends StatefulWidget {
  /// Pre-loaded offers passed directly (e.g. from Claim Now that already fetched them).
  final List<Map<String, dynamic>>? initialOffers;

  const OffersListScreen({super.key, this.initialOffers});

  @override
  State<OffersListScreen> createState() => _OffersListScreenState();
}

class _OffersListScreenState extends State<OffersListScreen> {
  List<Map<String, dynamic>> _offers = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.initialOffers != null) {
      _offers = widget.initialOffers!;
      _isLoading = false;
    }
    // Route arguments are read in didChangeDependencies
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isLoading) return; // Already resolved via constructor

    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map && args['offers'] is List) {
      final raw = args['offers'] as List;
      final now = DateTime.now();
      _offers = raw
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
      _isLoading = false;
    } else {
      // No pre-loaded offers: fetch from backend
      _fetchOffers();
    }
  }


  Future<void> _fetchOffers() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final response = await ApiService.get('/customer/offers');
      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        final raw = body['offers'];
        final now = DateTime.now();
        final offers = (raw is List ? raw : [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .where((o) {
              // Hide expired offers
              final endDate = o['end_date'];
              if (endDate != null && endDate.toString().isNotEmpty) {
                final exp = DateTime.tryParse(endDate.toString());
                if (exp != null && exp.isBefore(now)) return false;
              }
              return true;
            })
            .toList();
        if (mounted) {
          setState(() {
            _offers = offers;
            _isLoading = false;
          });
        }
      } else {
        if (mounted) setState(() {
          _error = 'Failed to load offers.';
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() {
        _error = 'Network error. Please try again.';
        _isLoading = false;
      });
    }
  }

  void _openOffer(Map<String, dynamic> offer) {
    Navigator.pushNamed(
      context,
      AppRoutes.offerDetails,
      arguments: {'offer': offer},
    );
  }

  String _discountLabel(Map<String, dynamic> offer) {
    final type = offer['offer_type']?.toString() ?? 'percentage';
    final value = offer['discount_value'] ?? offer['discount_percentage'] ?? 0;
    if (type == 'free_delivery') return 'Free Delivery';
    if (type == 'fixed_amount') return '\$${value.toString()} OFF';
    return '${value.toString()}% OFF';
  }

  String _expiryLabel(Map<String, dynamic> offer) {
    final endDate = offer['end_date'];
    if (endDate == null || endDate.toString().isEmpty) return 'No expiry';
    final exp = DateTime.tryParse(endDate.toString());
    if (exp == null) return 'No expiry';
    final diff = exp.difference(DateTime.now());
    if (diff.inDays > 1) return 'Expires in ${diff.inDays} days';
    if (diff.inHours >= 1) return 'Expires in ${diff.inHours}h';
    if (diff.inMinutes >= 1) return 'Expires in ${diff.inMinutes}m';
    return 'Expiring soon';
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = cs.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary =
        isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final surfaceColor = isDark ? AppColors.surfaceDark : Colors.white;

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
          'Active Promotions',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 20,
          ),
        ),
        actions: [
          IconButton(
            onPressed: _fetchOffers,
            icon: Icon(Icons.refresh, color: AppColors.primary),
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _fetchOffers,
        child: _buildBody(
          textPrimary,
          textSecondary,
          borderColor,
          surfaceColor,
          isDark,
        ),
      ),
    );
  }

  Widget _buildBody(
    Color textPrimary,
    Color textSecondary,
    Color borderColor,
    Color surfaceColor,
    bool isDark,
  ) {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.wifi_off, size: 48, color: textSecondary.withValues(alpha: 0.5)),
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: _fetchOffers,
              icon: const Icon(Icons.refresh),
              label: const Text('Try Again'),
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: Colors.white),
            ),
          ],
        ),
      );
    }

    if (_offers.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(height: MediaQuery.of(context).size.height * 0.25),
          Center(
            child: Column(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.local_offer_outlined, size: 40, color: AppColors.primary),
                ),
                const SizedBox(height: 20),
                Text(
                  'No active promotions available.',
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Check back later for new deals.',
                  style: TextStyle(color: textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      itemCount: _offers.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final offer = _offers[index];
        return _OfferCard(
          offer: offer,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
          borderColor: borderColor,
          surfaceColor: surfaceColor,
          discountLabel: _discountLabel(offer),
          expiryLabel: _expiryLabel(offer),
          onTap: () => _openOffer(offer),
        );
      },
    );
  }
}

class _OfferCard extends StatelessWidget {
  final Map<String, dynamic> offer;
  final Color textPrimary;
  final Color textSecondary;
  final Color borderColor;
  final Color surfaceColor;
  final String discountLabel;
  final String expiryLabel;
  final VoidCallback onTap;

  const _OfferCard({
    required this.offer,
    required this.textPrimary,
    required this.textSecondary,
    required this.borderColor,
    required this.surfaceColor,
    required this.discountLabel,
    required this.expiryLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final vendorName =
        (offer['vendor_name'] ?? offer['business_name'] ?? 'Vendor').toString();
    final offerName = (offer['name'] ?? offer['title'] ?? 'Special Offer').toString();
    final description = offer['description']?.toString() ?? '';

    // Compute discounted price display if product price is available
    final originalPrice = double.tryParse(offer['original_price']?.toString() ?? '');
    final discountedPrice = double.tryParse(offer['discounted_price']?.toString() ?? '');

    return Material(
      color: surfaceColor,
      borderRadius: BorderRadius.circular(20),
      elevation: 0,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: borderColor.withValues(alpha: 0.7)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Gradient header
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppColors.primary,
                      AppColors.primary.withValues(alpha: 0.75),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(20),
                    topRight: Radius.circular(20),
                  ),
                ),
                 child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: _buildLogoWidget(offer['vendor_logo'] ?? offer['logo']),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            offerName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            vendorName,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.8),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        discountLabel,
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w900,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Body
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (description.isNotEmpty) ...[
                      Text(
                        description,
                        style: TextStyle(
                          color: textSecondary,
                          fontSize: 13,
                          height: 1.4,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 10),
                    ],

                    // Price info
                    if (originalPrice != null && discountedPrice != null) ...[
                      Row(
                        children: [
                          Text(
                            '\$${originalPrice.toStringAsFixed(2)}',
                            style: TextStyle(
                              color: textSecondary,
                              fontSize: 13,
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '\$${discountedPrice.toStringAsFixed(2)}',
                            style: const TextStyle(
                              color: AppColors.success,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                    ],

                    // Footer row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.access_time,
                              size: 14,
                              color: textSecondary.withValues(alpha: 0.7),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              expiryLabel,
                              style: TextStyle(
                                color: textSecondary.withValues(alpha: 0.7),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'View Deal',
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
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLogoWidget(dynamic logo, {double size = 40, IconData fallbackIcon = Icons.storefront_outlined}) {
    if (logo == null || logo.toString().isEmpty) {
      return Icon(fallbackIcon, color: AppColors.primary, size: size * 0.5);
    }
    final logoStr = logo.toString();
    final url = logoStr.startsWith('http') ? logoStr : '${ApiService.baseUrl.replaceAll('/api', '')}$logoStr';
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
