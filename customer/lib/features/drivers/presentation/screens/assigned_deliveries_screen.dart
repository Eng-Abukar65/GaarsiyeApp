import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/theme/theme_provider.dart';
import '../widgets/driver_bottom_nav.dart';

class AssignedDeliveriesScreen extends StatefulWidget {
  const AssignedDeliveriesScreen({super.key});

  @override
  State<AssignedDeliveriesScreen> createState() =>
      _AssignedDeliveriesScreenState();
}

class _AssignedDeliveriesScreenState extends State<AssignedDeliveriesScreen> {
  List<dynamic> _deliveries = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchDeliveries();
  }

  Future<void> _fetchDeliveries() async {
    setState(() => _isLoading = true);
    try {
      final response = await ApiService.get('/driver/deliveries');
      print(
        'Driver Deliveries Response: ${response.statusCode} - ${response.body}',
      );

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (decoded is List) {
          setState(() {
            _deliveries = decoded
                .where(
                  (d) =>
                      d['status'] != 'delivered' &&
                      d['status'] != 'failed' &&
                      d['status'] != 'cancelled',
                )
                .toList();
          });
          print('Loaded ${_deliveries.length} active deliveries');
        } else {
          print('Expected List but got ${decoded.runtimeType}');
        }
      }
    } catch (e) {
      print('Error fetching deliveries: $e');
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
          'Active Deliveries',
          style: TextStyle(color: textPrimary, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            onPressed: _fetchDeliveries,
            icon: const Icon(Icons.refresh, color: AppColors.primary),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _deliveries.isEmpty
          ? _buildEmptyState(isDark)
          : ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.l),
              itemCount: _deliveries.length,
              itemBuilder: (context, index) {
                return _buildDeliveryCard(_deliveries[index], isDark);
              },
            ),
      bottomNavigationBar: const DriverBottomNav(currentTab: DriverNavTab.jobs),
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
          Icon(
            Icons.delivery_dining,
            size: 64,
            color: textSecondary.withOpacity(0.3),
          ),
          const SizedBox(height: 16),
          Text(
            'No Active Deliveries',
            style: TextStyle(
              color: textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Check back later or go online to get jobs',
            style: TextStyle(color: textSecondary, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildDeliveryCard(dynamic delivery, bool isDark) {
    final cardColor = isDark
        ? AppColors.surfaceDark.withOpacity(0.3)
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
    final statusColor = _getStatusColor(status);
    final customerName =
        (delivery['customer_name'] ??
                delivery['customer']?['name'] ??
                'Unknown Customer')
            .toString();
    final address =
        (delivery['address'] ??
                delivery['address_line'] ??
                delivery['customer_address'] ??
                'No address')
            .toString();
    final vendorName = (delivery['vendor_name'] ?? 'Unknown Vendor').toString();
    final orderId = (delivery['order_id'] ?? '').toString();

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.m),
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'ORDER #$orderId',
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                ),
                child: Text(
                  status.toUpperCase().replaceAll('_', ' '),
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            customerName,
            style: TextStyle(
              color: textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.location_on, color: Colors.grey, size: 14),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  address,
                  style: TextStyle(color: textSecondary, fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          Divider(height: 24, color: borderColor),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Vendor',
                    style: TextStyle(color: textSecondary, fontSize: 11),
                  ),
                  Text(
                    vendorName,
                    style: TextStyle(
                      color: textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.pushNamed(
                    context,
                    AppRoutes.driverDeliveryDetails,
                    arguments: delivery['id'],
                  ).then((_) => _fetchDeliveries());
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusM),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 8,
                  ),
                ),
                child: const Text(
                  'View Details',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'assigned':
        return Colors.blue;
      case 'accepted':
        return Colors.cyan;
      case 'picked_up':
        return Colors.orange;
      case 'on_the_way':
        return Colors.amber;
      case 'delivered':
        return Colors.green;
      case 'failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}
