import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class NotificationModel {
  final int id;
  final int customerId;
  final int? vendorId;
  final int? orderId;
  final int? carWashBookingId;
  final int? offerId;
  final String title;
  final String message;
  final String type;
  final bool isRead;
  final DateTime createdAt;

  const NotificationModel({
    required this.id,
    required this.customerId,
    required this.vendorId,
    required this.orderId,
    required this.carWashBookingId,
    required this.offerId,
    required this.title,
    required this.message,
    required this.type,
    required this.isRead,
    required this.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    final orderId = _parseInt(json['order_id']);
    final carWashBookingId = _parseInt(json['car_wash_booking_id']) ??
        _parseInt(json['booking_id']);
    final offerId = _parseInt(json['offer_id']);
    final vendorId = _parseInt(json['vendor_id']);
    final legacyReferenceId = _parseInt(json['reference_id']);
    final type = json['type']?.toString() ?? 'order_created';

    return NotificationModel(
      id: _parseInt(json['id']) ?? 0,
      customerId:
          _parseInt(json['customer_id']) ?? _parseInt(json['user_id']) ?? 0,
      vendorId:
          vendorId ?? (type.startsWith('offer_') ? legacyReferenceId : null),
      orderId: orderId ?? (_isOrderRelated(type) ? legacyReferenceId : null),
      carWashBookingId: carWashBookingId ??
          (_isCarWashRelated(type) ? legacyReferenceId : null),
      offerId: offerId,
      title: json['title']?.toString() ?? 'Notification',
      message: json['message']?.toString() ?? '',
      type: type,
      isRead:
          json['is_read'] == true ||
          json['is_read'] == 1 ||
          json['is_read']?.toString() == '1',
      createdAt: _parseDate(json['created_at']),
    );
  }

  NotificationModel copyWith({bool? isRead}) {
    return NotificationModel(
      id: id,
      customerId: customerId,
      vendorId: vendorId,
      orderId: orderId,
      carWashBookingId: carWashBookingId,
      offerId: offerId,
      title: title,
      message: message,
      type: type,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
    );
  }

  bool get isPromo => type == 'offer_created' || type == 'offer_updated';

  bool get isCarWash => _isCarWashRelated(type);

  String get description => message;

  String get time {
    final now = DateTime.now();
    final localCreatedAt = createdAt.toLocal();
    final today = DateTime(now.year, now.month, now.day);
    final createdDay = DateTime(
      localCreatedAt.year,
      localCreatedAt.month,
      localCreatedAt.day,
    );

    if (createdDay == today) {
      return DateFormat('h:mm a').format(localCreatedAt);
    }
    if (createdDay == today.subtract(const Duration(days: 1))) {
      return 'Yesterday';
    }
    return DateFormat('MMM d').format(localCreatedAt);
  }

  bool get isToday {
    final now = DateTime.now();
    final localCreatedAt = createdAt.toLocal();
    return localCreatedAt.year == now.year &&
        localCreatedAt.month == now.month &&
        localCreatedAt.day == now.day;
  }

  IconData get icon {
    switch (type) {
      case 'order_created':
      case 'order_accepted':
      case 'order_assigned':
        return Icons.receipt_long;
      case 'driver_assigned':
      case 'order_on_the_way':
        return Icons.local_shipping_outlined;
      case 'order_picked_up':
        return Icons.inventory_2_outlined;
      case 'order_delivered':
        return Icons.check_circle;
      case 'offer_created':
      case 'offer_updated':
        return Icons.local_offer;
      case 'payment_success':
        return Icons.payments_outlined;
      case 'payment_failed':
        return Icons.error_outline;
      default:
        if (_isCarWashRelated(type)) {
          if (type.contains('completed')) return Icons.task_alt;
          if (type.contains('ready')) return Icons.directions_car_filled;
          if (type.contains('worker') || type.contains('assigned')) {
            return Icons.engineering_outlined;
          }
          if (type.contains('washing') || type.contains('started')) {
            return Icons.local_car_wash_outlined;
          }
          if (type.contains('cancel') || type.contains('reject')) {
            return Icons.cancel_outlined;
          }
          return Icons.local_car_wash;
        }
        return Icons.notifications_active;
    }
  }

  static bool _isOrderRelated(String type) {
    return type.startsWith('order_') ||
        type.startsWith('payment_') ||
        type == 'driver_assigned';
  }

  static bool _isCarWashRelated(String type) {
    return type.startsWith('car_wash_') || type == 'car_wash_booking';
  }

  static int? _parseInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    return int.tryParse(value.toString());
  }

  static DateTime _parseDate(dynamic value) {
    if (value == null) return DateTime.now();
    return DateTime.tryParse(value.toString()) ?? DateTime.now();
  }
}
