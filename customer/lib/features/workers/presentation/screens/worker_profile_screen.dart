import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../widgets/worker_bottom_nav.dart';
import '../widgets/worker_widgets.dart';

class WorkerProfileScreen extends StatefulWidget {
  const WorkerProfileScreen({super.key});

  @override
  State<WorkerProfileScreen> createState() => _WorkerProfileScreenState();
}

class _WorkerProfileScreenState extends State<WorkerProfileScreen> {
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _stats;
  bool _isLoading = true;
  bool _hasError = false;
  bool _uploadingPhoto = false;
  final ImagePicker _picker = ImagePicker();

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
      final results = await Future.wait([
        ApiService.get('/worker/profile'),
        ApiService.get('/worker/stats'),
      ]);
      final res = results[0];
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true) _profile = data['data'];
      }
      final statsRes = results[1];
      if (statsRes.statusCode == 200) {
        final data = jsonDecode(statsRes.body);
        if (data['success'] == true) _stats = data['data'];
      }
      if (_profile == null) _hasError = true;
    } catch (_) {
      _hasError = true;
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (mounted) {
      Navigator.pushNamedAndRemoveUntil(context, AppRoutes.login, (route) => false);
    }
  }

  // ── Profile photo upload ──
  void _showPhotoOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 8),
                  decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(2))),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: WorkerColors.blue),
                title: const Text('Choose from gallery', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () { Navigator.pop(ctx); _pickAndUpload(ImageSource.gallery); },
              ),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined, color: WorkerColors.blue),
                title: const Text('Take a photo', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () { Navigator.pop(ctx); _pickAndUpload(ImageSource.camera); },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickAndUpload(ImageSource source) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source, maxWidth: 1024, maxHeight: 1024, imageQuality: 85);
      if (image == null) return;
      final bytes = await image.readAsBytes();

      setState(() => _uploadingPhoto = true);
      final res = await ApiService.uploadFileBytes(
        '/worker/upload-profile-image', 'image', bytes, image.name);
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        if (mounted) {
          setState(() => _profile?['profile_image'] = data['profile_image']);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Profile photo updated.'), backgroundColor: WorkerColors.green));
        }
      } else {
        _snack(data['message']?.toString() ?? 'Could not upload the photo.', error: true);
      }
    } catch (_) {
      _snack('Could not upload the photo.', error: true);
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  void _snack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: error ? WorkerColors.rose : WorkerColors.green));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: WorkerColors.bg,
      body: _isLoading
          ? const WorkerLoading(label: 'Loading profile…')
          : _hasError || _profile == null
              ? WorkerErrorState(message: 'Could not load your profile.', onRetry: _fetch)
              : _buildBody(),
      bottomNavigationBar: const WorkerBottomNav(currentTab: WorkerNavTab.profile),
    );
  }

  Widget _buildBody() {
    final p = _profile!;
    final name = (p['name'] ?? '').toString().trim().isNotEmpty
        ? p['name'].toString()
        : '${p['first_name'] ?? ''} ${p['last_name'] ?? ''}'.trim();
    final isAvailable = (p['availability_status'] ?? '').toString().toLowerCase() == 'available';
    final isActive = (p['worker_status'] ?? '').toString().toLowerCase() == 'active';
    final skills = workerParseSkills(p['skills']);
    final completed = int.tryParse('${p['completed_jobs_count'] ?? _stats?['completed'] ?? 0}') ?? 0;
    final rating = double.tryParse('${p['rating'] ?? 0}') ?? 0;
    final openNow = (int.tryParse('${_stats?['pending'] ?? 0}') ?? 0) + (int.tryParse('${_stats?['active'] ?? 0}') ?? 0);
    final totalHandled = completed + openNow;
    final completionRate = totalHandled > 0 ? ((completed / totalHandled) * 100).round() : null;

    return RefreshIndicator(
      color: WorkerColors.blue,
      onRefresh: _fetch,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          // Blue header
          WorkerBlueHeader(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  const Text('Profile', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 16),
                  // Tappable avatar with an edit badge → pick + upload a photo.
                  GestureDetector(
                    onTap: _uploadingPhoto ? null : _showPhotoOptions,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        WorkerAvatar(
                          name: name.isEmpty ? 'Worker' : name,
                          imageUrl: p['profile_image']?.toString(),
                          size: 84, ring: true,
                        ),
                        if (_uploadingPhoto)
                          Positioned.fill(
                            child: Container(
                              decoration: BoxDecoration(color: Colors.black.withOpacity(0.35), shape: BoxShape.circle),
                              child: const Center(
                                child: SizedBox(width: 22, height: 22,
                                    child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)),
                              ),
                            ),
                          ),
                        Positioned(
                          right: 0, bottom: 0,
                          child: Container(
                            width: 28, height: 28, alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: WorkerColors.green, shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                            child: const Icon(Icons.camera_alt, color: Colors.white, size: 14),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(name.isEmpty ? 'Worker' : name,
                      style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  const Text('Car Wash Worker', style: TextStyle(color: Colors.white70, fontSize: 13)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Container(width: 8, height: 8,
                          decoration: BoxDecoration(
                              color: isAvailable ? const Color(0xFF4ADE80) : const Color(0xFFCBD5E1),
                              shape: BoxShape.circle)),
                      const SizedBox(width: 7),
                      Text(isAvailable ? 'Available' : 'Offline',
                          style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ]),
                  ),
                ],
              ),
            ),
          ),

          Transform.translate(
            offset: const Offset(0, -22),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                children: [
                  // Details
                  WorkerCard(
                    child: Column(
                      children: [
                        WorkerInfoRow(icon: Icons.storefront_outlined, label: 'Vendor',
                            value: (p['vendor_business_name'] ?? p['vendor_name'] ?? '').toString()),
                        const Divider(height: 1, color: WorkerColors.line),
                        WorkerInfoRow(icon: Icons.phone_outlined, label: 'Phone', value: (p['phone'] ?? '').toString()),
                        const Divider(height: 1, color: WorkerColors.line),
                        WorkerInfoRow(icon: Icons.mail_outline, label: 'Email', value: (p['email'] ?? '').toString()),
                        const Divider(height: 1, color: WorkerColors.line),
                        WorkerInfoRow(icon: Icons.alternate_email, label: 'Username', value: (p['username'] ?? '').toString()),
                        const Divider(height: 1, color: WorkerColors.line),
                        WorkerInfoRow(
                          icon: Icons.verified_user_outlined, label: 'Account Status',
                          value: isActive ? 'Active' : 'Inactive',
                          valueColor: isActive ? WorkerColors.green : WorkerColors.rose,
                        ),
                        if ((p['last_login'] ?? '').toString().isNotEmpty) ...[
                          const Divider(height: 1, color: WorkerColors.line),
                          WorkerInfoRow(icon: Icons.login, label: 'Last Login', value: workerFmtDate(p['last_login']?.toString())),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Skills
                  if (skills.isNotEmpty)
                    WorkerCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('My Skills', style: TextStyle(color: WorkerColors.ink, fontSize: 14, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8, runSpacing: 8,
                            children: skills.map((s) => Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                                  decoration: BoxDecoration(color: const Color(0xFFDBEAFE), borderRadius: BorderRadius.circular(9)),
                                  child: Text(s, style: const TextStyle(color: WorkerColors.blue, fontSize: 12.5, fontWeight: FontWeight.w600)),
                                )).toList(),
                          ),
                        ],
                      ),
                    ),
                  if (skills.isNotEmpty) const SizedBox(height: 12),

                  // Metrics
                  Row(children: [
                    Expanded(child: _metric('$completed', 'Completed', WorkerColors.blue)),
                    const SizedBox(width: 12),
                    Expanded(child: _metric(rating.toStringAsFixed(1), 'Rating', WorkerColors.amber, star: true)),
                    const SizedBox(width: 12),
                    Expanded(child: _metric(completionRate == null ? '—' : '$completionRate%', 'Completion', WorkerColors.green)),
                  ]),
                  const SizedBox(height: 12),

                  // Actions
                  WorkerCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        _actionRow(Icons.lock_outline, 'Change Password', WorkerColors.inkSoft,
                            const Color(0xFFF1F5F9), _showChangePassword),
                        const Divider(height: 1, color: WorkerColors.line),
                        _actionRow(Icons.logout, 'Logout', WorkerColors.rose,
                            const Color(0xFFFFE4E6), _confirmLogout, danger: true),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _metric(String value, String label, Color color, {bool star = false}) {
    return WorkerCard(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(value, style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.w800)),
              if (star) ...[
                const SizedBox(width: 3),
                const Icon(Icons.star, color: WorkerColors.amber, size: 15),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _actionRow(IconData icon, String label, Color color, Color bg, VoidCallback onTap, {bool danger = false}) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(width: 36, height: 36, alignment: Alignment.center,
                decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(11)),
                child: Icon(icon, size: 17, color: color)),
            const SizedBox(width: 12),
            Expanded(child: Text(label,
                style: TextStyle(
                    color: danger ? WorkerColors.rose : const Color(0xFF1E293B),
                    fontSize: 14, fontWeight: FontWeight.w700))),
            if (!danger) const Icon(Icons.chevron_right, color: Color(0xFFCBD5E1), size: 20),
          ],
        ),
      ),
    );
  }

  void _confirmLogout() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Log out?', style: TextStyle(fontWeight: FontWeight.w800)),
        content: const Text('You will need to sign in again to access your jobs.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () { Navigator.pop(ctx); _logout(); },
            style: ElevatedButton.styleFrom(backgroundColor: WorkerColors.rose, foregroundColor: Colors.white, elevation: 0),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }

  // ── Change Password bottom sheet (screen #7, redesigned) ──
  void _showChangePassword() {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    String? error;
    bool saving = false;
    bool obscure1 = true, obscure2 = true, obscure3 = true;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          Widget field(String label, TextEditingController ctrl, bool obscure, VoidCallback toggle) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: WorkerColors.inkSoft, fontSize: 12.5, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: ctrl,
                  obscureText: obscure,
                  decoration: InputDecoration(
                    isDense: true,
                    prefixIcon: const Icon(Icons.lock_outline, size: 18, color: WorkerColors.inkSoft),
                    suffixIcon: IconButton(
                      icon: Icon(obscure ? Icons.visibility_off : Icons.visibility, size: 18, color: WorkerColors.inkSoft),
                      onPressed: toggle,
                    ),
                    filled: true,
                    fillColor: WorkerColors.bg,
                    hintText: '••••••••',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: WorkerColors.blue, width: 1.4),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
              ],
            );
          }

          return Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
            child: Container(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 22),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(topLeft: Radius.circular(24), topRight: Radius.circular(24)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(child: Container(width: 40, height: 4,
                      decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(2)))),
                  const SizedBox(height: 16),
                  const Text('Change Password', style: TextStyle(color: WorkerColors.ink, fontSize: 17, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 16),
                  if (error != null) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(color: const Color(0xFFFFE4E6), borderRadius: BorderRadius.circular(10)),
                      child: Text(error!, style: const TextStyle(color: WorkerColors.rose, fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ),
                  ],
                  field('Current password', currentCtrl, obscure1, () => setSheet(() => obscure1 = !obscure1)),
                  field('New password', newCtrl, obscure2, () => setSheet(() => obscure2 = !obscure2)),
                  field('Confirm new password', confirmCtrl, obscure3, () => setSheet(() => obscure3 = !obscure3)),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: saving ? null : () async {
                        if (newCtrl.text.length < 6) { setSheet(() => error = 'New password must be at least 6 characters.'); return; }
                        if (newCtrl.text != confirmCtrl.text) { setSheet(() => error = 'The new passwords do not match.'); return; }
                        setSheet(() { saving = true; error = null; });
                        try {
                          final res = await ApiService.put('/worker/change-password', {
                            'current_password': currentCtrl.text,
                            'new_password': newCtrl.text,
                          });
                          final data = jsonDecode(res.body);
                          if (res.statusCode == 200 && data['success'] == true) {
                            if (mounted) {
                              Navigator.pop(ctx);
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                                content: Text('Password updated successfully.'), backgroundColor: WorkerColors.green));
                            }
                          } else {
                            setSheet(() { error = data['message']?.toString() ?? 'Could not change password.'; saving = false; });
                          }
                        } catch (_) {
                          setSheet(() { error = 'Could not change password.'; saving = false; });
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: WorkerColors.blue, foregroundColor: Colors.white, elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                      ),
                      child: saving
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Update Password', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
