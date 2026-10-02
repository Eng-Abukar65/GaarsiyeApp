import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_typography.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/theme/theme_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/profile_model.dart';
import '../widgets/ai_guide_assistant.dart';
import '../../../../shared/widgets/customer_bottom_nav.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/services/customer_notification_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  ProfileModel? _profile;
  bool _isLoading = true;
  bool _isStatsLoading = true;
  bool _imageTapped = false;
  late final AnimationController _tapAnimController;
  late final Animation<double> _tapAnim;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tapAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
    );
    _tapAnim = CurvedAnimation(
      parent: _tapAnimController,
      curve: Curves.easeInOut,
    );
    _fetchProfile();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tapAnimController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _fetchProfile(showFullScreenLoader: false);
    }
  }

  Future<void> _fetchProfile({bool showFullScreenLoader = true}) async {
    if (showFullScreenLoader) {
      setState(() {
        _isLoading = true;
        _isStatsLoading = true;
      });
    } else {
      setState(() => _isStatsLoading = true);
    }

    try {
      final responses = await Future.wait([
        ApiService.get('/customer/profile'),
        ApiService.get('/customer/profile/stats'),
      ]);

      final profileResponse = responses[0];
      final statsResponse = responses[1];

      if (profileResponse.statusCode != 200) {
        throw Exception(
          'Profile request failed: ${profileResponse.statusCode}',
        );
      }

      final data = jsonDecode(profileResponse.body);
      Map<String, dynamic> stats = const {
        'totalRefills': 0,
        'fuelDelivered': 0,
        'memberStatus': 'Active',
      };

      if (statsResponse.statusCode == 200) {
        stats = Map<String, dynamic>.from(jsonDecode(statsResponse.body));
      } else {
        debugPrint('Profile stats fallback: ${statsResponse.statusCode}');
      }

      if (!mounted) return;

      final rawPhotoUrl = data['photo_url']?.toString().trim();
      String? photoUrl;
      if (rawPhotoUrl != null && rawPhotoUrl.isNotEmpty) {
        if (rawPhotoUrl.startsWith('/uploads')) {
          final host = ApiService.baseUrl.replaceAll('/api', '');
          photoUrl = '$host$rawPhotoUrl';
        } else {
          photoUrl = rawPhotoUrl;
        }
      }

      setState(() {
        _profile = ProfileModel(
          name: data['first_name'] != null
              ? '${data['first_name']} ${data['last_name'] ?? ''}'.trim()
              : (data['username'] ?? 'Customer'),
          email: data['email'] ?? '',
          phone: data['phone'] ?? '',
          photoUrl: photoUrl,
          totalRefills: (stats['totalRefills'] as num?)?.toInt() ?? 0,
          fuelDelivered:
              '${((stats['fuelDelivered'] as num?) ?? 0).toStringAsFixed(((stats['fuelDelivered'] as num?) ?? 0) % 1 == 0 ? 0 : 1)}L',
          status: (stats['memberStatus'] ?? 'Active').toString(),
          gender: data['gender']?.toString(),
        );
      });
    } catch (e) {
      print('Error fetching profile: $e');
      if (!mounted) return;
      setState(() => _profile ??= ProfileModel.dummyProfile);
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isStatsLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final isDark = themeProvider.isDarkMode;
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;

    if (_isLoading) {
      return Scaffold(
        backgroundColor: bgColor,
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
      );
    }

    final profile = _profile ?? ProfileModel.dummyProfile;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        leading: IconButton(
          onPressed: () {
            if (Navigator.canPop(context)) {
              Navigator.pop(context);
            } else {
              Navigator.pushReplacementNamed(context, AppRoutes.home);
            }
          },
          icon: Icon(Icons.arrow_back, color: textPrimary),
        ),
        title: Text(
          'Profile',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            onPressed: () {
              print('DEBUG: Profile Notifications clicked');
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Notification settings coming soon!'),
                ),
              );
            },
            icon: Icon(Icons.notifications_none, color: textPrimary),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            children: [
              // Profile Header
              _buildProfileHeader(profile),

              // Stats Card
              _buildStatsCard(profile),

              const SizedBox(height: AppSpacing.l),

              // Menu Sections
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSectionTitle('ACCOUNT'),
                    _buildMenuItem(
                      Icons.person,
                      'Personal Info',
                      route: AppRoutes.personalInfo,
                    ),
                    _buildMenuItem(
                      Icons.location_on,
                      'Saved Addresses',
                      route: AppRoutes.savedAddresses,
                    ),
                    _buildMenuItem(
                      Icons.payments,
                      'Payment Methods',
                      route: AppRoutes.paymentMethods,
                    ),

                    const SizedBox(height: AppSpacing.l),
                    _buildSectionTitle('ACTIVITY & APP'),
                    _buildMenuItem(
                      Icons.history,
                      'Order History',
                      route: AppRoutes.history,
                    ),
                    _buildMenuItem(
                      Icons.settings,
                      'Settings',
                      route: AppRoutes.settings,
                    ),
                    _buildDarkModeToggle(),

                    const SizedBox(height: AppSpacing.xl),
                    _buildLogoutButton(),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const CustomerBottomNav(
        currentTab: CustomerNavTab.profile,
      ),
    );
  }

  Widget _buildProfileHeader(ProfileModel profile) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final bgColor = theme.scaffoldBackgroundColor;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        children: [
          Stack(
            children: [
              // Tappable profile image with camera overlay
              GestureDetector(
                onTap: () async {
                  setState(() => _imageTapped = true);
                  _tapAnimController.forward();
                  await Future.delayed(const Duration(milliseconds: 550));
                  if (mounted) {
                    _tapAnimController.reverse();
                    setState(() => _imageTapped = false);
                    Navigator.pushNamed(context, AppRoutes.personalInfo).then((
                      _,
                    ) {
                      if (mounted) _fetchProfile(showFullScreenLoader: false);
                    });
                  }
                },
                child: AnimatedBuilder(
                  animation: _tapAnim,
                  builder: (context, child) {
                    return Stack(
                      children: [
                        Container(
                          width: 128,
                          height: 128,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: isDark
                                ? AppColors.surfaceDark
                                : Colors.grey.shade200,
                            border: Border.all(
                              color: AppColors.primary.withAlpha(
                                (51 + (100 * _tapAnim.value)).toInt(),
                              ),
                              width: 4,
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child:
                              profile.photoUrl != null &&
                                  profile.photoUrl!.isNotEmpty
                              ? ColorFiltered(
                                  colorFilter: ColorFilter.mode(
                                    Colors.black.withAlpha(
                                      (_tapAnim.value * 140).toInt(),
                                    ),
                                    BlendMode.darken,
                                  ),
                                  child: Image.network(
                                    profile.photoUrl!,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Icon(
                                      Icons.person,
                                      size: 64,
                                      color: AppColors.primary.withAlpha(190),
                                    ),
                                  ),
                                )
                              : Icon(
                                  Icons.person,
                                  size: 64,
                                  color: AppColors.primary.withAlpha(190),
                                ),
                        ),
                        // Camera icon overlay
                        if (_imageTapped)
                          Positioned.fill(
                            child: FadeTransition(
                              opacity: _tapAnim,
                              child: const Center(
                                child: Icon(
                                  Icons.camera_alt_rounded,
                                  color: Colors.white,
                                  size: 36,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
              // Edit badge button
              Positioned(
                bottom: 4,
                right: 4,
                child: GestureDetector(
                  onTap: () {
                    print('DEBUG: Edit Profile clicked');
                    Navigator.pushNamed(context, AppRoutes.personalInfo).then((
                      _,
                    ) {
                      if (mounted) _fetchProfile(showFullScreenLoader: false);
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                      border: Border.all(color: bgColor, width: 2),
                    ),
                    child: const Icon(
                      Icons.edit,
                      color: Colors.white,
                      size: 16,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.m),
          Text(
            profile.name,
            style: TextStyle(
              color: textPrimary,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          Text(
            profile.email,
            style: TextStyle(color: textSecondary, fontSize: 16),
          ),
          if (profile.gender != null && profile.gender!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primary.withAlpha(20),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: AppColors.primary.withAlpha(40),
                  width: 1,
                ),
              ),
              child: Text(
                profile.gender![0].toUpperCase() + profile.gender!.substring(1),
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStatsCard(ProfileModel profile) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.m),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.m),
        decoration: BoxDecoration(
          color: AppColors.primary.withAlpha(12),
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(color: AppColors.primary.withAlpha(25)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _buildStatItem(profile.totalRefills.toString(), 'Total Refills'),
            _buildDivider(),
            _buildStatItem(profile.fuelDelivered, 'Fuel Delivered'),
            _buildDivider(),
            _buildStatItem(profile.status, 'Member Status'),
          ],
        ),
      ),
    );
  }

  Widget _buildStatItem(String value, String label) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    return Column(
      children: [
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: _isStatsLoading
              ? const SizedBox(
                  key: ValueKey('loading'),
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primary,
                  ),
                )
              : Text(
                  value,
                  key: ValueKey(value),
                  style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
        ),
        Text(label, style: TextStyle(color: textSecondary, fontSize: 10)),
      ],
    );
  }

  Widget _buildDivider() {
    return Container(
      width: 1,
      height: 24,
      color: AppColors.primary.withAlpha(51),
    );
  }

  Widget _buildSectionTitle(String title) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    return Padding(
      padding: const EdgeInsets.only(left: 8.0, bottom: 12.0),
      child: Text(
        title,
        style: AppTypography.label.copyWith(
          color: textSecondary.withAlpha(153),
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  Widget _buildMenuItem(IconData icon, String label, {String? route}) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = theme.colorScheme.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.surfaceDark.withAlpha(76)
            : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppColors.primary.withAlpha(25),
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          ),
          child: Icon(icon, color: AppColors.primary, size: 20),
        ),
        title: Text(
          label,
          style: TextStyle(
            color: textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        trailing: Icon(
          Icons.chevron_right,
          color: textSecondary.withAlpha(127),
        ),
        onTap: () {
          print('DEBUG: Menu Item clicked: $label');
          if (route != null) {
            Navigator.pushNamed(context, route).then((_) {
              if (mounted) _fetchProfile(showFullScreenLoader: false);
            });
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('$label settings coming soon!')),
            );
          }
        },
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        ),
      ),
    );
  }

  Widget _buildDarkModeToggle() {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final isDark = themeProvider.isDarkMode;
    final theme = Theme.of(context);
    final textPrimary = theme.colorScheme.onSurface;

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.surfaceDark.withAlpha(76)
            : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: ListTile(
        minLeadingWidth: 36,
        leading: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isDark
                ? Colors.deepPurple.withAlpha(38)
                : Colors.amber.withAlpha(38),
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          ),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            transitionBuilder: (child, animation) => RotationTransition(
              turns: animation,
              child: FadeTransition(opacity: animation, child: child),
            ),
            child: Icon(
              isDark ? Icons.dark_mode : Icons.light_mode,
              key: ValueKey(isDark),
              color: isDark ? Colors.deepPurpleAccent : Colors.amber,
              size: 20,
            ),
          ),
        ),
        title: Text(
          'Dark Mode',
          style: TextStyle(
            color: textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        trailing: Switch.adaptive(
          value: isDark,
          onChanged: (_) => themeProvider.toggleTheme(),
          activeThumbColor: AppColors.primary,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        ),
      ),
    );
  }

  Widget _buildLogoutButton() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.red.withAlpha(25),
        borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
      ),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.red.withAlpha(25),
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          ),
          child: const Icon(Icons.logout, color: Colors.red, size: 20),
        ),
        title: const Text(
          'Logout',
          style: TextStyle(
            color: Colors.red,
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        onTap: () async {
          print('DEBUG: Logout clicked');
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove('token');
          await prefs.remove('user_role');
          await prefs.remove('user_data');
          if (mounted) {
            context.read<CustomerNotificationService>().reset();
          }
          if (mounted) {
            Navigator.pushNamedAndRemoveUntil(
              context,
              AppRoutes.login,
              (route) => false,
            );
          }
        },
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
        ),
      ),
    );
  }

  Widget _buildBottomNav() {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = theme.scaffoldBackgroundColor;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    return Container(
      padding: const EdgeInsets.only(top: 12, bottom: 24, left: 16, right: 16),
      decoration: BoxDecoration(
        color: bgColor,
        border: Border(top: BorderSide(color: borderColor.withAlpha(76))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(
            Icons.home_outlined,
            'HOME',
            false,
            route: AppRoutes.home,
          ),
          _buildNavItem(
            Icons.receipt_long,
            'ORDERS',
            false,
            route: AppRoutes.history,
          ),
          _buildNavItem(
            Icons.local_gas_station,
            'STATIONS',
            false,
            route: AppRoutes.selectStation,
          ),
          _buildNavItem(
            Icons.person,
            'PROFILE',
            true,
            route: AppRoutes.profile,
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    IconData icon,
    String label,
    bool isSelected, {
    String? route,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final activeColor = AppColors.primary;
    final inactiveColor = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondaryLight;

    return GestureDetector(
      onTap: () {
        if (route != null && !isSelected) {
          Navigator.pushNamed(context, route);
        }
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutBack,
        transform: Matrix4.translationValues(0, isSelected ? -5 : 0, 0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Circular Blue Background Container with Bounce & Soft Shadow
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutBack,
              width: isSelected ? 44 : 32,
              height: isSelected ? 44 : 32,
              decoration: BoxDecoration(
                color: isSelected ? activeColor : Colors.transparent,
                shape: BoxShape.circle,
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: activeColor.withOpacity(0.35),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : [],
              ),
              child: AnimatedScale(
                scale: isSelected ? 1.05 : 0.95,
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutBack,
                child: Icon(
                  icon,
                  color: isSelected ? Colors.white : inactiveColor,
                  size: 24,
                ),
              ),
            ),
            const SizedBox(height: 3),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutBack,
              style: TextStyle(
                color: isSelected ? activeColor : inactiveColor,
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
              ),
              child: Text(label),
            ),
          ],
        ),
      ),
    );
  }
}
