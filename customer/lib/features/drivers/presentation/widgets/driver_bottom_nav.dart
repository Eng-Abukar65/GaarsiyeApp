import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/theme/theme_provider.dart';

enum DriverNavTab { home, jobs, history, profile }

class DriverBottomNav extends StatelessWidget {
  const DriverBottomNav({super.key, required this.currentTab});

  final DriverNavTab currentTab;

  @override
  Widget build(BuildContext context) {
    final isDark = context.watch<ThemeProvider>().isDarkMode;
    final background = isDark
        ? AppColors.backgroundDark
        : AppColors.surfaceLight;
    final border = isDark ? AppColors.borderDark : AppColors.borderLight;
    final inactive = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondaryLight;

    return Container(
      padding: const EdgeInsets.only(top: 12, bottom: 24, left: 16, right: 16),
      decoration: BoxDecoration(
        color: background,
        border: Border(
          top: BorderSide(color: border.withOpacity(isDark ? 0.5 : 1)),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _DriverNavItem(
            icon: Icons.dashboard,
            label: 'Home',
            isSelected: currentTab == DriverNavTab.home,
            inactiveColor: inactive,
            onTap: () => _goTo(context, AppRoutes.driverDashboard),
          ),
          _DriverNavItem(
            icon: Icons.delivery_dining,
            label: 'Jobs',
            isSelected: currentTab == DriverNavTab.jobs,
            inactiveColor: inactive,
            onTap: () => _goTo(context, AppRoutes.driverDeliveries),
          ),
          _DriverNavItem(
            icon: Icons.history,
            label: 'History',
            isSelected: currentTab == DriverNavTab.history,
            inactiveColor: inactive,
            onTap: () => _goTo(context, AppRoutes.driverHistory),
          ),
          _DriverNavItem(
            icon: Icons.person,
            label: 'Profile',
            isSelected: currentTab == DriverNavTab.profile,
            inactiveColor: inactive,
            onTap: () => _goTo(context, AppRoutes.driverProfile),
          ),
        ],
      ),
    );
  }

  void _goTo(BuildContext context, String route) {
    final currentRoute = ModalRoute.of(context)?.settings.name;
    if (currentRoute == route) {
      return;
    }
    Navigator.pushReplacementNamed(context, route);
  }
}

class _DriverNavItem extends StatelessWidget {
  const _DriverNavItem({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.inactiveColor,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool isSelected;
  final Color inactiveColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = isSelected ? AppColors.primary : inactiveColor;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 72,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
