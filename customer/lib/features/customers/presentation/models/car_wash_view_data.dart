import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/utils/api_service.dart';

/// Customer-facing normalization for the Car Wash API.
///
/// The backend has used a few status/value aliases over time. Keeping those
/// differences here makes the booking UI stable while old rows remain usable.
class CarWashViewData {
  static const List<String> statusFlow = [
    'pending',
    'confirmed',
    'worker_assigned',
    'worker_accepted',
    'washing',
    'ready',
    'completed',
  ];

  static const Map<String, String> _labels = {
    'pending': 'Booking Submitted',
    'confirmed': 'Confirmed by Vendor',
    'worker_assigned': 'Awaiting Worker Response',
    'worker_accepted': 'Worker Accepted',
    'washing': 'In Progress (Washing)',
    'ready': 'Vehicle Ready',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'rejected': 'Rejected',
    'payment_failed': 'Payment Failed',
  };

  static const Map<String, String> _messages = {
    'pending': 'Your booking has been received.',
    'confirmed': 'Your booking has been confirmed.',
    'worker_assigned': 'Assigned worker has been notified.',
    'worker_accepted': 'Worker accepted your job and is preparing.',
    'washing': 'Your car wash is currently in progress.',
    'ready': 'Your vehicle is ready.',
    'completed': 'Your Car service has been completed.',
    'cancelled': 'Your booking has been cancelled.',
    'rejected': 'The vendor could not accept this booking.',
    'payment_failed': 'Payment failed. Please retry when the booking allows it.',
  };

  static String normalizeStatus(dynamic value) {
    final raw = (value ?? '')
        .toString()
        .trim()
        .toLowerCase()
        .replaceAll('-', '_')
        .replaceAll(' ', '_');
    switch (raw) {
      case 'submitted':
      case 'booked':
      case 'new':
        return 'pending';
      case 'accepted':
      case 'approved':
        return 'confirmed';
      case 'assigned':
      case 'staff_assigned':
      case 'employee_assigned':
        return 'worker_assigned';
      case 'in_progress':
      case 'inprogress':
      case 'washing_started':
      case 'started':
        return 'washing';
      case 'vehicle_ready':
      case 'finished':
        return 'ready';
      case 'done':
      case 'delivered':
        return 'completed';
      case 'canceled':
        return 'cancelled';
      case 'declined':
        return 'rejected';
      case 'failed_payment':
        return 'payment_failed';
      default:
        return raw.isEmpty ? 'pending' : raw;
    }
  }

  static String statusLabel(dynamic status) {
    final normalized = normalizeStatus(status);
    return _labels[normalized] ?? _titleCase(normalized);
  }

  static String statusMessage(dynamic status) {
    return _messages[normalizeStatus(status)] ??
        'Your booking status has been updated.';
  }

  static Color statusColor(dynamic status) {
    switch (normalizeStatus(status)) {
      case 'pending':
        return const Color(0xFFF59E0B);
      case 'confirmed':
        return const Color(0xFF2563EB);
      case 'worker_assigned':
        return const Color(0xFF7C3AED);
      case 'washing':
        return const Color(0xFF0891B2);
      case 'ready':
        return const Color(0xFF16A34A);
      case 'completed':
        return const Color(0xFF047857);
      case 'cancelled':
      case 'payment_failed':
        return const Color(0xFFDC2626);
      case 'rejected':
        return const Color(0xFFBE123C);
      default:
        return const Color(0xFF64748B);
    }
  }

  static IconData statusIcon(dynamic status) {
    switch (normalizeStatus(status)) {
      case 'pending':
        return Icons.receipt_long_outlined;
      case 'confirmed':
        return Icons.verified_outlined;
      case 'worker_assigned':
        return Icons.engineering_outlined;
      case 'washing':
        return Icons.local_car_wash_outlined;
      case 'ready':
        return Icons.directions_car_filled_outlined;
      case 'completed':
        return Icons.check_circle_outline;
      case 'payment_failed':
        return Icons.credit_card_off_outlined;
      case 'rejected':
        return Icons.block_outlined;
      case 'cancelled':
        return Icons.cancel_outlined;
      default:
        return Icons.info_outline;
    }
  }

  static bool isTerminal(dynamic status) => const {
        'completed',
        'cancelled',
        'rejected',
      }.contains(normalizeStatus(status));

  static bool isActive(dynamic status) => const {
        'confirmed',
        'worker_assigned',
        'washing',
        'ready',
      }.contains(normalizeStatus(status));

  static double progress(dynamic status) {
    final index = statusFlow.indexOf(normalizeStatus(status));
    if (index < 0) return 0;
    return (index + 1) / statusFlow.length;
  }

  static String progressSummary(dynamic status) {
    final normalized = normalizeStatus(status);
    if (normalized == 'cancelled') return 'Booking cancelled';
    if (normalized == 'rejected') return 'Booking rejected';
    if (normalized == 'payment_failed') return 'Payment needs attention';
    final index = statusFlow.indexOf(normalized);
    if (index < 0) return statusLabel(normalized);
    return '${index + 1} of ${statusFlow.length} stages';
  }

  static String bookingReference(Map<String, dynamic> booking) {
    return _firstText(booking, const [
      'booking_reference',
      'customer_reference',
      'reference',
      'booking_code',
    ], fallback: 'Reference pending');
  }

  static String serviceName(Map<String, dynamic> booking) => _firstText(
        booking,
        const ['service_name', 'service', 'name'],
        fallback: 'Car Wash',
      );

  static String vendorName(Map<String, dynamic> booking) => _firstText(
        booking,
        const ['vendor_name', 'business_name', 'vendor'],
        fallback: 'Car Wash Vendor',
      );

  static String imageUrl(dynamic value) {
    final raw = (value ?? '').toString().trim().replaceAll('\\', '/');
    if (raw.isEmpty || raw == 'null') return '';
    final uri = Uri.tryParse(raw);
    if (uri != null && (uri.scheme == 'http' || uri.scheme == 'https')) {
      return raw;
    }
    final origin = ApiService.baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
    return '$origin/${raw.replaceFirst(RegExp(r'^/+'), '')}';
  }

  static String serviceImage(Map<String, dynamic> service) => imageUrl(
        service['image_url'] ??
            service['image'] ??
            service['photo'] ??
            service['thumbnail'],
      );

  static IconData serviceIcon(dynamic serviceName) {
    final name = (serviceName ?? '').toString().toLowerCase();
    if (name.contains('vip') ||
        name.contains('premium') ||
        name.contains('luxury')) {
      return Icons.workspace_premium_outlined;
    }
    if (name.contains('engine')) return Icons.settings_suggest_outlined;
    if (name.contains('interior') ||
        name.contains('vacuum') ||
        name.contains('upholstery')) {
      return Icons.cleaning_services_outlined;
    }
    if (name.contains('detail') ||
        name.contains('polish') ||
        name.contains('wax')) {
      return Icons.auto_awesome_outlined;
    }
    if (name.contains('wheel') || name.contains('tyre')) {
      return Icons.tire_repair_outlined;
    }
    if (name.contains('full') || name.contains('complete')) {
      return Icons.local_car_wash_outlined;
    }
    if (name.contains('exterior') || name.contains('body')) {
      return Icons.directions_car_filled_outlined;
    }
    return Icons.water_drop_outlined;
  }

  static DateTime? parseDate(dynamic value) {
    final raw = (value ?? '').toString().trim();
    if (raw.isEmpty || raw == 'null') return null;
    return DateTime.tryParse(raw)?.toLocal();
  }

  static String formatDateTime(dynamic value, {String fallback = 'Not yet'}) {
    final date = parseDate(value);
    if (date == null) return fallback;
    return DateFormat('d MMMM y, h:mm a').format(date);
  }

  static String scheduledDateTime(Map<String, dynamic> booking) {
    final dateRaw = _firstText(booking, const [
      'scheduled_date',
      'booking_date',
      'date',
    ]);
    final timeRaw = _firstText(booking, const [
      'scheduled_time',
      'booking_time',
      'time',
    ]);
    if (dateRaw.isEmpty) return 'Not scheduled';

    final datePart = dateRaw.split('T').first.split(' ').first;
    final timePart = timeRaw.isEmpty ? '00:00' : timeRaw;
    final parsed = DateTime.tryParse('$datePart ${_normalizeTime(timePart)}');
    if (parsed == null) {
      return timeRaw.isEmpty ? datePart : '$datePart, $timeRaw';
    }
    final pattern = timeRaw.isEmpty ? 'd MMMM y' : 'd MMMM y, h:mm a';
    return DateFormat(pattern).format(parsed);
  }

  static List<CarWashTimelineItem> timeline(Map<String, dynamic> booking) {
    final currentStatus = normalizeStatus(booking['status']);
    final currentIndex = statusFlow.indexOf(currentStatus);
    final timestamps = <String, DateTime?>{};

    final history = booking['status_history'] ??
        booking['status_timeline'] ??
        booking['timeline'] ??
        booking['events'];
    if (history is List) {
      for (final raw in history.whereType<Map>()) {
        final event = Map<String, dynamic>.from(raw);
        final status = normalizeStatus(
          event['status'] ?? event['stage'] ?? event['type'],
        );
        if (!statusFlow.contains(status)) continue;
        timestamps[status] = parseDate(
          event['created_at'] ??
              event['occurred_at'] ??
              event['timestamp'] ??
              event['date_time'] ??
              event['date'],
        );
      }
    }

    final fieldAliases = <String, List<String>>{
      'pending': ['submitted_at', 'booked_at', 'created_at'],
      'confirmed': ['confirmed_at', 'accepted_at'],
      'worker_assigned': ['worker_assigned_at', 'assigned_at'],
      'washing': ['washing_started_at', 'started_at'],
      'ready': ['ready_at', 'vehicle_ready_at'],
      'completed': ['completed_at', 'finished_at'],
    };
    for (final entry in fieldAliases.entries) {
      timestamps[entry.key] ??=
          parseDate(_firstValue(booking, entry.value));
    }

    var latestRecordedIndex = -1;
    for (var index = 0; index < statusFlow.length; index++) {
      if (timestamps[statusFlow[index]] != null) latestRecordedIndex = index;
    }

    return List.generate(statusFlow.length, (index) {
      final status = statusFlow[index];
      final reached = currentIndex >= 0
          ? index <= currentIndex
          : index <= latestRecordedIndex;
      return CarWashTimelineItem(
        status: status,
        label: _labels[status]!,
        icon: statusIcon(status),
        reached: reached,
        isCurrent: currentStatus == status,
        occurredAt: timestamps[status],
      );
    });
  }

  static dynamic _firstValue(
    Map<String, dynamic> source,
    List<String> keys,
  ) {
    for (final key in keys) {
      final value = source[key];
      if (value != null && value.toString().trim().isNotEmpty) return value;
    }
    return null;
  }

  static String _firstText(
    Map<String, dynamic> source,
    List<String> keys, {
    String fallback = '',
  }) {
    final value = _firstValue(source, keys);
    return value?.toString().trim() ?? fallback;
  }

  static String _normalizeTime(String value) {
    final pieces = value.trim().split(':');
    if (pieces.length < 2) return value;
    return '${pieces[0].padLeft(2, '0')}:${pieces[1].padLeft(2, '0')}:${pieces.length > 2 ? pieces[2].padLeft(2, '0') : '00'}';
  }

  static String _titleCase(String value) {
    return value
        .split('_')
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }
}

class CarWashTimelineItem {
  const CarWashTimelineItem({
    required this.status,
    required this.label,
    required this.icon,
    required this.reached,
    required this.isCurrent,
    required this.occurredAt,
  });

  final String status;
  final String label;
  final IconData icon;
  final bool reached;
  final bool isCurrent;
  final DateTime? occurredAt;

  String get formattedTime => occurredAt == null
      ? ''
      : DateFormat('d MMM y, h:mm a').format(occurredAt!);
}
