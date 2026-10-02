import 'package:flutter/material.dart';

import '../../../../core/routes/app_routes.dart';
import 'worker_widgets.dart';

enum WorkerNavTab { home, jobs, history, profile }

/// Fixed bottom navigation shared by all worker tabs (Home, Jobs, History,
/// Profile) — clean white bar, blue active state, matching the design.
class WorkerBottomNav extends StatelessWidget {
  const WorkerBottomNav({super.key, required this.currentTab});

  final WorkerNavTab currentTab;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: WorkerColors.line)),
        boxShadow: [BoxShadow(color: Color(0x0A1E293B), blurRadius: 12, offset: Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _WorkerNavItem(
                icon: Icons.grid_view_rounded,
                label: 'Home',
                isSelected: currentTab == WorkerNavTab.home,
                onTap: () => _goTo(context, AppRoutes.workerDashboard),
              ),
              _WorkerNavItem(
                icon: Icons.assignment_outlined,
                label: 'Jobs',
                isSelected: currentTab == WorkerNavTab.jobs,
                onTap: () => _goTo(context, AppRoutes.workerJobs),
              ),
              _WorkerNavItem(
                icon: Icons.history,
                label: 'History',
                isSelected: currentTab == WorkerNavTab.history,
                onTap: () => _goTo(context, AppRoutes.workerHistory),
              ),
              _WorkerNavItem(
                icon: Icons.person_outline,
                label: 'Profile',
                isSelected: currentTab == WorkerNavTab.profile,
                onTap: () => _goTo(context, AppRoutes.workerProfile),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _goTo(BuildContext context, String route) {
    final currentRoute = ModalRoute.of(context)?.settings.name;
    if (currentRoute == route) return;
    Navigator.pushReplacementNamed(context, route);
  }
}

class _WorkerNavItem extends StatelessWidget {
  const _WorkerNavItem({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = isSelected ? WorkerColors.blue : const Color(0xFF94A3B8);
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: color, size: 23),
              const SizedBox(height: 3),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 11,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
