import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/utils/api_service.dart';

class PersonalInfoScreen extends StatefulWidget {
  const PersonalInfoScreen({super.key});

  @override
  State<PersonalInfoScreen> createState() => _PersonalInfoScreenState();
}

class _PersonalInfoScreenState extends State<PersonalInfoScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();

  bool _isLoading = true;
  bool _isSaving = false;
  String? _photoUrl;
  bool _isUploadingPhoto = false;
  String? _gender;

  @override
  void initState() {
    super.initState();
    _fetchProfile();
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchProfile() async {
    try {
      final response = await ApiService.get('/customer/profile');
      if (!mounted) return;
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _firstNameCtrl.text = data['first_name'] ?? '';
        _lastNameCtrl.text = data['last_name'] ?? '';
        _emailCtrl.text = data['email'] ?? '';
        _phoneCtrl.text = data['phone'] ?? '';
        _gender = data['gender']?.toString();
        
        final rawPhotoUrl = data['photo_url'];
        if (rawPhotoUrl != null && rawPhotoUrl.isNotEmpty) {
          if (rawPhotoUrl.startsWith('/uploads')) {
            final host = ApiService.baseUrl.replaceAll('/api', '');
            _photoUrl = '$host$rawPhotoUrl';
          } else {
            _photoUrl = rawPhotoUrl;
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load profile: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _pickAndUploadImage() async {
    final picker = ImagePicker();
    try {
      final XFile? image = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );

      if (image == null) return;

      setState(() => _isUploadingPhoto = true);

      final bytes = await image.readAsBytes();
      final response = await ApiService.uploadFileBytes(
        '/customer/profile/photo',
        'photo',
        bytes,
        image.name,
      );

      if (!mounted) return;

      if (response.statusCode == 200) {
        final resData = jsonDecode(response.body);
        final rawPhotoUrl = resData['photo_url'];
        setState(() {
          if (rawPhotoUrl != null && rawPhotoUrl.isNotEmpty) {
            if (rawPhotoUrl.startsWith('/uploads')) {
              final host = ApiService.baseUrl.replaceAll('/api', '');
              _photoUrl = '$host$rawPhotoUrl';
            } else {
              _photoUrl = rawPhotoUrl;
            }
          }
        });

        // Save photo_url locally in SharedPreferences for profile header use
        final prefs = await SharedPreferences.getInstance();
        if (rawPhotoUrl != null) {
          await prefs.setString('photo_url', rawPhotoUrl);
        }

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile photo updated successfully!')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed (${response.statusCode})')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error uploading photo: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUploadingPhoto = false);
      }
    }
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) return;
    if (_gender == null || (_gender != 'male' && _gender != 'female')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select your gender')),
      );
      return;
    }
    setState(() => _isSaving = true);
    try {
      final response = await ApiService.patch('/customer/profile', {
        'first_name': _firstNameCtrl.text.trim(),
        'last_name': _lastNameCtrl.text.trim(),
        'phone': _phoneCtrl.text.trim(),
        'gender': _gender,
      });
      if (!mounted) return;
      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated successfully!')),
        );
        Navigator.pop(context);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Update failed (${response.statusCode})')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving profile: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Provider.of<ThemeProvider>(context).isDarkMode;
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Personal Info',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        actions: [
          if (!_isLoading)
            TextButton(
              onPressed: _isSaving ? null : _saveProfile,
              child: _isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.primary,
                      ),
                    )
                  : const Text(
                      'Save',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.m),
                child: Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      // Avatar
                      Center(
                        child: Stack(
                          children: [
                            GestureDetector(
                              onTap: _isUploadingPhoto ? null : _pickAndUploadImage,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  Container(
                                    width: 96,
                                    height: 96,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isDark
                                          ? AppColors.surfaceDark
                                          : Colors.grey.shade200,
                                      border: Border.all(
                                        color: AppColors.primary.withOpacity(0.3),
                                        width: 3,
                                      ),
                                      image: _photoUrl != null
                                          ? DecorationImage(
                                              image: NetworkImage(_photoUrl!),
                                              fit: BoxFit.cover,
                                            )
                                          : null,
                                    ),
                                    child: _photoUrl == null && !_isUploadingPhoto
                                        ? const Icon(
                                            Icons.person,
                                            size: 48,
                                            color: AppColors.primary,
                                          )
                                        : (_isUploadingPhoto
                                            ? const Center(
                                                child: CircularProgressIndicator(
                                                  color: AppColors.primary,
                                                ),
                                              )
                                            : null),
                                  ),
                                  if (_photoUrl != null && !_isUploadingPhoto)
                                    Container(
                                      width: 96,
                                      height: 96,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: Colors.black.withOpacity(0.35),
                                      ),
                                      child: const Icon(
                                        Icons.camera_alt,
                                        color: Colors.white,
                                        size: 24,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Positioned(
                              bottom: 0,
                              right: 0,
                              child: GestureDetector(
                                onTap: _isUploadingPhoto ? null : _pickAndUploadImage,
                                child: Container(
                                  padding: const EdgeInsets.all(6),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary,
                                    shape: BoxShape.circle,
                                    border: Border.all(color: bgColor, width: 2),
                                  ),
                                  child: const Icon(
                                    Icons.camera_alt,
                                    color: Colors.white,
                                    size: 14,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xl),

                      // First Name
                      _buildField(
                        controller: _firstNameCtrl,
                        label: 'First Name',
                        icon: Icons.person_outline,
                        isDark: isDark,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: AppSpacing.m),

                      // Last Name
                      _buildField(
                        controller: _lastNameCtrl,
                        label: 'Last Name',
                        icon: Icons.person_outline,
                        isDark: isDark,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: AppSpacing.m),

                      // Email (read-only)
                      _buildField(
                        controller: _emailCtrl,
                        label: 'Email Address',
                        icon: Icons.email_outlined,
                        isDark: isDark,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                        readOnly: true,
                        helperText: 'Email cannot be changed',
                      ),
                      const SizedBox(height: AppSpacing.m),

                      // Phone
                      _buildField(
                        controller: _phoneCtrl,
                        label: 'Phone Number',
                        icon: Icons.phone_outlined,
                        keyboardType: TextInputType.phone,
                        isDark: isDark,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                      ),
                      const SizedBox(height: AppSpacing.l),

                      // Gender Selection
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Gender',
                            style: TextStyle(
                              color: textPrimary,
                              fontWeight: FontWeight.w500,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: _buildGenderCard(
                                  label: 'Male',
                                  value: 'male',
                                  icon: Icons.male,
                                  isSelected: _gender == 'male',
                                  theme: theme,
                                  cs: cs,
                                  isDark: isDark,
                                  textPrimary: textPrimary,
                                ),
                              ),
                              const SizedBox(width: AppSpacing.m),
                              Expanded(
                                child: _buildGenderCard(
                                  label: 'Female',
                                  value: 'female',
                                  icon: Icons.female,
                                  isSelected: _gender == 'female',
                                  theme: theme,
                                  cs: cs,
                                  isDark: isDark,
                                  textPrimary: textPrimary,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),

                      const SizedBox(height: AppSpacing.xl),

                      // Save Button
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _isSaving ? null : _saveProfile,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                            ),
                          ),
                          child: _isSaving
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'Save Changes',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 80),
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required bool isDark,
    required Color textPrimary,
    required Color textSecondary,
    bool readOnly = false,
    TextInputType? keyboardType,
    String? helperText,
    String? Function(String?)? validator,
  }) {
    final fillColor = isDark
        ? AppColors.surfaceDark.withOpacity(0.5)
        : Colors.grey.shade100;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    return TextFormField(
      controller: controller,
      readOnly: readOnly,
      keyboardType: keyboardType,
      validator: validator,
      style: TextStyle(color: textPrimary, fontSize: 15),
      decoration: InputDecoration(
        labelText: label,
        helperText: helperText,
        labelStyle: TextStyle(color: textSecondary),
        helperStyle: TextStyle(color: textSecondary.withOpacity(0.6), fontSize: 11),
        prefixIcon: Icon(icon, color: textSecondary, size: 20),
        suffixIcon: readOnly
            ? Icon(Icons.lock_outline, color: textSecondary.withOpacity(0.4), size: 18)
            : null,
        filled: true,
        fillColor: readOnly ? fillColor.withOpacity(0.5) : fillColor,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          borderSide: BorderSide(color: borderColor),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          borderSide: BorderSide(color: borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
    );
  }

  Widget _buildGenderCard({
    required String label,
    required String value,
    required IconData icon,
    required bool isSelected,
    required ThemeData theme,
    required ColorScheme cs,
    required bool isDark,
    required Color textPrimary,
  }) {
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final fillBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade100;
    final activeBorderColor = AppColors.primary;
    final inactiveBorderColor = borderCol.withAlpha(76);

    return GestureDetector(
      onTap: () {
        setState(() {
          _gender = value;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: isSelected 
              ? (isDark ? AppColors.primary.withAlpha(30) : AppColors.primary.withAlpha(15))
              : fillBg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusL),
          border: Border.all(
            color: isSelected ? activeBorderColor : inactiveBorderColor,
            width: isSelected ? 1.8 : 1.0,
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon,
              color: isSelected ? AppColors.primary : cs.onSurface.withAlpha(150),
              size: 20,
            ),
            const SizedBox(width: 12),
            Text(
              label,
              style: TextStyle(
                color: textPrimary,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                fontSize: 15,
              ),
            ),
            const Spacer(),
            Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? AppColors.primary : cs.onSurface.withAlpha(80),
                  width: 2,
                ),
              ),
              child: isSelected
                  ? Center(
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primary,
                        ),
                      ),
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}
