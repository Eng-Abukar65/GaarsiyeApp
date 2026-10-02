import 'package:flutter/material.dart';

class TimeSlotModel {
  final String id;
  final String label;
  final String timeRange;
  final IconData icon;
  final String? tag;
  final bool isExpress;

  const TimeSlotModel({
    required this.id,
    required this.label,
    required this.timeRange,
    required this.icon,
    this.tag,
    this.isExpress = false,
  });

  // Express is the only delivery option. The predefined Morning/Afternoon/
  // Evening/Midnight slots were removed — delivery times are now generated
  // dynamically from the device clock in the Delivery Schedule screen.
  static const List<TimeSlotModel> slots = [
    TimeSlotModel(
      id: 'express',
      label: 'Express',
      timeRange: 'Within 60 mins • High Demand',
      icon: Icons.bolt,
      tag: 'FASTEST',
      isExpress: true,
    ),
  ];
}
