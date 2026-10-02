import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/routes/app_routes.dart';

enum CustomerNavTab { home, orders, stations, profile }

class CustomerBottomNav extends StatelessWidget {
  final CustomerNavTab currentTab;
  final int unreadNotifications;

  const CustomerBottomNav({
    super.key,
    required this.currentTab,
    this.unreadNotifications = 0,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondaryLight;

    return Container(
      height: 80,
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(top: BorderSide(color: borderColor.withAlpha(77))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(
            context,
            icon: Icons.home_rounded,
            label: 'Home',
            isSelected: currentTab == CustomerNavTab.home,
            route: AppRoutes.home,
            textSecondary: textSecondary,
          ),
          _buildNavItem(
            context,
            icon: Icons.receipt_long_rounded,
            label: 'Orders',
            isSelected: currentTab == CustomerNavTab.orders,
            route: AppRoutes.history,
            textSecondary: textSecondary,
          ),
          _buildNavItem(
            context,
            icon: Icons.local_gas_station_rounded,
            label: 'Stations',
            isSelected: currentTab == CustomerNavTab.stations,
            route: AppRoutes.selectStation,
            textSecondary: textSecondary,
          ),
          _buildNavItem(
            context,
            icon: Icons.person_rounded,
            label: 'Profile',
            isSelected: currentTab == CustomerNavTab.profile,
            route: AppRoutes.profile,
            textSecondary: textSecondary,
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context, {
    required IconData icon,
    required String label,
    required bool isSelected,
    required String route,
    required Color textSecondary,
    int badgeCount = 0,
  }) {
    final activeColor = AppColors.primary;
    final inactiveColor = textSecondary;

    return GestureDetector(
      onTap: () {
        if (!isSelected) {
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
}
