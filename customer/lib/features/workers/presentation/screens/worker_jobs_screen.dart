import 'dart:convert';
import 'package:flutter/material.dart';

import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../widgets/worker_bottom_nav.dart';
import '../widgets/worker_widgets.dart';

class WorkerJobsScreen extends StatefulWidget {
  const WorkerJobsScreen({super.key});

  @override
  State<WorkerJobsScreen> createState() => _WorkerJobsScreenState();
}

class _WorkerJobsScreenState extends State<WorkerJobsScreen> {
  final List<Map<String, String>> _filters = const [
    {'key': 'all', 'label': 'All'},
    {'key': 'assigned', 'label': 'Assigned'},
    {'key': 'pending', 'label': 'Pending'},
    {'key': 'active', 'label': 'Active'},
    {'key': 'completed', 'label': 'Completed'},
  ];

  String _filter = 'all';
  List<dynamic> _jobs = [];
  bool _isLoading = true;
  bool _hasError = false;
  bool _showSearch = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _fetch(_filter);
  }

  Future<void> _fetch(String filter) async {
    setState(() {
      _isLoading = true;
      _hasError = false;
    });
    try {
      final res = await ApiService.get('/worker/jobs?filter=$filter');
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        setState(() => _jobs = data['data'] ?? []);
      } else {
        setState(() => _hasError = true);
      }
    } catch (_) {
      setState(() => _hasError = true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<dynamic> get _visible {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return _jobs;
    return _jobs.where((j) {
      final hay = [
        j['service_name'], j['customer_name'], j['vehicle_plate'],
        workerVehicleLabel(j), j['booking_code'], j['service_address'],
      ].where((e) => e != null).map((e) => e.toString().toLowerCase());
      return hay.any((s) => s.contains(q));
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: WorkerColors.bg,
      body: Column(
        children: [
          WorkerBlueHeader(
            child: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text('My Jobs',
                            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                      ),
                      GestureDetector(
                        onTap: () => setState(() {
                          _showSearch = !_showSearch;
                          _query = '';
                        }),
                        child: Container(
                          width: 38, height: 38, alignment: Alignment.center,
                          decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), shape: BoxShape.circle),
                          child: Icon(_showSearch ? Icons.close : Icons.search, color: Colors.white, size: 20),
                        ),
                      ),
                    ],
                  ),
                  if (_showSearch) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(12)),
                      child: Row(
                        children: [
                          const Icon(Icons.search, color: Colors.white70, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              autofocus: true,
                              onChanged: (v) => setState(() => _query = v),
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              cursorColor: Colors.white,
                              decoration: const InputDecoration(
                                isDense: true,
                                border: InputBorder.none,
                                hintText: 'Search service, customer, plate…',
                                hintStyle: TextStyle(color: Colors.white70, fontSize: 13.5),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  SizedBox(
                    height: 34,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _filters.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, i) {
                        final f = _filters[i];
                        final selected = _filter == f['key'];
                        return GestureDetector(
                          onTap: () {
                            setState(() => _filter = f['key']!);
                            _fetch(f['key']!);
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: selected ? Colors.white : Colors.white.withOpacity(0.18),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(f['label']!,
                                style: TextStyle(
                                    color: selected ? WorkerColors.blue : Colors.white,
                                    fontSize: 13, fontWeight: FontWeight.w700)),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: WorkerColors.blue,
              onRefresh: () => _fetch(_filter),
              child: _isLoading
                  ? ListView(children: const [WorkerLoading(label: 'Loading jobs…')])
                  : _hasError
                      ? ListView(children: [WorkerErrorState(message: 'Could not load your jobs.', onRetry: () => _fetch(_filter))])
                      : _visible.isEmpty
                          ? ListView(children: [
                              WorkerEmptyState(
                                icon: Icons.assignment_outlined,
                                title: _query.isNotEmpty ? 'No matching jobs' : 'No jobs here',
                                subtitle: _query.isNotEmpty
                                    ? 'Try a different search term.'
                                    : 'Nothing in "${_filters.firstWhere((f) => f['key'] == _filter)['label']}" right now.',
                              ),
                            ])
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount: _visible.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 12),
                              itemBuilder: (context, i) {
                                final job = _visible[i];
                                return WorkerJobCard(
                                  job: job,
                                  onTap: () => Navigator.pushNamed(context, AppRoutes.workerJobDetails, arguments: job),
                                );
                              },
                            ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: const WorkerBottomNav(currentTab: WorkerNavTab.jobs),
    );
  }
}
