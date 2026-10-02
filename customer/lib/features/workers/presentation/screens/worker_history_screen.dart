import 'dart:convert';
import 'package:flutter/material.dart';

import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../widgets/worker_bottom_nav.dart';
import '../widgets/worker_widgets.dart';

class WorkerHistoryScreen extends StatefulWidget {
  const WorkerHistoryScreen({super.key});

  @override
  State<WorkerHistoryScreen> createState() => _WorkerHistoryScreenState();
}

class _WorkerHistoryScreenState extends State<WorkerHistoryScreen> {
  List<dynamic> _jobs = [];
  bool _isLoading = true;
  bool _hasError = false;
  bool _showSearch = false;
  String _query = '';
  String _dateFilter = 'all'; // all | 7 | 30
  String _service = 'all';

  final List<Map<String, String>> _dateFilters = const [
    {'key': 'all', 'label': 'All time'},
    {'key': '7', 'label': 'Last 7 days'},
    {'key': '30', 'label': 'Last 30 days'},
  ];

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
      final res = await ApiService.get('/worker/jobs?filter=completed');
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

  List<String> get _services {
    final set = <String>{};
    for (final j in _jobs) {
      final s = (j['service_name'] ?? '').toString();
      if (s.isNotEmpty) set.add(s);
    }
    return ['all', ...set];
  }

  bool _withinDays(String? dateStr, String days) {
    if (days == 'all') return true;
    if (dateStr == null || dateStr.isEmpty) return false;
    final dt = DateTime.tryParse(dateStr);
    if (dt == null) return false;
    return DateTime.now().difference(dt.toLocal()).inDays <= int.parse(days);
  }

  List<dynamic> get _visible {
    final q = _query.trim().toLowerCase();
    return _jobs.where((j) {
      if (!_withinDays((j['completed_at'] ?? j['scheduled_date'])?.toString(), _dateFilter)) return false;
      if (_service != 'all' && j['service_name']?.toString() != _service) return false;
      if (q.isEmpty) return true;
      final hay = [j['service_name'], j['customer_name'], j['vehicle_plate'], workerVehicleLabel(j), j['booking_code']]
          .where((e) => e != null).map((e) => e.toString().toLowerCase());
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
                        child: Text('History',
                            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                      ),
                      GestureDetector(
                        onTap: () => setState(() { _showSearch = !_showSearch; _query = ''; }),
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
                      child: Row(children: [
                        const Icon(Icons.search, color: Colors.white70, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            autofocus: true,
                            onChanged: (v) => setState(() => _query = v),
                            style: const TextStyle(color: Colors.white, fontSize: 14),
                            cursorColor: Colors.white,
                            decoration: const InputDecoration(
                              isDense: true, border: InputBorder.none,
                              hintText: 'Search completed jobs…',
                              hintStyle: TextStyle(color: Colors.white70, fontSize: 13.5),
                            ),
                          ),
                        ),
                      ]),
                    ),
                  ],
                  const SizedBox(height: 14),
                  SizedBox(
                    height: 34,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _dateFilters.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, i) {
                        final f = _dateFilters[i];
                        final selected = _dateFilter == f['key'];
                        return GestureDetector(
                          onTap: () => setState(() => _dateFilter = f['key']!),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: selected ? Colors.white : Colors.white.withOpacity(0.18),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(f['label']!,
                                style: TextStyle(color: selected ? WorkerColors.blue : Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Service filter (from real services)
          if (!_isLoading && !_hasError && _services.length > 1)
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                itemCount: _services.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final s = _services[i];
                  final selected = _service == s;
                  return GestureDetector(
                    onTap: () => setState(() => _service = s),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: selected ? const Color(0xFFDBEAFE) : Colors.white,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: selected ? WorkerColors.blue : const Color(0xFFE2E8F0)),
                      ),
                      child: Text(s == 'all' ? 'All services' : s,
                          style: TextStyle(
                              color: selected ? WorkerColors.blue : WorkerColors.inkSoft,
                              fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ),
                  );
                },
              ),
            ),

          Expanded(
            child: RefreshIndicator(
              color: WorkerColors.blue,
              onRefresh: _fetch,
              child: _isLoading
                  ? ListView(children: const [WorkerLoading(label: 'Loading history…')])
                  : _hasError
                      ? ListView(children: [WorkerErrorState(message: 'Could not load your history.', onRetry: _fetch)])
                      : _visible.isEmpty
                          ? ListView(children: const [
                              WorkerEmptyState(icon: Icons.history, title: 'No completed jobs', subtitle: 'Jobs you finish will be listed here.'),
                            ])
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount: _visible.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 12),
                              itemBuilder: (context, i) => WorkerJobCard(
                                job: _visible[i],
                                onTap: () => Navigator.pushNamed(context, AppRoutes.workerJobDetails, arguments: _visible[i]),
                              ),
                            ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: const WorkerBottomNav(currentTab: WorkerNavTab.history),
    );
  }
}
