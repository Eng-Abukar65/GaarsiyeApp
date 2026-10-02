import 'dart:convert';
import 'package:flutter/material.dart';

import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../widgets/worker_widgets.dart';

class WorkerNotificationsScreen extends StatefulWidget {
  const WorkerNotificationsScreen({super.key});

  @override
  State<WorkerNotificationsScreen> createState() => _WorkerNotificationsScreenState();
}

class _WorkerNotificationsScreenState extends State<WorkerNotificationsScreen> {
  List<dynamic> _items = [];
  bool _isLoading = true;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
    });
    try {
      final res = await ApiService.get('/worker/notifications');
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        setState(() => _items = data['data'] ?? []);
      } else {
        setState(() => _hasError = true);
      }
    } catch (_) {
      setState(() => _hasError = true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  static const _meta = {
    'worker_assigned': {'title': 'New job assigned', 'icon': Icons.assignment_outlined, 'c': WorkerColors.blue},
    'washing': {'title': 'Washing started', 'icon': Icons.local_car_wash_outlined, 'c': WorkerColors.sky},
    'ready': {'title': 'Vehicle marked ready', 'icon': Icons.directions_car_outlined, 'c': WorkerColors.violet},
    'completed': {'title': 'Job completed', 'icon': Icons.check_circle_outline, 'c': WorkerColors.green},
    'cancelled': {'title': 'Booking cancelled', 'icon': Icons.cancel_outlined, 'c': WorkerColors.rose},
    'confirmed': {'title': 'Booking confirmed', 'icon': Icons.check_circle_outline, 'c': WorkerColors.green},
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: WorkerColors.bg,
      body: Column(
        children: [
          const WorkerTopBar(title: 'Notifications'),
          Expanded(
            child: RefreshIndicator(
              color: WorkerColors.blue,
              onRefresh: _fetch,
              child: _isLoading
                  ? ListView(children: const [WorkerLoading(label: 'Loading notifications…')])
                  : _hasError
                      ? ListView(children: [WorkerErrorState(message: 'Could not load notifications.', onRetry: _fetch)])
                      : _items.isEmpty
                          ? ListView(children: const [
                              WorkerEmptyState(icon: Icons.notifications_none, title: 'No notifications', subtitle: 'Updates about your jobs will show up here.'),
                            ])
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount: _items.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (context, i) => _tile(_items[i]),
                            ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tile(Map n) {
    final meta = _meta[n['status']?.toString()] ??
        {'title': 'Status: ${n['status']}', 'icon': Icons.notifications_none, 'c': WorkerColors.inkSoft};
    final color = meta['c'] as Color;
    return WorkerCard(
      padding: const EdgeInsets.all(14),
      onTap: n['booking_id'] != null
          ? () => Navigator.pushNamed(context, AppRoutes.workerJobDetails, arguments: {'id': n['booking_id']})
          : null,
      child: Row(
        children: [
          Container(
            width: 40, height: 40, alignment: Alignment.center,
            decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
            child: Icon(meta['icon'] as IconData, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(meta['title'] as String,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Color(0xFF1E293B), fontSize: 13.5, fontWeight: FontWeight.w700)),
                Text('${n['service_name'] ?? 'Car wash'}'
                    '${(n['customer_name'] ?? '').toString().isNotEmpty ? ' • ${n['customer_name']}' : ''}'
                    '${(n['booking_code'] ?? '').toString().isNotEmpty ? ' • ${n['booking_code']}' : ''}',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(workerRelative(n['created_at']?.toString()),
              style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
