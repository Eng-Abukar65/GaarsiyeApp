import 'package:flutter/material.dart';

import '../../../../core/utils/api_service.dart';

// ─── Car Wash Worker design kit ───────────────────────────────────────────────
// Reusable Flutter widgets + palette shared by every worker screen. Blue / white
// / green, rounded cards, soft shadows — matching the provided mobile design.
// This is a native Flutter mobile UI (no web layout, no phone-frame wrapper).

class WorkerColors {
  static const Color blue = Color(0xFF2563EB);
  static const Color blueDark = Color(0xFF1D4FD7);
  static const Color green = Color(0xFF16A34A);
  static const Color amber = Color(0xFFF59E0B);
  static const Color violet = Color(0xFF7C3AED);
  static const Color sky = Color(0xFF0EA5E9);
  static const Color rose = Color(0xFFE11D48);

  static const Color bg = Color(0xFFF4F6FB);
  static const Color card = Color(0xFFFFFFFF);
  static const Color ink = Color(0xFF0F172A);
  static const Color inkSoft = Color(0xFF64748B);
  static const Color line = Color(0xFFEEF1F6);

  static const LinearGradient headerGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [blue, Color(0xFF3B82F6)],
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────
Color workerStatusColor(String? status) {
  switch (status) {
    case 'worker_assigned':
      return WorkerColors.blue;
    case 'washing':
      return WorkerColors.sky;
    case 'ready':
      return WorkerColors.violet;
    case 'completed':
      return WorkerColors.green;
    case 'pending':
      return WorkerColors.amber;
    case 'cancelled':
    case 'rejected':
      return WorkerColors.rose;
    default:
      return WorkerColors.inkSoft;
  }
}

String workerStatusLabel(String? status) {
  switch (status) {
    case 'worker_assigned':
      return 'Assigned';
    case 'washing':
      return 'Washing';
    case 'ready':
      return 'Ready';
    case 'completed':
      return 'Completed';
    case 'pending':
      return 'Pending';
    case 'cancelled':
      return 'Cancelled';
    case 'rejected':
      return 'Rejected';
    default:
      return status ?? 'Unknown';
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────
String workerFmtTime(String? t) {
  if (t == null || t.isEmpty) return '';
  final parts = t.split(':');
  if (parts.isEmpty) return t;
  final h = int.tryParse(parts[0]);
  if (h == null) return t;
  final period = h >= 12 ? 'PM' : 'AM';
  final h12 = h % 12 == 0 ? 12 : h % 12;
  final m = parts.length > 1 ? parts[1] : '00';
  return '$h12:$m $period';
}

const List<String> _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const List<String> _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String workerFmtShortDate(String? d) {
  if (d == null || d.isEmpty) return '—';
  final dt = DateTime.tryParse(d);
  if (dt == null) return d;
  return '${_weekdays[dt.weekday - 1]}, ${_months[dt.month - 1]} ${dt.day}';
}

String workerFmtDate(String? d) {
  if (d == null || d.isEmpty) return '—';
  final dt = DateTime.tryParse(d);
  if (dt == null) return d;
  return '${dt.day} ${_months[dt.month - 1]} ${dt.year}';
}

String workerFmtStamp(String? ts) {
  if (ts == null || ts.isEmpty) return '';
  final dt = DateTime.tryParse(ts);
  if (dt == null) return '';
  final l = dt.toLocal();
  final period = l.hour >= 12 ? 'PM' : 'AM';
  final h12 = l.hour % 12 == 0 ? 12 : l.hour % 12;
  return '$h12:${l.minute.toString().padLeft(2, '0')} $period';
}

String workerRelative(String? ts) {
  if (ts == null || ts.isEmpty) return '';
  final dt = DateTime.tryParse(ts);
  if (dt == null) return '';
  final diff = DateTime.now().difference(dt.toLocal());
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return workerFmtDate(ts);
}

String workerVehicleLabel(Map job) {
  final brand = (job['vehicle_brand'] ?? '').toString();
  final model = (job['vehicle_model'] ?? '').toString();
  final joined = [brand, model].where((s) => s.isNotEmpty).join(' ');
  if (joined.isNotEmpty) return joined;
  final type = (job['vehicle_type_name'] ?? '').toString();
  return type.isNotEmpty ? type : 'Vehicle';
}

String workerInitials(String? name) {
  final parts = (name ?? '').trim().split(RegExp(r'\s+')).where((s) => s.isNotEmpty).toList();
  if (parts.isEmpty) return 'W';
  if (parts.length == 1) return parts[0].substring(0, parts[0].length >= 2 ? 2 : 1).toUpperCase();
  return (parts.first[0] + parts.last[0]).toUpperCase();
}

List<String> workerParseSkills(dynamic skills) {
  if (skills == null) return [];
  if (skills is List) return skills.map((e) => e.toString()).toList();
  final s = skills.toString();
  if (s.isEmpty) return [];
  try {
    // JSON array string
    if (s.trimLeft().startsWith('[')) {
      final decoded = (s.replaceAll('[', '').replaceAll(']', '').replaceAll('"', ''));
      return decoded.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    }
  } catch (_) {}
  return s.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
}

// ── Avatar ────────────────────────────────────────────────────────────────────
// Turns a stored relative path like "/uploads/worker-photos/x.png" into a full
// URL against the resolved API host (base URL minus its trailing "/api").
String? workerPhotoUrl(String? path) {
  final p = (path ?? '').trim();
  if (p.isEmpty) return null;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  final origin = ApiService.baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
  return '$origin$p';
}

class WorkerAvatar extends StatelessWidget {
  final String? name;
  final String? imageUrl;
  final double size;
  final bool ring;
  const WorkerAvatar({super.key, this.name, this.imageUrl, this.size = 44, this.ring = false});

  @override
  Widget build(BuildContext context) {
    final url = workerPhotoUrl(imageUrl);
    final initials = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: Color(0xFFDBEAFE), shape: BoxShape.circle),
      child: Text(
        workerInitials(name),
        style: TextStyle(color: WorkerColors.blue, fontWeight: FontWeight.w800, fontSize: size * 0.36),
      ),
    );

    Widget inner;
    if (url == null) {
      inner = initials;
    } else {
      inner = ClipOval(
        child: Image.network(
          url,
          width: size,
          height: size,
          fit: BoxFit.cover,
          // Show initials while loading and on any failure.
          loadingBuilder: (context, child, progress) => progress == null ? child : initials,
          errorBuilder: (context, error, stack) => initials,
        ),
      );
    }

    if (!ring) return inner;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withOpacity(0.7), width: 2),
      ),
      child: ClipOval(child: inner),
    );
  }
}

// ── Status chip ───────────────────────────────────────────────────────────────
class WorkerStatusChip extends StatelessWidget {
  final String? status;
  const WorkerStatusChip({super.key, this.status});

  @override
  Widget build(BuildContext context) {
    final c = workerStatusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: c.withOpacity(0.12), borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 6, height: 6, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(workerStatusLabel(status),
              style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

// ── Soft rounded card ─────────────────────────────────────────────────────────
class WorkerCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  const WorkerCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap});

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: WorkerColors.card,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(color: Color(0x0F1E293B), blurRadius: 14, offset: Offset(0, 6)),
        ],
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(borderRadius: BorderRadius.circular(18), onTap: onTap, child: card),
    );
  }
}

// ── Stat tile (Today's Overview) ──────────────────────────────────────────────
class WorkerStatCard extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color color;
  const WorkerStatCard({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return WorkerCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(value, style: TextStyle(color: color, fontSize: 26, fontWeight: FontWeight.w800, height: 1)),
              Container(
                width: 32, height: 32, alignment: Alignment.center,
                decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(9)),
                child: Icon(icon, color: color, size: 17),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ── Job card (Home, Jobs, History) ────────────────────────────────────────────
class WorkerJobCard extends StatelessWidget {
  final Map job;
  final VoidCallback onTap;
  const WorkerJobCard({super.key, required this.job, required this.onTap});

  static const List<List<Color>> _tints = [
    [Color(0xFFDBEAFE), WorkerColors.blue],
    [Color(0xFFDCFCE7), WorkerColors.green],
    [Color(0xFFEDE9FE), WorkerColors.violet],
    [Color(0xFFFEF3C7), WorkerColors.amber],
    [Color(0xFFE0F2FE), WorkerColors.sky],
  ];

  @override
  Widget build(BuildContext context) {
    final tint = _tints[(int.tryParse('${job['id']}') ?? 0) % _tints.length];
    final plate = (job['vehicle_plate'] ?? '').toString().toUpperCase();
    final addr = (job['service_address'] ?? '').toString();
    return WorkerCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44, height: 44, alignment: Alignment.center,
                decoration: BoxDecoration(color: tint[0], borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.directions_car_filled, color: tint[1], size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            (job['service_name'] ?? 'Car Wash').toString(),
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: WorkerColors.ink, fontSize: 15, fontWeight: FontWeight.w800),
                          ),
                        ),
                        const SizedBox(width: 8),
                        WorkerStatusChip(status: job['status']?.toString()),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text((job['customer_name'] ?? 'Customer').toString(),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Color(0xFF475569), fontSize: 13, fontWeight: FontWeight.w600)),
                    Text(
                      '${workerVehicleLabel(job)}${plate.isNotEmpty ? ' • $plate' : ''}',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.schedule, size: 13, color: WorkerColors.inkSoft),
              const SizedBox(width: 4),
              Text(
                '${workerFmtShortDate(job['scheduled_date']?.toString())}'
                '${(job['scheduled_time'] ?? '').toString().isNotEmpty ? ' • ${workerFmtTime(job['scheduled_time']?.toString())}' : ''}',
                style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12),
              ),
              if (addr.isNotEmpty) ...[
                const SizedBox(width: 10),
                const Icon(Icons.place_outlined, size: 13, color: WorkerColors.inkSoft),
                const SizedBox(width: 3),
                Expanded(
                  child: Text(addr, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12)),
                ),
              ] else
                const Spacer(),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: const [
              Text('View Details', style: TextStyle(color: WorkerColors.blue, fontSize: 13, fontWeight: FontWeight.w700)),
              Icon(Icons.chevron_right, color: WorkerColors.blue, size: 17),
            ],
          ),
        ],
      ),
    );
  }
}

// ── States ────────────────────────────────────────────────────────────────────
class WorkerLoading extends StatelessWidget {
  final String label;
  const WorkerLoading({super.key, this.label = 'Loading…'});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 80),
        child: Column(
          children: [
            const SizedBox(
              width: 30, height: 30,
              child: CircularProgressIndicator(strokeWidth: 3, color: WorkerColors.blue),
            ),
            const SizedBox(height: 14),
            Text(label, style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      );
}

class WorkerEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  const WorkerEmptyState({super.key, this.icon = Icons.inbox_outlined, required this.title, this.subtitle});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 64, horizontal: 24),
        child: Column(
          children: [
            Container(
              width: 64, height: 64, alignment: Alignment.center,
              decoration: BoxDecoration(color: const Color(0xFFDBEAFE), borderRadius: BorderRadius.circular(18)),
              child: Icon(icon, color: WorkerColors.blue, size: 28),
            ),
            const SizedBox(height: 14),
            Text(title, textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF334155), fontSize: 15, fontWeight: FontWeight.w800)),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(subtitle!, textAlign: TextAlign.center,
                  style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 13)),
            ],
          ],
        ),
      );
}

class WorkerErrorState extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const WorkerErrorState({super.key, required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 64, horizontal: 24),
        child: Column(
          children: [
            Container(
              width: 64, height: 64, alignment: Alignment.center,
              decoration: BoxDecoration(color: const Color(0xFFFFE4E6), borderRadius: BorderRadius.circular(18)),
              child: const Icon(Icons.error_outline, color: WorkerColors.rose, size: 28),
            ),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF475569), fontSize: 13.5, fontWeight: FontWeight.w600)),
            if (onRetry != null) ...[
              const SizedBox(height: 14),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Try again'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: WorkerColors.blue, foregroundColor: Colors.white,
                  elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ],
        ),
      );
}

class WorkerSkeleton extends StatelessWidget {
  final double height;
  final double? width;
  final double radius;
  const WorkerSkeleton({super.key, this.height = 16, this.width, this.radius = 10});
  @override
  Widget build(BuildContext context) => Container(
        height: height,
        width: width,
        decoration: BoxDecoration(color: const Color(0xFFE9EDF4), borderRadius: BorderRadius.circular(radius)),
      );
}

// ── Info row (details / profile) ──────────────────────────────────────────────
class WorkerInfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;
  const WorkerInfoRow({super.key, required this.icon, required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36, height: 36, alignment: Alignment.center,
              decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(11)),
              child: Icon(icon, size: 17, color: WorkerColors.inkSoft),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label.toUpperCase(),
                      style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.3)),
                  const SizedBox(height: 1),
                  Text(value.isEmpty ? '—' : value,
                      style: TextStyle(color: valueColor ?? const Color(0xFF1E293B), fontSize: 14, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ],
        ),
      );
}

// ── Blue rounded header ───────────────────────────────────────────────────────
class WorkerBlueHeader extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const WorkerBlueHeader({super.key, required this.child, this.padding = const EdgeInsets.fromLTRB(20, 16, 20, 24)});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: const BoxDecoration(
        gradient: WorkerColors.headerGradient,
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
        boxShadow: [BoxShadow(color: Color(0x332563EB), blurRadius: 18, offset: Offset(0, 8))],
      ),
      child: child,
    );
  }
}

/// Simple blue top bar with an optional back button + trailing widget.
class WorkerTopBar extends StatelessWidget {
  final String title;
  final bool showBack;
  final Widget? trailing;
  const WorkerTopBar({super.key, required this.title, this.showBack = true, this.trailing});

  @override
  Widget build(BuildContext context) {
    return WorkerBlueHeader(
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            if (showBack)
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 38, height: 38, alignment: Alignment.center,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), shape: BoxShape.circle),
                  child: const Icon(Icons.arrow_back, color: Colors.white, size: 19),
                ),
              ),
            if (showBack) const SizedBox(width: 12),
            Expanded(
              child: Text(title,
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
