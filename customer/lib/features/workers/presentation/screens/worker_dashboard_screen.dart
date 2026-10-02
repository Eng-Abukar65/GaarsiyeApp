import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../widgets/worker_bottom_nav.dart';
import '../widgets/worker_widgets.dart';

class WorkerDashboardScreen extends StatefulWidget {
  const WorkerDashboardScreen({super.key});

  @override
  State<WorkerDashboardScreen> createState() => _WorkerDashboardScreenState();
}

class _WorkerDashboardScreenState extends State<WorkerDashboardScreen> {
  Map<String, dynamic>? _profile;
  Map<String, dynamic> _stats = {'today': 0, 'pending': 0, 'active': 0, 'completed': 0};
  List<dynamic> _jobs = [];
  List<dynamic> _activity = [];
  bool _isLoading = true;
  bool _hasError = false;
  bool _isOnline = false;
  bool _togglingAvail = false;
  String _actingId = '';
  String _workerName = 'Worker';

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() {
      _isLoading = true;
      _hasError = false;
    });
    try {
      // Cached name for an instant greeting before the profile call returns.
      final prefs = await SharedPreferences.getInstance();
      final userData = prefs.getString('user_data');
      if (userData != null) {
        final data = jsonDecode(userData);
        final firstName = (data['first_name'] ?? '').toString();
        final name = (data['name'] ?? '').toString();
        if (firstName.isNotEmpty || name.isNotEmpty) {
          _workerName = firstName.isNotEmpty ? firstName : name;
        }
      }

      final results = await Future.wait([
        ApiService.get('/worker/profile'),
        ApiService.get('/worker/stats'),
        ApiService.get('/worker/jobs?filter=assigned'),
        ApiService.get('/worker/notifications'),
      ]);

      final profileRes = results[0];
      if (profileRes.statusCode == 200) {
        final data = jsonDecode(profileRes.body);
        if (data['success'] == true) {
          _profile = data['data'];
          final firstName = (_profile!['first_name'] ?? '').toString();
          final name = (_profile!['name'] ?? '').toString();
          _workerName = firstName.isNotEmpty ? firstName : (name.isNotEmpty ? name : 'Worker');
          final avail = (_profile!['availability_status'] ?? '').toString().toLowerCase();
          _isOnline = avail == 'available' || _profile!['is_online'] == 1;
        }
      }
      final statsRes = results[1];
      if (statsRes.statusCode == 200) {
        final data = jsonDecode(statsRes.body);
        if (data['success'] == true) _stats = Map<String, dynamic>.from(data['data']);
      }
      final jobsRes = results[2];
      if (jobsRes.statusCode == 200) {
        final data = jsonDecode(jobsRes.body);
        if (data['success'] == true) _jobs = data['data'] ?? [];
      }
      final notifRes = results[3];
      if (notifRes.statusCode == 200) {
        final data = jsonDecode(notifRes.body);
        if (data['success'] == true) _activity = (data['data'] as List).take(4).toList();
      }
    } catch (e) {
      _hasError = true;
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Map<String, dynamic>? get _currentJob {
    for (final j in _jobs) {
      final s = j['status']?.toString();
      if (s == 'washing' || s == 'ready') return Map<String, dynamic>.from(j);
    }
    for (final j in _jobs) {
      if (j['status']?.toString() == 'worker_assigned') return Map<String, dynamic>.from(j);
    }
    return null;
  }

  // The single valid next action for a booking — mirrors the backend rules.
  Map<String, String>? _nextAction(Map<String, dynamic>? job) {
    if (job == null) return null;
    final s = job['status']?.toString();
    if (s == 'worker_assigned') {
      return job['worker_accepted_at'] != null
          ? {'ep': 'start', 'label': 'Start Job'}
          : {'ep': 'accept', 'label': 'Accept Job'};
    }
    if (s == 'washing') return {'ep': 'ready', 'label': 'Mark Vehicle Ready'};
    if (s == 'ready') return {'ep': 'complete', 'label': 'Complete Job'};
    return null;
  }

  Future<void> _toggleAvailability(bool value) async {
    if (_togglingAvail) return;
    setState(() => _togglingAvail = true);
    final newStatus = value ? 'available' : 'offline';
    try {
      final res = await ApiService.patch('/worker/availability', {'availability_status': newStatus});
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        setState(() => _isOnline = value);
      } else {
        _snack(data['message']?.toString() ?? 'Failed to update status', error: true);
      }
    } catch (_) {
      _snack('Could not update availability.', error: true);
    } finally {
      if (mounted) setState(() => _togglingAvail = false);
    }
  }

  Future<void> _runCurrentAction() async {
    final job = _currentJob;
    final action = _nextAction(job);
    if (job == null || action == null || _actingId.isNotEmpty) return;
    setState(() => _actingId = job['id'].toString());
    try {
      final res = await ApiService.patch('/worker/jobs/${job['id']}/${action['ep']}', {});
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        await _loadAll();
      } else {
        _snack(data['message']?.toString() ?? 'That action is not allowed right now.', error: true);
      }
    } catch (_) {
      _snack('Could not update the job.', error: true);
    } finally {
      if (mounted) setState(() => _actingId = '');
    }
  }

  void _snack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? WorkerColors.rose : WorkerColors.green,
    ));
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning,';
    if (h < 18) return 'Good Afternoon,';
    return 'Good Evening,';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: WorkerColors.bg,
      body: RefreshIndicator(
        color: WorkerColors.blue,
        onRefresh: _loadAll,
        child: _isLoading
            ? ListView(children: const [SizedBox(height: 200), WorkerLoading(label: 'Loading dashboard…')])
            : _hasError && _profile == null
                ? ListView(children: [
                    const SizedBox(height: 160),
                    WorkerErrorState(message: 'Could not load your dashboard.', onRetry: _loadAll),
                  ])
                : _buildBody(),
      ),
      bottomNavigationBar: const WorkerBottomNav(currentTab: WorkerNavTab.home),
    );
  }

  Widget _buildBody() {
    final vendor = (_profile?['vendor_business_name'] ?? _profile?['vendor_name'] ?? 'Car Wash').toString();
    final job = _currentJob;
    final action = _nextAction(job);

    return ListView(
      padding: EdgeInsets.zero,
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        // ── Header ──
        WorkerBlueHeader(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 34),
          child: SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    WorkerAvatar(name: _workerName, imageUrl: _profile?['profile_image']?.toString(), size: 48, ring: true),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_greeting(), style: const TextStyle(color: Colors.white70, fontSize: 13)),
                          Text(_workerName,
                              maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                          const Text('Car Wash Worker', style: TextStyle(color: Colors.white70, fontSize: 12)),
                        ],
                      ),
                    ),
                    _bellButton(),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.storefront_outlined, size: 15, color: Colors.white70),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(vendor,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 13)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),

        // ── Availability toggle (overlaps header) ──
        Transform.translate(
          offset: const Offset(0, -20),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: WorkerCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Row(
                children: [
                  Container(width: 10, height: 10,
                      decoration: BoxDecoration(
                          color: _isOnline ? WorkerColors.green : const Color(0xFF94A3B8),
                          shape: BoxShape.circle)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_isOnline ? 'Online' : 'Offline',
                            style: const TextStyle(color: WorkerColors.ink, fontSize: 14, fontWeight: FontWeight.w700)),
                        Text(_isOnline ? 'You are visible to vendors' : 'You are not receiving jobs',
                            style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 11.5)),
                      ],
                    ),
                  ),
                  _togglingAvail
                      ? const SizedBox(width: 40, height: 24, child: Center(
                          child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))))
                      : Switch(
                          value: _isOnline,
                          onChanged: _toggleAvailability,
                          activeColor: Colors.white,
                          activeTrackColor: WorkerColors.green,
                        ),
                ],
              ),
            ),
          ),
        ),

        // ── Today's Overview ──
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("Today's Overview",
                  style: TextStyle(color: WorkerColors.ink, fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: WorkerStatCard(icon: Icons.work_outline, value: '${_stats['pending'] ?? 0}', label: 'Pending Jobs', color: WorkerColors.blue)),
                const SizedBox(width: 12),
                Expanded(child: WorkerStatCard(icon: Icons.directions_car_filled, value: '${_stats['active'] ?? 0}', label: 'Active Job', color: WorkerColors.green)),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: WorkerStatCard(icon: Icons.check_circle_outline, value: '${_stats['completed'] ?? 0}', label: 'Completed', color: WorkerColors.violet)),
                const SizedBox(width: 12),
                Expanded(child: WorkerStatCard(icon: Icons.calendar_today_outlined, value: '${_stats['today'] ?? 0}', label: "Today's Jobs", color: WorkerColors.amber)),
              ]),
            ],
          ),
        ),

        // ── Current Job ──
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Current Job', style: TextStyle(color: WorkerColors.ink, fontSize: 16, fontWeight: FontWeight.w800)),
              GestureDetector(
                onTap: () => Navigator.pushReplacementNamed(context, AppRoutes.workerJobs),
                child: const Text('View All', style: TextStyle(color: WorkerColors.blue, fontSize: 13, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          child: job == null
              ? WorkerCard(
                  padding: const EdgeInsets.symmetric(vertical: 28),
                  child: Column(children: [
                    Container(width: 48, height: 48, alignment: Alignment.center,
                        decoration: BoxDecoration(color: const Color(0xFFDBEAFE), borderRadius: BorderRadius.circular(14)),
                        child: const Icon(Icons.assignment_outlined, color: WorkerColors.blue, size: 22)),
                    const SizedBox(height: 10),
                    const Text('No active job right now',
                        style: TextStyle(color: Color(0xFF334155), fontSize: 14, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    const Text('New jobs assigned to you will appear here.',
                        textAlign: TextAlign.center, style: TextStyle(color: WorkerColors.inkSoft, fontSize: 12.5)),
                  ]),
                )
              : WorkerCard(
                  child: Column(
                    children: [
                      InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => Navigator.pushNamed(context, AppRoutes.workerJobDetails, arguments: job),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(width: 42, height: 42, alignment: Alignment.center,
                                decoration: BoxDecoration(color: const Color(0xFFDBEAFE), borderRadius: BorderRadius.circular(12)),
                                child: const Icon(Icons.directions_car_filled, color: WorkerColors.blue, size: 20)),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text((job['service_name'] ?? 'Car Wash').toString(),
                                      style: const TextStyle(color: WorkerColors.ink, fontSize: 14.5, fontWeight: FontWeight.w800)),
                                  Text((job['customer_name'] ?? '').toString(),
                                      style: const TextStyle(color: Color(0xFF475569), fontSize: 12.5, fontWeight: FontWeight.w600)),
                                  Text('${workerVehicleLabel(job)}'
                                      '${(job['vehicle_plate'] ?? '').toString().isNotEmpty ? ' • ${job['vehicle_plate'].toString().toUpperCase()}' : ''}',
                                      style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12)),
                                  const SizedBox(height: 6),
                                  WorkerStatusChip(status: job['status']?.toString()),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (action != null) ...[
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _actingId.isEmpty ? _runCurrentAction : null,
                            icon: _actingId.isNotEmpty
                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.play_arrow_rounded, size: 20),
                            label: Text(action['label']!),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: WorkerColors.blue, foregroundColor: Colors.white, elevation: 0,
                              padding: const EdgeInsets.symmetric(vertical: 13),
                              textStyle: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
        ),

        // ── Recent Activity ──
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 8),
          child: const Text('Recent Activity',
              style: TextStyle(color: WorkerColors.ink, fontSize: 16, fontWeight: FontWeight.w800)),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: _activity.isEmpty
              ? WorkerCard(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: const Center(child: Text('No recent activity yet.',
                      style: TextStyle(color: WorkerColors.inkSoft, fontSize: 13))),
                )
              : Column(children: _activity.map((a) => _activityTile(a)).toList()),
        ),
      ],
    );
  }

  Widget _bellButton() {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, AppRoutes.workerNotifications),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            width: 40, height: 40, alignment: Alignment.center,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), shape: BoxShape.circle),
            child: const Icon(Icons.notifications_none_rounded, color: Colors.white, size: 21),
          ),
          if (_activity.isNotEmpty)
            Positioned(
              right: -2, top: -2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                constraints: const BoxConstraints(minWidth: 18),
                decoration: BoxDecoration(color: WorkerColors.rose, borderRadius: BorderRadius.circular(999)),
                child: Text('${_activity.length}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _activityTile(Map a) {
    final titles = {
      'worker_assigned': 'New job assigned',
      'washing': 'Washing started',
      'ready': 'Vehicle marked ready',
      'completed': 'Job completed',
      'cancelled': 'Booking cancelled',
      'confirmed': 'Booking confirmed',
    };
    final title = titles[a['status']?.toString()] ?? 'Status: ${a['status']}';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: WorkerCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(width: 36, height: 36, alignment: Alignment.center,
                decoration: BoxDecoration(color: const Color(0xFFDBEAFE), borderRadius: BorderRadius.circular(11)),
                child: const Icon(Icons.assignment_turned_in_outlined, color: WorkerColors.blue, size: 17)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Color(0xFF1E293B), fontSize: 13.5, fontWeight: FontWeight.w700)),
                  Text('${a['service_name'] ?? 'Car wash'}'
                      '${(a['booking_code'] ?? '').toString().isNotEmpty ? ' • ${a['booking_code']}' : ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(workerRelative(a['created_at']?.toString()),
                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}
