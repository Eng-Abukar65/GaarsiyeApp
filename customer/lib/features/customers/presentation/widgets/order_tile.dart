import 'package:flutter/material.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_typography.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/status_badge.dart';
import '../models/order_model.dart';

class OrderTile extends StatelessWidget {
  final OrderModel order;
  final VoidCallback? onTap;

  const OrderTile({
    super.key,
    required this.order,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    IconData statusIcon;
    String statusText;

    switch (order.status) {
      case OrderStatus.pending:
        statusColor = Colors.orange;
        statusIcon = Icons.timer;
        statusText = 'Pending';
        break;
      case OrderStatus.accepted:
        statusColor = Colors.blue;
        statusIcon = Icons.check;
        statusText = 'Accepted';
        break;
      case OrderStatus.driverAssigned:
        statusColor = Colors.purple;
        statusIcon = Icons.person;
        statusText = 'Driver Assigned';
        break;
      case OrderStatus.onTheWay:
        statusColor = AppColors.primary;
        statusIcon = Icons.local_shipping;
        statusText = 'On the way';
        break;
      case OrderStatus.delivered:
        statusColor = AppColors.success;
        statusIcon = Icons.check_circle;
        statusText = 'Delivered';
        break;
      case OrderStatus.cancelled:
        statusColor = AppColors.error;
        statusIcon = Icons.cancel;
        statusText = 'Cancelled';
        break;
    }

    final isCancelled = order.status == OrderStatus.cancelled;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.m),
        padding: const EdgeInsets.all(AppSpacing.m),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(
            color: Theme.of(context).brightness == Brightness.dark
                ? AppColors.borderDark
                : AppColors.border,
            width: 1,
          ),
        ),
        child: Opacity(
          opacity: isCancelled ? 0.75 : 1.0,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: isCancelled ? Colors.grey.withOpacity(0.1) : AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusM),
                ),
                child: Icon(
                  order.icon,
                  size: 30,
                  color: isCancelled ? Colors.grey : AppColors.primary,
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
                            order.title,
                            style: AppTypography.bodyMain.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).colorScheme.onSurface,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(
                          '\$${order.amount.toStringAsFixed(2)}',
                          style: TextStyle(
                            fontFamily: AppTypography.fontFamily,
                            fontWeight: FontWeight.bold,
                            color: isCancelled ? Colors.grey : AppColors.primary,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${order.station} • ${order.date}',
                      style: AppTypography.bodySmall.copyWith(
                        color: Theme.of(context).colorScheme.onSurface.withOpacity(0.7),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        StatusBadge(
                          text: statusText,
                          icon: statusIcon,
                          color: statusColor,
                        ),
                        Text(
                          'ID: ${order.id}',
                          style: AppTypography.label.copyWith(
                            fontSize: 11,
                            color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5),
                            fontWeight: FontWeight.w600,
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
}
