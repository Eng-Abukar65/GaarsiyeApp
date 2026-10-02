import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/theme/theme_provider.dart';
import '../widgets/driver_bottom_nav.dart';

class DriverHistoryScreen extends StatefulWidget {
  const DriverHistoryScreen({super.key});

  @override
  State<DriverHistoryScreen> createState() => _DriverHistoryScreenState();
}

class _DriverHistoryScreenState extends State<DriverHistoryScreen> {
  List<dynamic> _history = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchHistory();
  }

  Future<void> _fetchHistory() async {
    setState(() => _isLoading = true);
    try {
      final response = await ApiService.get('/driver/deliveries');
      if (response.statusCode == 200) {
        final allDeliveries = jsonDecode(response.body);
        setState(() {
          // Filter only completed or failed deliveries for this screen
          _history = allDeliveries
              .where(
                (d) =>
                    d['status'] == 'delivered' ||
                    d['status'] == 'failed' ||
                    d['status'] == 'rejected',
              )
              .toList();
        });
      }
    } catch (e) {
      print('Error fetching history: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Provider.of<ThemeProvider>(context).isDarkMode;
    final background = isDark
        ? AppColors.backgroundDark
        : AppColors.backgroundLight;
    final textPrimary = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;
    return Scaffold(
      backgroundColor: background,
      appBar: AppBar(
        backgroundColor: background,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: Icon(Icons.arrow_back, color: textPrimary),
        ),
        title: Text(
          'Delivery History',
          style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _history.isEmpty
          ? _buildEmptyState(isDark)
          : ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.l),
              itemCount: _history.length,
              itemBuilder: (context, index) {
                return _buildHistoryCard(_history[index], isDark);
              },
            ),
      bottomNavigationBar: const DriverBottomNav(
        currentTab: DriverNavTab.history,
      ),
    );
  }

  Widget _buildEmptyState(bool isDark) {
    final textPrimary = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.history, size: 64, color: textSecondary.withOpacity(0.3)),
          const SizedBox(height: 16),
          Text(
            'No History Yet',
            style: TextStyle(
              color: textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Complete your first delivery to see it here',
            style: TextStyle(color: textSecondary, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard(dynamic delivery, bool isDark) {
    final cardColor = isDark
        ? AppColors.surfaceDark.withOpacity(0.2)
        : AppColors.surfaceLight;
    final borderColor = isDark
        ? AppColors.borderDark.withOpacity(0.3)
        : AppColors.borderLight;
    final textPrimary = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final status =
        (delivery['status'] ?? delivery['delivery_status'] ?? 'assigned')
            .toString();
    final statusColor = status == 'delivered' ? Colors.green : Colors.redAccent;
    final dateString =
        (delivery['created_at'] ?? DateTime.now().toIso8601String()).toString();
    final date = DateTime.tryParse(dateString) ?? DateTime.now();
    final formattedDate = DateFormat('MMM dd, yyyy • hh:mm a').format(date);
    final orderId = (delivery['order_id'] ?? '').toString();

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.m),
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppSpacing.radiusM),
            ),
            child: Icon(
              status == 'delivered' ? Icons.check_circle : Icons.cancel,
              color: statusColor,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'ORDER #$orderId',
                      style: TextStyle(
                        color: textPrimary,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      '\$${(delivery['payout'] ?? '5.00').toString()}',
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  formattedDate,
                  style: TextStyle(color: textSecondary, fontSize: 12),
                ),
                const SizedBox(height: 8),
                Text(
                  status.toUpperCase(),
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
