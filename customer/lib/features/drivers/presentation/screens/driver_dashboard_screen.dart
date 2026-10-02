import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/driver_offers_service.dart';
import '../../../../core/services/driver_presence_service.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/utils/api_service.dart';
import '../widgets/delivery_assignment_card.dart';
import '../widgets/driver_bottom_nav.dart';

class DriverDashboardScreen extends StatefulWidget {
  const DriverDashboardScreen({super.key});

  @override
  State<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends State<DriverDashboardScreen> {
  Map<String, dynamic> _stats = {
    'total_deliveries': 0,
    'active_deliveries': 0,
    'completed_deliveries': 0,
    'failed_deliveries': 0,
  };
  bool _isLoading = true;
  String _driverName = 'Driver';
  bool _isOnline = false;

  @override
  void initState() {
    super.initState();
    _loadDriverData();
    _activatePresence();
    _fetchStats();
    // Real assignment requests (delivery_offers) for THIS driver only.
    DriverOffersService.instance.refresh();
  }

  Future<void> _activatePresence() async {
    await DriverPresenceService.instance.startIfDriver();
    if (mounted) {
      setState(() => _isOnline = DriverPresenceService.instance.isActive);
    }
  }

  Future<void> _loadDriverData() async {
    final prefs = await SharedPreferences.getInstance();
    final userData = prefs.getString('user_data');
    if (userData == null) {
      return;
    }

    final data = jsonDecode(userData);
    setState(() {
      final firstName = (data['first_name'] ?? '').toString();
      final username = (data['username'] ?? '').toString();
      _driverName = firstName.isNotEmpty
          ? firstName
          : (username.isNotEmpty ? username : 'Driver');
    });
  }

  Future<void> _fetchStats() async {
    try {
      final response = await ApiService.get('/driver/stats');
      if (response.statusCode == 200) {
        setState(() {
          _stats = jsonDecode(response.body);
        });
      }
    } catch (e) {
      print('Error fetching stats: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _toggleOnlineStatus() async {
    final newStatus = !_isOnline;
    try {
      await DriverPresenceService.instance.setOnline(newStatus);
      if (mounted) {
        setState(() => _isOnline = DriverPresenceService.instance.isActive);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('You are now ${newStatus ? 'Online' : 'Offline'}'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.watch<ThemeProvider>().isDarkMode;
    final background = isDark
        ? AppColors.backgroundDark
        : AppColors.backgroundLight;
    final titleColor = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _fetchStats,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppSpacing.l),
            physics: const AlwaysScrollableScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(isDark),
                _buildAssignmentRequests(),
                const SizedBox(height: AppSpacing.xl),
                _buildStatusBanner(isDark),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  'Your Performance',
                  style: TextStyle(
                    color: titleColor,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: AppSpacing.m),
                _buildStatsGrid(isDark),
                const SizedBox(height: AppSpacing.xl),
                _buildQuickActions(isDark),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: const DriverBottomNav(currentTab: DriverNavTab.home),
    );
  }

  Widget _buildHeader(bool isDark) {
    final textPrimary = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Welcome back,',
              style: TextStyle(color: textSecondary, fontSize: 14),
            ),
            Text(
              _driverName,
              style: TextStyle(
                color: textPrimary,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        Row(
          children: [
            _buildNotificationBell(),
            const SizedBox(width: 10),
            GestureDetector(
              onTap: () => Navigator.pushNamed(context, AppRoutes.driverProfile),
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.primary.withOpacity(0.2)),
                ),
                child: const Icon(Icons.person, color: AppColors.primary),
              ),
            ),
          ],
        ),
      ],
    );
  }

  // Bell with an unread badge showing the number of pending assignments.
  Widget _buildNotificationBell() {
    return AnimatedBuilder(
      animation: DriverOffersService.instance,
      builder: (context, _) {
        final count = DriverOffersService.instance.count;
        return GestureDetector(
          onTap: () => Navigator.pushNamed(context, AppRoutes.driverNotifications),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.primary.withOpacity(0.2)),
                ),
                child: const Icon(Icons.notifications_none, color: AppColors.primary),
              ),
              if (count > 0)
                Positioned(
                  right: -2,
                  top: -2,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    constraints: const BoxConstraints(minWidth: 20),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE11D48),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Colors.white, width: 1.5),
                    ),
                    child: Text(
                      count > 9 ? '9+' : '$count',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  // The persistent "New Delivery Assignment" cards on the dashboard itself.
  Widget _buildAssignmentRequests() {
    return AnimatedBuilder(
      animation: DriverOffersService.instance,
      builder: (context, _) {
        final offers = DriverOffersService.instance.offers;
        if (offers.isEmpty) return const SizedBox(height: AppSpacing.xl);
        return Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: offers
                .map((o) => DeliveryAssignmentCard(
                      offer: o,
                      onResponded: (action) {
                        if (action == 'accept') {
                          Navigator.pushNamed(context, AppRoutes.driverDeliveries);
                        }
                      },
                    ))
                .toList(),
          ),
        );
      },
    );
  }

  Widget _buildStatusBanner(bool isDark) {
    final textPrimary = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.l),
      decoration: BoxDecoration(
        color: _isOnline
            ? Colors.green.withOpacity(0.1)
            : Colors.orange.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(
          color: _isOnline
              ? Colors.green.withOpacity(0.3)
              : Colors.orange.withOpacity(0.3),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: _isOnline
                  ? Colors.green.withOpacity(0.2)
                  : Colors.orange.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              _isOnline ? Icons.check_circle : Icons.offline_bolt,
              color: _isOnline ? Colors.green : Colors.orange,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isOnline ? 'Active Shift' : 'Shift Offline',
                  style: TextStyle(
                    color: textPrimary,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                Text(
                  _isOnline
                      ? 'You are visible to vendors'
                      : 'Go online to receive jobs',
                  style: TextStyle(color: textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
          Switch(
            value: _isOnline,
            onChanged: (_) => _toggleOnlineStatus(),
            activeThumbColor: Colors.green,
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid(bool isDark) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: AppSpacing.m,
      crossAxisSpacing: AppSpacing.m,
      childAspectRatio: 1.5,
      children: [
        _buildStatCard(
          'Active Jobs',
          (_stats['active_deliveries'] ?? 0).toString(),
          Icons.delivery_dining,
          AppColors.primary,
          isDark,
        ),
        _buildStatCard(
          'Completed',
          (_stats['completed_deliveries'] ?? 0).toString(),
          Icons.task_alt,
          Colors.green,
          isDark,
        ),
        _buildStatCard(
          'Failed',
          (_stats['failed_deliveries'] ?? 0).toString(),
          Icons.error_outline,
          Colors.red,
          isDark,
        ),
        _buildStatCard(
          'Total',
          (_stats['total_deliveries'] ?? 0).toString(),
          Icons.history,
          Colors.blue,
          isDark,
        ),
      ],
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    IconData icon,
    Color color,
    bool isDark,
  ) {
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

    return Container(
      padding: const EdgeInsets.all(AppSpacing.m),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: color, size: 20),
              Text(
                value,
                style: TextStyle(
                  color: textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          Text(label, style: TextStyle(color: textSecondary, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildQuickActions(bool isDark) {
    final titleColor = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Quick Actions',
          style: TextStyle(
            color: titleColor,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: AppSpacing.m),
        _buildActionTile(
          'Current Deliveries',
          'Manage your assigned jobs',
          Icons.list_alt,
          AppColors.primary,
          isDark,
          () => Navigator.pushNamed(context, AppRoutes.driverDeliveries),
        ),
        const SizedBox(height: AppSpacing.m),
        _buildActionTile(
          'Delivery History',
          'Review past deliveries',
          Icons.history,
          Colors.blue,
          isDark,
          () => Navigator.pushNamed(context, AppRoutes.driverHistory),
        ),
        const SizedBox(height: AppSpacing.m),
        _buildActionTile(
          'Earnings & Wallet',
          'View your daily earnings and payouts',
          Icons.account_balance_wallet,
          Colors.green,
          isDark,
          () => Navigator.pushNamed(context, AppRoutes.driverWallet),
        ),
      ],
    );
  }

  Widget _buildActionTile(
    String title,
    String subtitle,
    IconData icon,
    Color color,
    bool isDark,
    VoidCallback onTap,
  ) {
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

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      child: Container(
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
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(color: textSecondary, fontSize: 13),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: textSecondary),
          ],
        ),
      ),
    );
  }
}
