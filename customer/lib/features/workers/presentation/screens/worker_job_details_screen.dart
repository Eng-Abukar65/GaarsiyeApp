import 'dart:convert';
import 'package:flutter/material.dart';

import '../../../../core/utils/api_service.dart';
import '../widgets/worker_widgets.dart';

class WorkerJobDetailsScreen extends StatefulWidget {
  const WorkerJobDetailsScreen({super.key});

  @override
  State<WorkerJobDetailsScreen> createState() => _WorkerJobDetailsScreenState();
}

class _WorkerJobDetailsScreenState extends State<WorkerJobDetailsScreen> {
  Map<String, dynamic>? _job;
  bool _isLoading = true;
  bool _isActionLoading = false;
  String? _error;
  String? _bookingId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_job == null && _bookingId == null) {
      final args = ModalRoute.of(context)?.settings.arguments;
      if (args is Map) {
        _job = Map<String, dynamic>.from(args);
        _bookingId = _job!['id'].toString();
        _fetchJobDetails(_bookingId!);
      } else if (args != null) {
        _bookingId = args.toString();
        _fetchJobDetails(_bookingId!);
      } else {
        setState(() {
          _error = 'Job not found.';
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _fetchJobDetails(String bookingId) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final res = await ApiService.get('/worker/jobs/$bookingId');
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        if (mounted) {
          setState(() { _job = data['data']; _isLoading = false; });
        }
      } else {
        if (mounted) {
          setState(() {
            _error = data['message']?.toString() ?? 'Job not found or not assigned to you.';
            _isLoading = false;
          });
        }
      }
    } catch (_) {
      if (mounted) setState(() { _error = 'Could not load job details.'; _isLoading = false; });
    }
  }

  Future<void> _runAction(String endpoint) async {
    if (_job == null || _isActionLoading) return;
    final id = _job!['id'].toString();
    setState(() => _isActionLoading = true);
    try {
      final res = await ApiService.patch('/worker/jobs/$id/$endpoint', {});
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        _snack('Job updated.');
        await _fetchJobDetails(id);
      } else {
        _snack(data['message']?.toString() ?? 'That action is not allowed right now.', error: true);
      }
    } catch (_) {
      _snack('Could not update the job.', error: true);
    } finally {
      if (mounted) setState(() => _isActionLoading = false);
    }
  }

  void _snack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: error ? WorkerColors.rose : WorkerColors.green),
    );
  }

  // Only the action allowed by the current status is shown.
  List<Map<String, dynamic>> _actions(Map job) {
    final s = job['status']?.toString();
    if (s == 'worker_assigned') {
      if (job['worker_accepted_at'] == null) {
        return [
          {'ep': 'accept', 'label': 'Accept Job', 'color': WorkerColors.green},
          {'ep': 'decline', 'label': 'Decline Job', 'color': WorkerColors.rose},
        ];
      }
      return [{'ep': 'start', 'label': 'Start Car Wash', 'color': WorkerColors.blue}];
    }
    if (s == 'worker_accepted') {
      return [{'ep': 'start', 'label': 'Start Car Wash', 'color': WorkerColors.blue}];
    }
    if (s == 'washing' || s == 'ready') {
      return [{'ep': 'complete', 'label': 'Complete Job', 'color': WorkerColors.green}];
    }
    return [];
  }

  List<Map<String, dynamic>> _timeline(Map job) {
    final s = job['status']?.toString();
    const rank = {'worker_assigned': 1, 'washing': 2, 'ready': 3, 'completed': 4};
    final cur = rank[s] ?? 0;
    final accepted = job['worker_accepted_at'] != null;
    return [
      {'label': 'Assigned', 'done': cur >= 1, 'time': job['worker_assigned_at']},
      {'label': 'Accepted', 'done': accepted || cur >= 2, 'time': job['worker_accepted_at']},
      {'label': 'Washing In Progress', 'done': cur >= 2, 'time': job['started_at']},
      {'label': 'Vehicle Ready', 'done': cur >= 3, 'time': job['ready_at']},
      {'label': 'Completed', 'done': cur >= 4, 'time': job['completed_at']},
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: WorkerColors.bg,
      body: Column(
        children: [
          const WorkerTopBar(title: 'Job Details'),
          Expanded(
            child: _isLoading
                ? const WorkerLoading()
                : _job == null
                    ? WorkerErrorState(
                        message: _error ?? 'Job not found or not assigned to you.',
                        onRetry: _bookingId != null ? () => _fetchJobDetails(_bookingId!) : null,
                      )
                    : _buildDetails(_job!),
          ),
        ],
      ),
    );
  }

  Widget _buildDetails(Map job) {
    final plate = (job['vehicle_plate'] ?? '').toString().toUpperCase();
    final addons = (job['addons'] is List) ? job['addons'] as List : const [];
    final actions = _actions(job);
    final total = double.tryParse('${job['total_price'] ?? 0}') ?? 0;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
      children: [
        // Booking summary
        WorkerCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('BOOKING ID',
                            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.3)),
                        Text((job['booking_code'] ?? '').toString(),
                            style: const TextStyle(color: WorkerColors.ink, fontSize: 18, fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ),
                  WorkerStatusChip(status: job['status']?.toString()),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.schedule, size: 14, color: WorkerColors.inkSoft),
                  const SizedBox(width: 5),
                  Text('${workerFmtShortDate(job['scheduled_date']?.toString())} • ${workerFmtTime(job['scheduled_time']?.toString())}',
                      style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12.5)),
                  const Spacer(),
                  Text('\$${total.toStringAsFixed(2)}',
                      style: const TextStyle(color: WorkerColors.blue, fontSize: 16, fontWeight: FontWeight.w800)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Customer
        WorkerCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _CardTitle('Customer'),
              WorkerInfoRow(icon: Icons.person_outline, label: 'Name', value: (job['customer_name'] ?? '').toString()),
              WorkerInfoRow(icon: Icons.phone_outlined, label: 'Phone', value: (job['customer_phone'] ?? '').toString()),
              WorkerInfoRow(icon: Icons.place_outlined, label: 'Location', value: (job['service_address'] ?? '').toString()),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Vehicle
        WorkerCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _CardTitle('Vehicle'),
              WorkerInfoRow(
                icon: Icons.directions_car_outlined, label: 'Vehicle',
                value: '${workerVehicleLabel(job)}${(job['vehicle_color'] ?? '').toString().isNotEmpty ? ' • ${job['vehicle_color']}' : ''}',
              ),
              if ((job['vehicle_type_name'] ?? '').toString().isNotEmpty)
                WorkerInfoRow(icon: Icons.category_outlined, label: 'Type', value: job['vehicle_type_name'].toString()),
              WorkerInfoRow(icon: Icons.pin_outlined, label: 'Plate Number', value: plate),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Service + add-ons
        WorkerCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _CardTitle('Service'),
              Row(
                children: [
                  const Icon(Icons.build_circle_outlined, size: 18, color: WorkerColors.blue),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text((job['service_name'] ?? 'Car Wash').toString(),
                        style: const TextStyle(color: Color(0xFF1E293B), fontSize: 14.5, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
              if (addons.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text('ADD-ONS',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.3)),
                const SizedBox(height: 6),
                ...addons.map((a) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          const Icon(Icons.auto_awesome, size: 14, color: WorkerColors.blue),
                          const SizedBox(width: 8),
                          Expanded(child: Text((a['name'] ?? '').toString(),
                              style: const TextStyle(color: Color(0xFF334155), fontSize: 13.5, fontWeight: FontWeight.w600))),
                          Text('\$${(double.tryParse('${a['price'] ?? 0}') ?? 0).toStringAsFixed(2)}',
                              style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 13, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    )),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Notes
        if ((job['notes'] ?? '').toString().isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(16)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(children: [
                  Icon(Icons.sticky_note_2_outlined, size: 16, color: Color(0xFF92400E)),
                  SizedBox(width: 6),
                  Text('Customer Notes', style: TextStyle(color: Color(0xFF92400E), fontSize: 13, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 6),
                Text(job['notes'].toString(),
                    style: const TextStyle(color: Color(0xFF78350F), fontSize: 13.5, height: 1.4)),
              ],
            ),
          ),
        if ((job['notes'] ?? '').toString().isNotEmpty) const SizedBox(height: 12),

        // Progress timeline
        WorkerCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _CardTitle('Job Progress'),
              ..._buildTimeline(job),
            ],
          ),
        ),

        // Actions
        if (actions.isNotEmpty) ...[
          const SizedBox(height: 14),
          ...actions.map((a) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isActionLoading ? null : () => _runAction(a['ep'] as String),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: a['color'] as Color, foregroundColor: Colors.white, elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                    ),
                    child: _isActionLoading
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(a['label'] as String, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  ),
                ),
              )),
        ] else if (job['status']?.toString() == 'completed') ...[
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 15),
            decoration: BoxDecoration(color: const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(15)),
            child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.check_circle, color: WorkerColors.green, size: 19),
              SizedBox(width: 8),
              Text('Job Completed', style: TextStyle(color: WorkerColors.green, fontSize: 15, fontWeight: FontWeight.w800)),
            ]),
          ),
        ],
      ],
    );
  }

  List<Widget> _buildTimeline(Map job) {
    final steps = _timeline(job);
    return List.generate(steps.length, (i) {
      final step = steps[i];
      final done = step['done'] == true;
      final last = i == steps.length - 1;
      final time = step['time']?.toString();
      return IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Container(
                  width: 24, height: 24, alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: done ? WorkerColors.blue : Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: done ? WorkerColors.blue : const Color(0xFFCBD5E1), width: 2),
                  ),
                  child: done ? const Icon(Icons.check, size: 13, color: Colors.white) : null,
                ),
                if (!last)
                  Expanded(child: Container(width: 2, color: done ? WorkerColors.blue : const Color(0xFFE2E8F0))),
              ],
            ),
            const SizedBox(width: 12),
            Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 14, top: 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(step['label'] as String,
                      style: TextStyle(
                          color: done ? const Color(0xFF1E293B) : const Color(0xFF94A3B8),
                          fontSize: 13.5, fontWeight: FontWeight.w700)),
                  if (time != null && time.isNotEmpty)
                    Text(workerFmtStamp(time), style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11.5)),
                ],
              ),
            ),
          ],
        ),
      );
    });
  }
}

class _CardTitle extends StatelessWidget {
  final String text;
  const _CardTitle(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(color: WorkerColors.ink, fontSize: 14, fontWeight: FontWeight.w800)),
      );
}
