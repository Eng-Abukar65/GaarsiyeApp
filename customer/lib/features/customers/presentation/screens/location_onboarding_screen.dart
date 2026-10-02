import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';

class LocationOnboardingScreen extends StatefulWidget {
  const LocationOnboardingScreen({super.key});

  @override
  State<LocationOnboardingScreen> createState() => _LocationOnboardingScreenState();
}

class _LocationOnboardingScreenState extends State<LocationOnboardingScreen> {
  bool _isGPSSelected = true;
  bool _isFetchingGPS = false;
  double? _latitude;
  double? _longitude;

  final _formKey = GlobalKey<FormState>();
  final _labelCtrl = TextEditingController(text: 'Home');
  final _cityCtrl = TextEditingController(text: 'Mogadishu');
  final _areaCtrl = TextEditingController();
  final _addressLineCtrl = TextEditingController();

  bool _isSaving = false;

  Future<void> _handleGPSSelection() async {
    setState(() {
      _isGPSSelected = true;
      _isFetchingGPS = true;
    });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw Exception('Location services are disabled.');
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          throw Exception('Location permissions are denied.');
        }
      }

      if (permission == LocationPermission.deniedForever) {
        throw Exception('Location permissions are permanently denied.');
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 8));

      setState(() {
        _latitude = pos.latitude;
        _longitude = pos.longitude;
        _isFetchingGPS = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('GPS coordinates fetched successfully!')),
      );
    } catch (e) {
      setState(() => _isFetchingGPS = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not get GPS location: $e')),
        );
      }
    }
  }

  Future<void> _saveLocation() async {
    if (!_isGPSSelected) {
      if (!_formKey.currentState!.validate()) return;
    } else {
      if (_areaCtrl.text.trim().isEmpty || _addressLineCtrl.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please fill out Area and Street/Address Line')),
        );
        return;
      }
    }

    setState(() => _isSaving = true);

    final payload = {
      'city': _cityCtrl.text.trim(),
      'area': _areaCtrl.text.trim(),
      'address': _addressLineCtrl.text.trim(),
      'latitude': _latitude,
      'longitude': _longitude,
    };

    try {
      final response = await ApiService.post('/customer/location', payload);
      if (!mounted) return;

      if (response.statusCode == 200 || response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Location saved successfully!')),
        );
        // After onboarding location, proceed to home
        Navigator.pushNamedAndRemoveUntil(context, AppRoutes.home, (route) => false);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save address: ${response.statusCode}')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving address: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _skipOnboarding() {
    // Navigate straight to home
    Navigator.pushNamedAndRemoveUntil(context, AppRoutes.home, (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark ? AppColors.textSecondaryDark : AppColors.textSecondary;
    final cardBg = isDark ? AppColors.surfaceDark : Colors.white;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        automaticallyImplyLeading: false,
        actions: [
          TextButton(
            onPressed: _skipOnboarding,
            child: const Text(
              'Skip',
              style: TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.m),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              ShaderMask(
                shaderCallback: (bounds) => const LinearGradient(
                  colors: [AppColors.primary, Colors.orangeAccent],
                ).createShader(bounds),
                child: const Text(
                  'Delivery Location',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    letterSpacing: -0.5,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Let us know where to deliver your fuel so we can find local stations and active offers.',
                style: TextStyle(color: textSecondary, fontSize: 16),
              ),
              const SizedBox(height: AppSpacing.xl),

              // Two Selector Cards (GPS vs Manual)
              Row(
                children: [
                  Expanded(
                    child: _buildSelectionCard(
                      icon: Icons.gps_fixed,
                      title: 'Use Current Location',
                      isSelected: _isGPSSelected,
                      onTap: _handleGPSSelection,
                      isDark: isDark,
                      cardBg: cardBg,
                      borderCol: borderCol,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.m),
                  Expanded(
                    child: _buildSelectionCard(
                      icon: Icons.edit_location_alt_outlined,
                      title: 'Enter Address Manually',
                      isSelected: !_isGPSSelected,
                      onTap: () {
                        setState(() {
                          _isGPSSelected = false;
                          _latitude = null;
                          _longitude = null;
                        });
                      },
                      isDark: isDark,
                      cardBg: cardBg,
                      borderCol: borderCol,
                    ),
                  ),
                ],
              ),

              const SizedBox(height: AppSpacing.xl),

              // Form fields
              if (_isGPSSelected && _isFetchingGPS) ...[
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Column(
                      children: [
                        CircularProgressIndicator(color: AppColors.primary),
                        SizedBox(height: 16),
                        Text('Acquiring satellite signal...'),
                      ],
                    ),
                  ),
                ),
              ] else ...[
                Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_isGPSSelected && _latitude != null && _longitude != null) ...[
                        Container(
                          padding: const EdgeInsets.all(AppSpacing.m),
                          margin: const EdgeInsets.only(bottom: AppSpacing.m),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
                            border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.check_circle, color: Colors.green),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'GPS coordinates verified:\nLat: ${_latitude!.toStringAsFixed(5)}, Lng: ${_longitude!.toStringAsFixed(5)}',
                                  style: TextStyle(color: textPrimary, fontSize: 13, fontWeight: FontWeight.w500),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      
                      _buildLabelField(isDark, borderCol, textPrimary, textSecondary),
                      const SizedBox(height: AppSpacing.m),

                      Row(
                        children: [
                          Expanded(
                            child: _buildField(
                              controller: _cityCtrl,
                              label: 'City',
                              icon: Icons.location_city,
                              isDark: isDark,
                              borderCol: borderCol,
                              textPrimary: textPrimary,
                              textSecondary: textSecondary,
                              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.m),
                          Expanded(
                            child: _buildField(
                              controller: _areaCtrl,
                              label: 'Area / District',
                              icon: Icons.explore_outlined,
                              isDark: isDark,
                              borderCol: borderCol,
                              textPrimary: textPrimary,
                              textSecondary: textSecondary,
                              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.m),

                      _buildField(
                        controller: _addressLineCtrl,
                        label: 'Street / Address Line',
                        icon: Icons.home_outlined,
                        isDark: isDark,
                        borderCol: borderCol,
                        textPrimary: textPrimary,
                        textSecondary: textSecondary,
                        validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: AppSpacing.xxl),

              // Action button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                    ),
                    elevation: 2,
                  ),
                  onPressed: (_isSaving || (_isGPSSelected && _isFetchingGPS)) ? null : _saveLocation,
                  child: _isSaving
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Save and Continue',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            SizedBox(width: 8),
                            Icon(Icons.arrow_forward, size: 20),
                          ],
                        ),
                ),
              ),
              const SizedBox(height: 60),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSelectionCard({
    required IconData icon,
    required String title,
    required bool isSelected,
    required VoidCallback onTap,
    required bool isDark,
    required Color cardBg,
    required Color borderCol,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.all(AppSpacing.m),
        height: 120,
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withOpacity(0.08)
              : cardBg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(
            color: isSelected ? AppColors.primary : borderCol.withOpacity(0.3),
            width: isSelected ? 2 : 1,
          ),
          boxShadow: isSelected
              ? [BoxShadow(color: AppColors.primary.withOpacity(0.15), blurRadius: 10, offset: const Offset(0, 4))]
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              color: isSelected ? AppColors.primary : Colors.grey,
              size: 32,
            ),
            const SizedBox(height: AppSpacing.s),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: isSelected ? AppColors.primary : Colors.grey,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabelField(bool isDark, Color borderCol, Color textPrimary, Color textSecondary) {
    final labels = ['Home', 'Work', 'Other'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Address Label',
          style: TextStyle(color: textSecondary, fontSize: 13, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Row(
          children: labels.map((l) {
            final isSelected = _labelCtrl.text == l;
            return Container(
              margin: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(l),
                selected: isSelected,
                onSelected: (selected) {
                  if (selected) {
                    setState(() {
                      _labelCtrl.text = l;
                    });
                  }
                },
                selectedColor: AppColors.primary.withOpacity(0.2),
                checkmarkColor: AppColors.primary,
                labelStyle: TextStyle(
                  color: isSelected ? AppColors.primary : textPrimary,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required bool isDark,
    required Color borderCol,
    required Color textPrimary,
    required Color textSecondary,
    String? Function(String?)? validator,
  }) {
    final fillBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade100;
    return TextFormField(
      controller: controller,
      validator: validator,
      style: TextStyle(color: textPrimary, fontSize: 15),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: textSecondary),
        prefixIcon: Icon(icon, color: textSecondary, size: 20),
        filled: true,
        fillColor: fillBg,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          borderSide: BorderSide(color: borderCol),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          borderSide: BorderSide(color: borderCol),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
    );
  }
}
