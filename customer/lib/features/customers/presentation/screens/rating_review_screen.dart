import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../shared/widgets/custom_button.dart';

class RatingReviewScreen extends StatefulWidget {
  const RatingReviewScreen({super.key});

  @override
  State<RatingReviewScreen> createState() => _RatingReviewScreenState();
}

class _RatingReviewScreenState extends State<RatingReviewScreen> {
  int _overallRating = 4;
  int _driverRating = 5;
  int _serviceRating = 4;
  final TextEditingController _commentController = TextEditingController();
  Map<String, dynamic> _order = {};
  bool _didReadArgs = false;
  bool _isSubmitting = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didReadArgs) return;
    _didReadArgs = true;

    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map) {
      _order = Map<String, dynamic>.from(args);
    }
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  String get _orderId {
    final value = _order['order_id'] ?? _order['id'];
    return value?.toString() ?? '';
  }

  String get _vendorName {
    return (_order['vendor_name'] ?? 'Vendor').toString();
  }

  String get _deliveredAt {
    final raw = (_order['delivered_at'] ?? _order['created_at'])?.toString() ?? '';
    if (raw.isEmpty) return '';
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return raw;
    final hour = parsed.hour.toString().padLeft(2, '0');
    final minute = parsed.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  Future<void> _submitReview() async {
    if (_orderId.isEmpty || _isSubmitting) return;

    setState(() => _isSubmitting = true);
    try {
      final response = await ApiService.post('/customer/orders/$_orderId/review', {
        'rating': _overallRating,
        'comment': _commentController.text.trim(),
        'driver_rating': _driverRating,
        'service_rating': _serviceRating,
      });

      final body = response.body.isNotEmpty ? jsonDecode(response.body) : {};
      if (response.statusCode == 200 || response.statusCode == 201) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(body['message']?.toString() ?? 'Review submitted successfully.')),
        );
        Navigator.pushNamedAndRemoveUntil(context, AppRoutes.history, (route) => false);
      } else {
        throw Exception(body['message']?.toString() ?? 'Failed to submit review.');
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            _buildAppBar(context),
            
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.all(AppSpacing.l),
                child: Column(
                  children: [
                    // Title
                    const SizedBox(height: AppSpacing.m),
                    Text(
                      'How was your delivery?',
                      style: TextStyle(color: cs.onSurface, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: -1),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _deliveredAt.isEmpty
                          ? 'Order #$_orderId from $_vendorName'
                          : 'Order #$_orderId delivered at $_deliveredAt',
                      style: TextStyle(color: cs.onSurface.withAlpha(153), fontSize: 13),
                    ),
                    const SizedBox(height: AppSpacing.xxl),
                    
                    // Overall Rating
                    Text('OVERALL EXPERIENCE', style: TextStyle(color: cs.onSurface.withAlpha(153), fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                    const SizedBox(height: 16),
                    _buildStars(_overallRating, (val) => setState(() => _overallRating = val), size: 44),
                    const SizedBox(height: AppSpacing.xxl),
                    
                    // Detailed Ratings
                    _buildRatingCard(
                      'Rate Driver',
                      'Your delivery experience',
                      'assets/images/user.png',
                      _driverRating, 
                      (val) => setState(() => _driverRating = val),
                    ),
                    const SizedBox(height: 16),
                    _buildRatingCard(
                      'Rate Service', 
                      _vendorName,
                      null,
                      _serviceRating, 
                      (val) => setState(() => _serviceRating = val),
                      fallbackIcon: Icons.local_gas_station,
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    
                    // Feedback Field
                    _buildFeedbackField(),
                    
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
            
            // Footer
            _buildFooter(context),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(Icons.arrow_back, color: cs.onSurface),
            style: IconButton.styleFrom(backgroundColor: cs.surface),
          ),
          Text('Feedback', style: TextStyle(color: cs.onSurface, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(width: 48),
        ],
      ),
    );
  }

  Widget _buildStars(int rating, Function(int) onRate, {double size = 24}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(5, (index) {
        final isFilled = index < rating;
        return GestureDetector(
          onTap: () => onRate(index + 1),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Icon(
              isFilled ? Icons.star : Icons.star_border,
              color: isFilled ? AppColors.primary : AppColors.surfaceDark,
              size: size,
            ),
          ),
        );
      }),
    );
  }

  Widget _buildRatingCard(String title, String sub, String? img, int rating, Function(int) onRate, {IconData? fallbackIcon}) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade100;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderCol.withAlpha(127)),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.primary.withAlpha(26),
              shape: BoxShape.circle,
              image: img != null ? DecorationImage(image: AssetImage(img), fit: BoxFit.cover) : null,
            ),
            child: img == null ? Icon(fallbackIcon, color: AppColors.primary, size: 20) : null,
          ),
          const SizedBox(width: AppSpacing.m),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: cs.onSurface, fontSize: 14, fontWeight: FontWeight.bold)),
                Text(sub, style: TextStyle(color: cs.onSurface.withAlpha(153), fontSize: 11)),
              ],
            ),
          ),
          _buildStars(rating, onRate, size: 20),
        ],
      ),
    );
  }

  Widget _buildFeedbackField() {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final cardBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade100;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Any additional comments?', style: TextStyle(color: cs.onSurface.withAlpha(153), fontSize: 13, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(AppSpacing.m),
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
            border: Border.all(color: borderCol.withAlpha(76)),
          ),
          child: TextField(
            controller: _commentController,
            maxLines: 4,
            style: TextStyle(color: cs.onSurface, fontSize: 14),
            decoration: InputDecoration(
              hintText: 'Tell us about your experience...',
              hintStyle: TextStyle(color: cs.onSurface.withAlpha(102), fontSize: 13),
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _buildTag('On time delivery'),
            _buildTag('Safe handling'),
            _buildTag('Professional'),
          ],
        ),
      ],
    );
  }

  Widget _buildTag(String label) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        border: Border.all(color: borderCol),
      ),
      child: Text(label, style: TextStyle(color: cs.onSurface.withAlpha(153), fontSize: 11, fontWeight: FontWeight.w500)),
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.l, AppSpacing.m, AppSpacing.l, AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CustomButton(
            text: _isSubmitting ? 'Submitting...' : 'Submit Review',
            onPressed: _isSubmitting ? null : _submitReview,
            icon: const Icon(Icons.send_outlined, color: Colors.white),
          ),
          const SizedBox(height: 12),
          const Text(
            'BY SUBMITTING YOU AGREE TO OUR TERMS OF SERVICE',
            style: TextStyle(color: Colors.grey, fontSize: 9, letterSpacing: 1.5, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
