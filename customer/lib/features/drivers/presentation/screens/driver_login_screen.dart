import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/driver_presence_service.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../core/theme/theme_provider.dart';

class DriverLoginScreen extends StatefulWidget {
  const DriverLoginScreen({super.key});

  @override
  State<DriverLoginScreen> createState() => _DriverLoginScreenState();
}

class _DriverLoginScreenState extends State<DriverLoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _isObscure = true;

  Future<void> _handleLogin() async {
    if (_emailController.text.isEmpty || _passwordController.text.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Please enter all fields')));
      return;
    }

    setState(() => _isLoading = true);
    try {
      final response = await ApiService.post('/driver/login', {
        'email': _emailController.text.trim(),
        'password': _passwordController.text,
      });

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('token', data['token']);
        await prefs.setString('user_role', 'driver');
        await prefs.setString('user_data', jsonEncode(data['driver']));
        await DriverPresenceService.instance.start();

        if (mounted) {
          Navigator.pushReplacementNamed(context, AppRoutes.driverDashboard);
        }
      } else {
        final data = jsonDecode(response.body);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(data['message'] ?? 'Login failed')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 60),
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                ),
                child: const Icon(
                  Icons.local_shipping,
                  color: AppColors.primary,
                  size: 32,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                'Driver Portal',
                style: TextStyle(
                  color: AppColors.textPrimaryDark,
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Log in to start your shift and manage deliveries',
                style: TextStyle(
                  color: AppColors.textSecondaryDark,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 48),
              _buildTextField(
                label: 'Email Address',
                controller: _emailController,
                hintText: 'driver@example.com',
                icon: Icons.email_outlined,
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: AppSpacing.l),
              _buildTextField(
                label: 'Password',
                controller: _passwordController,
                hintText: '••••••••',
                icon: Icons.lock_outline,
                isObscure: _isObscure,
                onIconTap: () => setState(() => _isObscure = !_isObscure),
              ),
              const SizedBox(height: AppSpacing.xl),
              CustomButton(
                text: 'Log In',
                onPressed: _isLoading ? null : _handleLogin,
                isLoading: _isLoading,
              ),
              const SizedBox(height: AppSpacing.xl),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(
                    'Back to Customer App',
                    style: TextStyle(color: AppColors.textSecondaryDark),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required String label,
    required TextEditingController controller,
    required String hintText,
    required IconData icon,
    bool isObscure = false,
    VoidCallback? onIconTap,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: AppColors.textPrimaryDark,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          obscureText: isObscure,
          keyboardType: keyboardType,
          style: TextStyle(color: AppColors.textPrimaryDark),
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: TextStyle(
              color: AppColors.textSecondaryDark.withOpacity(0.5),
            ),
            prefixIcon: Icon(icon, color: AppColors.primary, size: 20),
            suffixIcon: onIconTap != null
                ? IconButton(
                    icon: Icon(
                      isObscure ? Icons.visibility_off : Icons.visibility,
                      color: Colors.grey,
                      size: 20,
                    ),
                    onPressed: onIconTap,
                  )
                : null,
            filled: true,
            fillColor: AppColors.surfaceDark.withOpacity(0.5),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              borderSide: BorderSide(
                color: AppColors.borderDark.withOpacity(0.3),
              ),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              borderSide: BorderSide(
                color: AppColors.borderDark.withOpacity(0.3),
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              borderSide: const BorderSide(color: AppColors.primary, width: 2),
            ),
          ),
        ),
      ],
    );
  }
}
