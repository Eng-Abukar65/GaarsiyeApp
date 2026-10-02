import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/constants/app_typography.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/customer_notification_service.dart';
import '../../../../core/theme/theme_provider.dart';
import '../models/notification_model.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CustomerNotificationService>().start(refreshList: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context);
    final notificationService = context.watch<CustomerNotificationService>();
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = cs.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final notifications = notificationService.notifications;
    final today = notifications.where((n) => n.isToday).toList();
    final earlier = notifications.where((n) => !n.isToday).toList();

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        centerTitle: false,
        title: Text(
          'Notifications',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 24,
          ),
        ),
        actions: [
          IconButton(
            onPressed: notificationService.unreadCount == 0
                ? null
                : notificationService.markAllAsRead,
            icon: Icon(
              Icons.done_all,
              color: notificationService.unreadCount == 0
                  ? textSecondary.withValues(alpha: 0.35)
                  : AppColors.primary,
            ),
            tooltip: 'Mark all as read',
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: notificationService.refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.m),
            children: [
              if (notificationService.isLoading && notifications.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 80),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (notifications.isEmpty)
                _buildEmptyState(textPrimary, textSecondary)
              else ...[
                if (today.isNotEmpty) ...[
                  _buildSectionHeader('TODAY', textSecondary),
                  ...today.map(
                    (n) => _buildNotificationItem(
                      context,
                      n,
                      notificationService,
                      isDark,
                      textPrimary,
                      textSecondary,
                    ),
                  ),
                ],
                if (earlier.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.l),
                  _buildSectionHeader('EARLIER', textSecondary),
                  ...earlier.map(
                    (n) => _buildNotificationItem(
                      context,
                      n,
                      notificationService,
                      isDark,
                      textPrimary,
                      textSecondary,
                    ),
                  ),
                ],
              ],
              const SizedBox(height: 100),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _buildBottomNav(
        context,
        bgColor,
        borderColor,
        textSecondary,
        notificationService.unreadCount,
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color textSecondary) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.l,
        AppSpacing.m,
        AppSpacing.l,
        AppSpacing.s,
      ),
      child: Text(
        title,
        style: AppTypography.label.copyWith(
          color: textSecondary.withValues(alpha: 0.5),
          letterSpacing: 1.5,
          fontSize: 12,
        ),
      ),
    );
  }

  Widget _buildEmptyState(Color textPrimary, Color textSecondary) {
    return Padding(
      padding: const EdgeInsets.only(top: 120),
      child: Column(
        children: [
          Icon(
            Icons.notifications_none,
            size: 48,
            color: textSecondary.withValues(alpha: 0.55),
          ),
          const SizedBox(height: AppSpacing.m),
          Text(
            'No notifications yet',
            style: TextStyle(
              color: textPrimary,
              fontSize: 17,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Order updates and offers will appear here.',
            style: TextStyle(color: textSecondary, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationItem(
    BuildContext context,
    NotificationModel notification,
    CustomerNotificationService notificationService,
    bool isDark,
    Color textPrimary,
    Color textSecondary,
  ) {
    final surfaceColor = isDark
        ? AppColors.surfaceDark.withValues(alpha: 0.3)
        : Colors.grey.shade100;

    return InkWell(
      onTap: () =>
          _handleNotificationTap(context, notificationService, notification),
      child: Container(
        width: double.infinity,
        color: notification.isRead
            ? Colors.transparent
            : AppColors.primary.withValues(alpha: 0.05),
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(AppSpacing.m),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: (notification.isPromo || notification.isCarWash)
                          ? AppColors.primary.withValues(alpha: 0.1)
                          : surfaceColor,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                    ),
                    child: Icon(
                      notification.icon,
                      color: (notification.isPromo || notification.isCarWash)
                          ? AppColors.primary
                          : textSecondary,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.m),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                notification.title,
                                style: TextStyle(
                                  color: textPrimary,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            Text(
                              notification.time,
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          notification.description,
                          style: TextStyle(
                            color: textSecondary,
                            fontSize: 13,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (!notification.isRead)
              Positioned(
                right: 16,
                top: 48,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(color: AppColors.primary, blurRadius: 4),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleNotificationTap(
    BuildContext context,
    CustomerNotificationService service,
    NotificationModel notification,
  ) async {
    if (!notification.isRead) {
      await service.markAsRead(notification.id);
    }

    if (!context.mounted) return;
    final orderId = notification.orderId;
    final carWashBookingId = notification.carWashBookingId;
    final vendorId = notification.vendorId;
    final offerId = notification.offerId;
    if (notification.isCarWash && carWashBookingId != null) {
      Navigator.pushNamed(
        context,
        AppRoutes.carWashBookingDetails,
        arguments: {'bookingId': carWashBookingId},
      );
      return;
    }
    switch (notification.type) {
      case 'driver_assigned':
      case 'order_on_the_way':
        if (orderId != null) {
          Navigator.pushNamed(
            context,
            AppRoutes.liveTracking,
            arguments: {'order_id': orderId},
          );
        }
        break;
      case 'offer_created':
      case 'offer_updated':
        if (vendorId != null) {
          Navigator.pushNamed(
            context,
            AppRoutes.offerDetails,
            arguments: {
              'vendor_id': vendorId,
              if (offerId != null) 'offer_id': offerId,
              'notification_title': notification.title,
              'notification_message': notification.message,
            },
          );
        }
        break;
      case 'order_created':
      case 'order_accepted':
      case 'order_assigned':
      case 'order_picked_up':
      case 'order_delivered':
      case 'payment_success':
      case 'payment_failed':
        if (orderId != null) {
          Navigator.pushNamed(
            context,
            AppRoutes.status,
            arguments: {'id': orderId},
          );
        }
        break;
      default:
        break;
    }
  }

  Widget _buildBottomNav(
    BuildContext context,
    Color bgColor,
    Color borderColor,
    Color textSecondary,
    int unreadCount,
  ) {
    return Container(
      padding: const EdgeInsets.only(top: 12, bottom: 24, left: 16, right: 16),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(
          top: BorderSide(color: borderColor.withValues(alpha: 0.3)),
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
            textSecondary: textSecondary,
            route: AppRoutes.home,
          ),
          _buildNavItem(
            context,
            Icons.receipt_long,
            'ORDERS',
            false,
            textSecondary: textSecondary,
            route: AppRoutes.history,
          ),
          _buildNavItem(
            context,
            Icons.notifications,
            'ALERTS',
            true,
            badgeCount: unreadCount,
            textSecondary: textSecondary,
            route: AppRoutes.notifications,
          ),
          _buildNavItem(
            context,
            Icons.person_outline,
            'PROFILE',
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
    return GestureDetector(
      onTap: () {
        if (route != null && !isSelected) {
          Navigator.pushNamed(context, route);
        }
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(
                icon,
                color: isSelected ? AppColors.primary : textSecondary,
                size: 24,
              ),
              if (badgeCount > 0)
                Positioned(right: -8, top: -8, child: _buildBadge(badgeCount)),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppTypography.label.copyWith(
              fontSize: 10,
              color: isSelected ? AppColors.primary : textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBadge(int count) {
    return Container(
      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
      padding: const EdgeInsets.symmetric(horizontal: 5),
      decoration: const BoxDecoration(
        color: Colors.red,
        shape: BoxShape.rectangle,
        borderRadius: BorderRadius.all(Radius.circular(9)),
      ),
      alignment: Alignment.center,
      child: Text(
        count > 99 ? '99+' : count.toString(),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
