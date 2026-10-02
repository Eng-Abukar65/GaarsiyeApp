import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../shared/widgets/custom_text_field.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../core/routes/app_routes.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  bool _isPasswordVisible = false;
  bool _isLoading = false;
  String _selectedCountryCode = '+252';
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _nameTouched = false;
  bool _emailTouched = false;
  bool _phoneTouched = false;
  bool _passwordTouched = false;

  String? _nameError;
  String? _emailError;
  String? _phoneError;
  String? _passwordError;
  String? _genderError;

  bool _isNameValid = false;
  bool _isEmailValid = false;
  bool _isPhoneValid = false;
  bool _isPasswordValid = false;
  bool _isGenderValid = false;

  String? _selectedGender;
  bool _genderTouched = false;

  double? _latitude;
  double? _longitude;
  final TextEditingController _cityController = TextEditingController();
  final TextEditingController _areaController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();
  bool _gpsLoading = false;
  bool _showManualFields = false;
  bool _hasGpsLocation = false;
  String _detectedCity = '';
  String _detectedArea = '';
  String _detectedAddress = '';
  bool _locationTouched = false;
  String? _locationError;
  bool _isLocationValid = false;

  void _validateLocation() {
    final city = _cityController.text.trim();
    final area = _areaController.text.trim();
    final address = _addressController.text.trim();

    if (!_locationTouched && city.isEmpty && area.isEmpty && address.isEmpty) {
      setState(() {
        _locationError = null;
        _isLocationValid = false;
      });
      return;
    }

    if (city.isEmpty || area.isEmpty || address.isEmpty) {
      setState(() {
        _locationError = "Please select your delivery location";
        _isLocationValid = false;
      });
    } else {
      setState(() {
        _locationError = null;
        _isLocationValid = true;
      });
    }
  }

  Future<void> _getCurrentLocation() async {
    setState(() {
      _gpsLoading = true;
      _locationTouched = true;
      _locationError = null;
    });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw Exception("GPS is disabled on your device.");
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          throw Exception("Location permission was denied.");
        }
      }

      if (permission == LocationPermission.deniedForever) {
        throw Exception("Location permissions are permanently denied.");
      }

      Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );

      _latitude = position.latitude;
      _longitude = position.longitude;

      // Reverse geocode via Nominatim
      final url = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse?format=json&lat=$_latitude&lon=$_longitude&zoom=18&addressdetails=1',
      );
      final response = await http.get(url, headers: {
        'User-Agent': 'deliveryapp/1.0.0',
      }).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final addressData = data['address'] ?? {};
        final city = addressData['city'] ?? addressData['town'] ?? addressData['village'] ?? addressData['county'] ?? 'Mogadishu';
        final area = addressData['suburb'] ?? addressData['neighbourhood'] ?? addressData['quarter'] ?? 'Hodan';
        final road = addressData['road'] ?? addressData['pedestrian'] ?? addressData['highway'] ?? 'Main Street';

        setState(() {
          _detectedCity = city.toString();
          _detectedArea = area.toString();
          _detectedAddress = road.toString();
          
          _cityController.text = _detectedCity;
          _areaController.text = _detectedArea;
          _addressController.text = _detectedAddress;
          
          _hasGpsLocation = true;
          _showManualFields = false;
        });
      } else {
        throw Exception("No internet or geocoding service error.");
      }
    } catch (e) {
      print('GPS Error: $e');
      String errMsg = e.toString().replaceAll('Exception: ', '');
      if (errMsg.contains('TimeoutException')) {
        errMsg = "Request timed out. Please check your internet connection.";
      }
      setState(() {
        _showManualFields = true;
        _locationError = "GPS error: $errMsg. Please enter address manually.";
      });
    } finally {
      setState(() {
        _gpsLoading = false;
      });
      _validateLocation();
    }
  }

  @override
  void dispose() {
    _cityController.dispose();
    _areaController.dispose();
    _addressController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _validateName() {
    final val = _nameController.text;
    if (!_nameTouched && val.isEmpty) {
      setState(() {
        _nameError = null;
        _isNameValid = false;
      });
      return;
    }
    if (val.trim().isEmpty || val.trim().length < 3 || !RegExp(r'^[a-zA-Z\s]+$').hasMatch(val)) {
      setState(() {
        _nameError = "Please enter a valid full name";
        _isNameValid = false;
      });
    } else {
      setState(() {
        _nameError = null;
        _isNameValid = true;
      });
    }
  }

  void _validateEmail() {
    final val = _emailController.text;
    if (!_emailTouched && val.isEmpty) {
      setState(() {
        _emailError = null;
        _isEmailValid = false;
      });
      return;
    }
    final emailRegex = RegExp(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$');
    if (val.isEmpty || !emailRegex.hasMatch(val)) {
      setState(() {
        _emailError = "Please enter a valid email address";
        _isEmailValid = false;
      });
    } else {
      setState(() {
        _emailError = null;
        _isEmailValid = true;
      });
    }
  }

  void _validatePhone() {
    final val = _phoneController.text;
    if (!_phoneTouched && val.isEmpty) {
      setState(() {
        _phoneError = null;
        _isPhoneValid = false;
      });
      return;
    }
    final clean = val.replaceAll(RegExp(r'\D'), '');
    final prefixDigits = _selectedCountryCode.replaceAll('+', '');
    final fullPhone = clean.startsWith(prefixDigits) ? clean : '$prefixDigits$clean';
    
    bool isValid = false;
    if (_selectedCountryCode == '+252') {
      isValid = RegExp(r'^25261\d{7}$').hasMatch(fullPhone);
    } else {
      isValid = fullPhone.length >= 9 && fullPhone.length <= 15;
    }

    if (val.isEmpty || !isValid) {
      setState(() {
        _phoneError = "Please enter a valid phone number";
        _isPhoneValid = false;
      });
    } else {
      setState(() {
        _phoneError = null;
        _isPhoneValid = true;
      });
    }
  }

  void _validatePassword() {
    final val = _passwordController.text;
    if (!_passwordTouched && val.isEmpty) {
      setState(() {
        _passwordError = null;
        _isPasswordValid = false;
      });
      return;
    }
    final hasUppercase = RegExp(r'[A-Z]').hasMatch(val);
    final hasLowercase = RegExp(r'[a-z]').hasMatch(val);
    final hasNumber = RegExp(r'[0-9]').hasMatch(val);
    if (val.length < 8 || !hasUppercase || !hasLowercase || !hasNumber) {
      setState(() {
        _passwordError = "Password must be at least 8 characters and contain uppercase, lowercase, and a number";
        _isPasswordValid = false;
      });
    } else {
      setState(() {
        _passwordError = null;
        _isPasswordValid = true;
      });
    }
  }

  void _validateGender() {
    if (!_genderTouched && _selectedGender == null) {
      setState(() {
        _genderError = null;
        _isGenderValid = false;
      });
      return;
    }
    if (_selectedGender == null) {
      setState(() {
        _genderError = "Please select your gender";
        _isGenderValid = false;
      });
    } else {
      setState(() {
        _genderError = null;
        _isGenderValid = true;
      });
    }
  }

  int _calculatePasswordStrength(String val) {
    if (val.isEmpty) return 0;
    int strength = 0;
    if (val.length >= 8) strength++;
    if (RegExp(r'[A-Z]').hasMatch(val)) strength++;
    if (RegExp(r'[a-z]').hasMatch(val)) strength++;
    if (RegExp(r'[0-9]').hasMatch(val)) strength++;
    return strength;
  }

  bool _isFormValid() {
    return _isNameValid && _isEmailValid && _isPhoneValid && _isPasswordValid && _isGenderValid && _isLocationValid;
  }

  Future<void> _handleSignUp() async {
    setState(() {
      _nameTouched = true;
      _emailTouched = true;
      _phoneTouched = true;
      _passwordTouched = true;
      _genderTouched = true;
      _locationTouched = true;
    });
    _validateName();
    _validateEmail();
    _validatePhone();
    _validatePassword();
    _validateGender();
    _validateLocation();

    if (!_isFormValid() || _isLoading) return;

    print('DEBUG: SignUp button clicked for: ${_nameController.text}');
    setState(() => _isLoading = true);
    try {
      final cleanPhone = _phoneController.text.replaceAll(RegExp(r'\D'), '');
      final prefixDigits = _selectedCountryCode.replaceAll('+', '');
      final fullPhone = cleanPhone.startsWith(prefixDigits) ? cleanPhone : '$prefixDigits$cleanPhone';

      final response = await ApiService.post('/customer/register', {
        'name': _nameController.text.trim(),
        'email': _emailController.text.trim(),
        'phone': fullPhone,
        'password': _passwordController.text,
        'gender': _selectedGender,
        'latitude': _latitude,
        'longitude': _longitude,
        'city': _cityController.text.trim(),
        'area': _areaController.text.trim(),
        'address': _addressController.text.trim(),
      });

      print('DEBUG: API Response Status: ${response.statusCode}');
      print('DEBUG: API Response Body: ${response.body}');

      final data = jsonDecode(response.body);
      if (response.statusCode == 200 || response.statusCode == 201) {
        // Auto-login after successful register
        print('DEBUG: Auto-logging in user: ${_emailController.text.trim()}');
        final loginResponse = await ApiService.post('/auth/login', {
          'email': _emailController.text.trim(),
          'password': _passwordController.text,
        });

        if (loginResponse.statusCode == 200) {
          final loginData = jsonDecode(loginResponse.body);
          if (loginData['success'] == true) {
            final prefs = await SharedPreferences.getInstance();
            final user = Map<String, dynamic>.from(loginData['user'] as Map);
            final role = user['role']?.toString() ?? '';

            await prefs.setString('token', loginData['token'].toString());
            await prefs.setString('user_role', role);
            await prefs.setString('user_data', jsonEncode(user));

            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Registration & auto-login successful!')),
              );
              Navigator.pushReplacementNamed(context, AppRoutes.locationOnboarding);
            }
            return;
          }
        }

        // If auto-login fails, fall back to standard login screen route pop
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Registration successful! Please login.')),
          );
          Navigator.pop(context);
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(data['message'] ?? 'Registration failed. Please try again.')),
          );
        }
      }
    } catch (e) {
      print('DEBUG: SignUp Error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Connection error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Widget _buildPasswordStrengthIndicator() {
    final val = _passwordController.text;
    if (val.isEmpty) return const SizedBox.shrink();

    final strength = _calculatePasswordStrength(val);
    Color color;
    String text;
    int activeSegments;

    if (strength <= 1) {
      color = Colors.red;
      text = 'Weak';
      activeSegments = 1;
    } else if (strength < 4) {
      color = Colors.orange;
      text = 'Medium';
      activeSegments = 2;
    } else {
      color = Colors.green;
      text = 'Strong';
      activeSegments = 3;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        Row(
          children: [
            Text(
              'Password Strength: ',
              style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withAlpha(153)),
            ),
            Text(
              text,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: List.generate(3, (index) {
            final isActive = index < activeSegments;
            return Expanded(
              child: Container(
                height: 4,
                margin: EdgeInsets.only(
                  right: index < 2 ? 4 : 0,
                ),
                decoration: BoxDecoration(
                  color: isActive ? color : Colors.grey.withAlpha(50),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.all(AppSpacing.l),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: Icon(Icons.arrow_back, color: cs.onSurface),
                style: IconButton.styleFrom(
                  backgroundColor: cs.surface,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                'Join SwiftFuel',
                style: TextStyle(color: cs.onSurface, fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: -0.5),
              ),
              const SizedBox(height: 8),
              Text(
                'Sign up to get fuel delivered to your location instantly.',
                style: TextStyle(color: cs.onSurface.withAlpha(153), fontSize: 16),
              ),
              const SizedBox(height: AppSpacing.xxl),
              
              CustomTextField(
                controller: _nameController,
                label: 'Full Name',
                hintText: 'John Doe', 
                icon: Icons.person_outline,
                errorText: _nameTouched ? _nameError : null,
                isValid: _nameTouched ? _isNameValid : null,
                onChanged: (val) {
                  setState(() => _nameTouched = true);
                  _validateName();
                },
              ),
              const SizedBox(height: AppSpacing.l),

              // Gender Selection
              Text(
                'Select Gender',
                style: TextStyle(
                  color: cs.onSurface,
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
                      isSelected: _selectedGender == 'male',
                      theme: theme,
                      cs: cs,
                      isDark: theme.brightness == Brightness.dark,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.m),
                  Expanded(
                    child: _buildGenderCard(
                      label: 'Female',
                      value: 'female',
                      icon: Icons.female,
                      isSelected: _selectedGender == 'female',
                      theme: theme,
                      cs: cs,
                      isDark: theme.brightness == Brightness.dark,
                    ),
                  ),
                ],
              ),
              if (_genderTouched && _genderError != null) ...[
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Text(
                    _genderError!,
                    style: const TextStyle(color: Colors.red, fontSize: 12),
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.l),
              
              CustomTextField(
                controller: _emailController,
                label: 'Email Address',
                hintText: 'example@email.com', 
                icon: Icons.email_outlined, 
                keyboardType: TextInputType.emailAddress,
                errorText: _emailTouched ? _emailError : null,
                isValid: _emailTouched ? _isEmailValid : null,
                onChanged: (val) {
                  setState(() => _emailTouched = true);
                  _validateEmail();
                },
              ),
              const SizedBox(height: AppSpacing.l),
              
              Text('Phone Number', style: TextStyle(color: cs.onSurface, fontWeight: FontWeight.w500)),
              const SizedBox(height: 8),
              _buildPhoneField(),
              const SizedBox(height: AppSpacing.l),
              
              _buildLocationSection(theme, cs),
              const SizedBox(height: AppSpacing.l),
              
              CustomTextField(
                controller: _passwordController,
                label: 'Password',
                hintText: '••••••••', 
                icon: Icons.lock_outline, 
                isPassword: !_isPasswordVisible,
                errorText: _passwordTouched ? _passwordError : null,
                isValid: _passwordTouched ? _isPasswordValid : null,
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _isPasswordVisible = !_isPasswordVisible),
                  icon: Icon(_isPasswordVisible ? Icons.visibility : Icons.visibility_off, color: Colors.grey, size: 20),
                ),
                onChanged: (val) {
                  setState(() => _passwordTouched = true);
                  _validatePassword();
                },
              ),
              _buildPasswordStrengthIndicator(),
              const SizedBox(height: AppSpacing.l),
              
              // Terms
              RichText(
                text: TextSpan(
                  style: TextStyle(color: AppColors.textSecondaryDark, fontSize: 12, height: 1.5),
                  children: const [
                    TextSpan(text: 'By signing up, you agree to our '),
                    TextSpan(text: 'Terms of Service', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
                    TextSpan(text: ' and '),
                    TextSpan(text: 'Privacy Policy', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
                    TextSpan(text: '.'),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              
              // Submit
              CustomButton(
                text: _isLoading ? 'Signing Up...' : 'Sign Up',
                onPressed: (_isLoading || !_isFormValid()) ? null : () { _handleSignUp(); },
                icon: _isLoading 
                  ? const SizedBox(
                      width: 20, 
                      height: 20, 
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : const Icon(Icons.arrow_forward, color: Colors.white),
              ),
              const SizedBox(height: AppSpacing.xl),
              
              // Login Link
              Center(
                child: GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: RichText(
                    text: const TextSpan(
                      style: TextStyle(color: AppColors.textSecondaryDark, fontSize: 14),
                      children: [
                        TextSpan(text: 'Already have an account? '),
                        TextSpan(
                          text: 'Login', 
                          style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 100),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPhoneField() {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final fillBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade100;

    final Color currentBorderColor;
    if (_phoneTouched && _phoneError != null) {
      currentBorderColor = Colors.red;
    } else if (_phoneTouched && _isPhoneValid) {
      currentBorderColor = Colors.green;
    } else {
      currentBorderColor = borderCol.withAlpha(76);
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: fillBg,
            borderRadius: BorderRadius.circular(AppSpacing.radiusL),
            border: Border.all(color: currentBorderColor, width: _phoneTouched ? 1.5 : 1.0),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _selectedCountryCode,
              dropdownColor: isDark ? AppColors.surfaceDark : Colors.white,
              style: TextStyle(color: cs.onSurface, fontWeight: FontWeight.bold, fontSize: 15),
              icon: Icon(Icons.arrow_drop_down, color: cs.onSurface.withAlpha(150)),
              onChanged: (String? newValue) {
                if (newValue != null) {
                  setState(() {
                    _selectedCountryCode = newValue;
                  });
                  _validatePhone();
                }
              },
              items: <String>['+252', '+1', '+254', '+966']
                  .map<DropdownMenuItem<String>>((String value) {
                return DropdownMenuItem<String>(
                  value: value,
                  child: Text(value),
                );
              }).toList(),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: CustomTextField(
            controller: _phoneController,
            label: '',
            hintText: _selectedCountryCode == '+252' 
                ? '61 000-0000' 
                : (_selectedCountryCode == '+1' ? '(555) 000-0000' : 'Phone number'),
            icon: Icons.phone_outlined, 
            keyboardType: TextInputType.phone,
            errorText: _phoneTouched ? _phoneError : null,
            isValid: _phoneTouched ? _isPhoneValid : null,
            onChanged: (val) {
              setState(() => _phoneTouched = true);
              _validatePhone();
            },
          ),
        ),
      ],
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
  }) {
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;
    final fillBg = isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.grey.shade100;
    final activeBorderColor = AppColors.primary;
    final inactiveBorderColor = borderCol.withAlpha(76);

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedGender = value;
          _genderTouched = true;
        });
        _validateGender();
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
                color: cs.onSurface,
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

  Widget _buildLocationSection(ThemeData theme, ColorScheme cs) {
    final isDark = theme.brightness == Brightness.dark;
    final borderCol = isDark ? AppColors.borderDark : AppColors.border;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              '📍 Delivery Location',
              style: TextStyle(
                color: cs.onSurface,
                fontWeight: FontWeight.w500,
                fontSize: 16,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        
        // Use My Current Location Button
        SizedBox(
          width: double.infinity,
          height: 56,
          child: OutlinedButton(
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AppColors.primary, width: 1.5),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              ),
              backgroundColor: isDark ? Colors.transparent : Colors.white,
            ),
            onPressed: _gpsLoading ? null : _getCurrentLocation,
            child: _gpsLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.0,
                      valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
                    ),
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.my_location, color: AppColors.primary, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'Use My Current Location',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: 15,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
        
        if (_hasGpsLocation && !_showManualFields) ...[
          const SizedBox(height: AppSpacing.m),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.m),
            decoration: BoxDecoration(
              color: isDark ? AppColors.surfaceDark.withAlpha(77) : Colors.white,
              borderRadius: BorderRadius.circular(AppSpacing.radiusL),
              border: Border.all(color: Colors.green.withAlpha(100), width: 1.5),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Location detected:',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                        fontSize: 14,
                      ),
                    ),
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          _showManualFields = true;
                        });
                      },
                      child: const Text(
                        'Edit Manually',
                        style: TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('City: $_detectedCity', style: TextStyle(color: cs.onSurface)),
                const SizedBox(height: 4),
                Text('Area: $_detectedArea', style: TextStyle(color: cs.onSurface)),
                const SizedBox(height: 4),
                Text('Address: $_detectedAddress', style: TextStyle(color: cs.onSurface)),
              ],
            ),
          ),
        ],

        if (!_hasGpsLocation && !_showManualFields) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _showManualFields = true;
                });
              },
              child: const Text(
                'Enter location manually',
                style: TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w500,
                  fontSize: 13,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
        ],

        if (_showManualFields) ...[
          const SizedBox(height: AppSpacing.m),
          CustomTextField(
            controller: _cityController,
            label: 'City',
            hintText: 'e.g. Mogadishu',
            icon: Icons.location_city,
            errorText: _locationTouched && _cityController.text.trim().isEmpty ? 'City is required' : null,
            onChanged: (val) {
              _validateLocation();
            },
          ),
          const SizedBox(height: AppSpacing.m),
          CustomTextField(
            controller: _areaController,
            label: 'Area',
            hintText: 'e.g. Hodan',
            icon: Icons.map,
            errorText: _locationTouched && _areaController.text.trim().isEmpty ? 'Area is required' : null,
            onChanged: (val) {
              _validateLocation();
            },
          ),
          const SizedBox(height: AppSpacing.m),
          CustomTextField(
            controller: _addressController,
            label: 'Street Address',
            hintText: 'e.g. Main Street',
            icon: Icons.home,
            errorText: _locationTouched && _addressController.text.trim().isEmpty ? 'Street address is required' : null,
            onChanged: (val) {
              _validateLocation();
            },
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _showManualFields = false;
                  // If we have GPS location, restore it
                  if (_hasGpsLocation) {
                    _cityController.text = _detectedCity;
                    _areaController.text = _detectedArea;
                    _addressController.text = _detectedAddress;
                  } else {
                    _cityController.clear();
                    _areaController.clear();
                    _addressController.clear();
                  }
                  _validateLocation();
                });
              },
              child: Text(
                _hasGpsLocation ? 'Cancel Edit' : 'Use GPS Instead',
                style: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w500,
                  fontSize: 13,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
        ],

        if (_locationTouched && _locationError != null) ...[
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              _locationError!,
              style: const TextStyle(color: Colors.red, fontSize: 12),
            ),
          ),
        ],
      ],
    );
  }
}
