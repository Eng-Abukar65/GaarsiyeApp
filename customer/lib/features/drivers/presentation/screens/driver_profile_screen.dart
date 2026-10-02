import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/driver_presence_service.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/theme/theme_provider.dart';
import '../widgets/driver_bottom_nav.dart';

class DriverProfileScreen extends StatefulWidget {
  const DriverProfileScreen({super.key});

  @override
  State<DriverProfileScreen> createState() => _DriverProfileScreenState();
}

class _DriverProfileScreenState extends State<DriverProfileScreen> {
  dynamic _driver;
  bool _isLoading = true;
  bool _isUploading = false;
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _fetchProfile();
  }

  Future<void> _fetchProfile() async {
    setState(() => _isLoading = true);
    try {
      final response = await ApiService.get('/driver/profile');
      if (response.statusCode == 200) {
        setState(() {
          _driver = jsonDecode(response.body);
        });
      }
    } catch (e) {
      print('Error fetching profile: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );

      if (image != null) {
        final bytes = await image.readAsBytes();
        await _uploadProfileImage(bytes, image.name);
      }
    } catch (e) {
      print('Error picking image: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Failed to pick image',
            style: TextStyle(color: Colors.white),
          ),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  Future<void> _uploadProfileImage(List<int> bytes, String filename) async {
    setState(() => _isUploading = true);
    try {
      final response = await ApiService.uploadFileBytes(
        '/driver/upload-profile-image',
        'image',
        bytes,
        filename,
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          _driver['profile_image'] = data['profile_image'];
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Profile picture updated!',
              style: TextStyle(color: Colors.white),
            ),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        throw Exception('Upload failed');
      }
    } catch (e) {
      print('Upload error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Failed to upload image',
            style: TextStyle(color: Colors.white),
          ),
          backgroundColor: Colors.redAccent,
        ),
      );
    } finally {
      setState(() => _isUploading = false);
    }
  }

  void _showImagePickerOptions() {
    final isDark = Provider.of<ThemeProvider>(
      context,
      listen: false,
    ).isDarkMode;
    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(
                Icons.photo_library,
                color: AppColors.primary,
              ),
              title: Text(
                'Choose from Gallery',
                style: TextStyle(
                  color: isDark ? Colors.white : AppColors.textMainLight,
                ),
              ),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt, color: AppColors.primary),
              title: Text(
                'Take a Photo',
                style: TextStyle(
                  color: isDark ? Colors.white : AppColors.textMainLight,
                ),
              ),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.camera);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _logout() async {
    await DriverPresenceService.instance.stop(markOffline: true);
    try {
      await ApiService.post('/auth/logout', {});
    } catch (e) {
      print('Logout API error: $e');
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('user_role');
    await prefs.remove('user_data');
    if (mounted) {
      Navigator.pushNamedAndRemoveUntil(
        context,
        AppRoutes.login,
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final isDark = themeProvider.isDarkMode;

    return Scaffold(
      backgroundColor: isDark
          ? AppColors.backgroundDark
          : AppColors.backgroundLight,
      extendBodyBehindAppBar: false,
      appBar: AppBar(
        backgroundColor: isDark
            ? AppColors.backgroundDark
            : AppColors.backgroundLight,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: Icon(
            Icons.arrow_back,
            color: isDark ? Colors.white : AppColors.textMainLight,
          ),
        ),
        title: Text(
          'My Profile',
          style: TextStyle(
            color: isDark ? Colors.white : AppColors.textMainLight,
            fontWeight: FontWeight.bold,
          ),
        ),
        centerTitle: true,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: EdgeInsets.only(
                top: 20,
                left: AppSpacing.l,
                right: AppSpacing.l,
                bottom: AppSpacing.xxl + 88,
              ),
              child: Column(
                children: [
                  _buildProfileHeader(isDark),
                  const SizedBox(height: 32),
                  _buildProfileSection('ACCOUNT DETAILS', [
                    _buildProfileItem(
                      Icons.email_outlined,
                      'Email',
                      (_driver['email'] ?? 'N/A').toString(),
                      isDark,
                    ),
                    _buildProfileItem(
                      Icons.phone_outlined,
                      'Phone',
                      (_driver['phone'] ?? 'N/A').toString(),
                      isDark,
                    ),
                    _buildProfileItem(
                      Icons.verified_user_outlined,
                      'Status',
                      (_driver['verification_status'] ?? 'PENDING')
                          .toString()
                          .toUpperCase(),
                      isDark,
                      isStatus: true,
                    ),
                  ], isDark),
                  const SizedBox(height: 24),
                  _buildProfileSection('VEHICLE INFO', [
                    _buildProfileItem(
                      Icons.directions_car_outlined,
                      'Vehicle Type',
                      (_driver['vehicle_type'] ?? 'N/A').toString(),
                      isDark,
                    ),
                    _buildProfileItem(
                      Icons.badge_outlined,
                      'License Plate',
                      (_driver['license_number'] ?? 'N/A').toString(),
                      isDark,
                    ),
                  ], isDark),
                  const SizedBox(height: 24),
                  _buildProfileSection('APP SETTINGS', [
                    _buildDarkModeToggle(isDark, themeProvider),
                  ], isDark),
                  const SizedBox(height: 40),
                  _buildLogoutButton(),
                ],
              ),
            ),
      bottomNavigationBar: const DriverBottomNav(
        currentTab: DriverNavTab.profile,
      ),
    );
  }

  Widget _buildProfileHeader(bool isDark) {
    final firstName = (_driver['first_name'] ?? '').toString();
    final lastName = (_driver['last_name'] ?? '').toString();
    final username = (_driver['username'] ?? 'Unknown').toString();
    final fullName = '$firstName $lastName'.trim();
    final driverName = fullName.isEmpty ? username : fullName;
    final driverId = (_driver['id'] ?? '').toString();
    final profileImage = _driver['profile_image'];

    return Column(
      children: [
        Stack(
          alignment: Alignment.bottomRight,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppColors.primary.withOpacity(0.5),
                  width: 3,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.2),
                    blurRadius: 20,
                    spreadRadius: 5,
                  ),
                ],
              ),
              child: ClipOval(
                child: _isUploading
                    ? const Center(child: CircularProgressIndicator())
                    : (profileImage != null &&
                          profileImage.toString().isNotEmpty)
                    ? Image.network(
                        '${ApiService.baseUrl.replaceAll('/api', '')}$profileImage',
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) =>
                            const Icon(
                              Icons.person,
                              size: 60,
                              color: Colors.white54,
                            ),
                      )
                    : Container(
                        color: isDark
                            ? AppColors.surfaceDark
                            : Colors.grey.shade200,
                        child: Icon(
                          Icons.person,
                          size: 60,
                          color: isDark ? Colors.white54 : Colors.grey.shade400,
                        ),
                      ),
              ),
            ),
            GestureDetector(
              onTap: _showImagePickerOptions,
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.camera_alt,
                  color: Colors.white,
                  size: 20,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text(
          driverName,
          style: TextStyle(
            color: isDark ? Colors.white : AppColors.textMainLight,
            fontSize: 28,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: isDark
                ? Colors.white.withOpacity(0.1)
                : Colors.black.withOpacity(0.05),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            'Driver ID: #$driverId',
            style: TextStyle(
              color: isDark ? Colors.white70 : AppColors.textSecondaryLight,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildProfileSection(
    String title,
    List<Widget> children,
    bool isDark,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 8, bottom: 12),
          child: Text(
            title,
            style: TextStyle(
              color: isDark ? Colors.white54 : AppColors.textSecondaryLight,
              fontSize: 12,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: AppTheme.glassBoxDecoration(isDark: isDark),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _buildProfileItem(
    IconData icon,
    String label,
    String value,
    bool isDark, {
    bool isStatus = false,
  }) {
    final statusColor = value == 'VERIFIED'
        ? Colors.greenAccent
        : Colors.orangeAccent;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: AppColors.primary, size: 22),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: isDark
                        ? Colors.white54
                        : AppColors.textSecondaryLight,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                if (isStatus)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      value,
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  )
                else
                  Text(
                    value,
                    style: TextStyle(
                      color: isDark ? Colors.white : AppColors.textMainLight,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDarkModeToggle(bool isDark, ThemeProvider themeProvider) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        minLeadingWidth: 36,
        leading: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isDark
                ? Colors.deepPurple.withOpacity(0.15)
                : Colors.amber.withOpacity(0.15),
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
            color: isDark ? Colors.white : AppColors.textMainLight,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        trailing: Switch.adaptive(
          value: isDark,
          onChanged: (_) => themeProvider.toggleTheme(),
          activeThumbColor: AppColors.primary,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
    );
  }

  Widget _buildLogoutButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: _logout,
        icon: const Icon(Icons.logout, color: Colors.white),
        label: const Text(
          'Log Out',
          style: TextStyle(
            color: Colors.white,
            fontSize: 16,
            fontWeight: FontWeight.bold,
            letterSpacing: 1,
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.redAccent,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          elevation: 5,
          shadowColor: Colors.redAccent.withOpacity(0.5),
        ),
      ),
    );
  }
}
