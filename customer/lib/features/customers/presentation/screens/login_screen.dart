import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_typography.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../../../../shared/widgets/custom_text_field.dart';
import '../../../../shared/widgets/gaarsis_logo.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/google_auth_service.dart';
import '../../../../core/services/google_identity_button.dart';
import '../../../../core/services/driver_presence_service.dart';
import '../../../../core/utils/api_service.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:developer' as logging;

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with TickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _logoSlideAnimation;
  late Animation<Offset> _textSlideAnimation;
  late Animation<Offset> _formSlideAnimation;
  late Animation<Offset> _buttonSlideAnimation;
  late Animation<double> _logoScaleAnimation;

  bool _obscurePassword = true;
  bool _isLoading = false;
  bool _isGoogleLoading = false;
  bool _isGoogleReady = false;
  String? _googleError;
  String? _googleClientId;
  StreamSubscription<GoogleSignInAuthenticationEvent>? _googleAuthSubscription;
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _setupAnimations();
    unawaited(_initializeGoogleSignIn());
  }

  void _setupAnimations() {
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );

    _fadeAnimation = CurvedAnimation(
      parent: _animationController,
      curve: const Interval(0.0, 0.65, curve: Curves.easeOut),
    );

    _logoSlideAnimation = Tween<Offset>(
      begin: const Offset(0, -0.5),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOutBack),
    ));

    _logoScaleAnimation = Tween<double>(
      begin: 0.5,
      end: 1.0,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: const Interval(0.0, 0.5, curve: Curves.easeOutBack),
    ));

    _textSlideAnimation = Tween<Offset>(
      begin: const Offset(-0.3, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: const Interval(0.2, 0.7, curve: Curves.easeOut),
    ));

    _formSlideAnimation = Tween<Offset>(
      begin: const Offset(0.3, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: const Interval(0.4, 0.85, curve: Curves.easeOut),
    ));

    _buttonSlideAnimation = Tween<Offset>(
      begin: const Offset(0, 0.5),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: const Interval(0.6, 1.0, curve: Curves.easeOut),
    ));

    _animationController.forward();
  }

  @override
  void dispose() {
    _animationController.dispose();
    _googleAuthSubscription?.cancel();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _initializeGoogleSignIn() async {
    try {
      if (kIsWeb) {
        final clientId = await GoogleAuthService.loadWebClientId();
        if (mounted) {
          setState(() {
            _googleClientId = clientId;
            _isGoogleReady = clientId != null;
            _googleError = null;
          });
        }
        return;
      }

      await GoogleAuthService.initialize();
      _googleAuthSubscription ??= GoogleSignIn.instance.authenticationEvents
          .listen(
            _handleGoogleAuthenticationEvent,
            onError: _handleGoogleError,
          );
      if (mounted) {
        setState(() {
          _isGoogleReady = true;
          _googleError = null;
        });
      }
    } catch (e) {
      debugPrint('DEBUG: Google Sign-In init error: $e');
      if (mounted) {
        setState(() {
          _isGoogleReady = false;
          _googleError = kIsWeb
              ? null
              : 'Google sign-in needs a valid OAuth Client ID.';
        });
      }
    }
  }

  Future<void> _handleLogin() async {
    debugPrint(
      'DEBUG: Unified Login clicked with email: ${_emailController.text}',
    );
    if (_emailController.text.isEmpty || _passwordController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter both email and password')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final response = await ApiService.post('/auth/login', {
        'email': _emailController.text.trim(),
        'password': _passwordController.text,
      });

      debugPrint('DEBUG: API Response Status: ${response.statusCode}');
      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        await _completeLogin(data);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                data['message'] ??
                    'Login failed. Please check your credentials.',
              ),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('DEBUG: Login Error: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Connection error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _completeLogin(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    final user = Map<String, dynamic>.from(data['user'] as Map);
    final role = (user['role'] ?? data['role'])?.toString().toLowerCase().trim() ?? '';

    await prefs.setString('token', data['token'].toString());
    await prefs.setString('user_role', role);
    await prefs.setString('user_data', jsonEncode(user));

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Login successful! Welcome ${user['name']}')),
    );

    if (role == 'customer') {
      Navigator.pushReplacementNamed(context, AppRoutes.home);
    } else if (role == 'driver') {
      await DriverPresenceService.instance.start();
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, AppRoutes.driverDashboard);
    } else if (role == 'car_wash_worker' || role == 'worker') {
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, AppRoutes.workerDashboard);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unknown user role ($role). Please contact support.'),
        ),
      );
    }


  }

  Future<void> _handleGoogleAuthenticationEvent(
    GoogleSignInAuthenticationEvent event,
  ) async {
    switch (event) {
      case GoogleSignInAuthenticationEventSignIn():
        await _handleGoogleAccount(event.user);
      case GoogleSignInAuthenticationEventSignOut():
        break;
    }
  }

  Future<void> _handleGoogleSignIn() async {
    if (_isGoogleLoading) return;

    setState(() {
      _isGoogleLoading = true;
      _googleError = null;
    });

    try {
      if (kIsWeb) {
        final clientId =
            _googleClientId ?? await GoogleAuthService.loadWebClientId();
        if (clientId == null || clientId.isEmpty) {
          throw Exception(
            'Google sign-in is not configured. Set GOOGLE_CLIENT_ID in backend/.env and restart the backend.',
          );
        }
        if (mounted) {
          setState(() {
            _googleClientId = clientId;
            _isGoogleReady = true;
            _googleError = null;
          });
        }
        return;
      }

      await GoogleAuthService.initialize();
      if (!GoogleSignIn.instance.supportsAuthenticate()) {
        throw UnsupportedError('Use the Google button to continue.');
      }
      final account = await GoogleSignIn.instance.authenticate();
      await _handleGoogleAccount(account);
    } catch (e) {
      _handleGoogleError(e);
    } finally {
      if (mounted) {
        setState(() => _isGoogleLoading = false);
      }
    }
  }

  Future<void> _handleGoogleAccount(GoogleSignInAccount account) async {
    final idToken = account.authentication.idToken;
    await _authenticateWithGoogleIdToken(idToken);
  }

  Future<void> _authenticateWithGoogleIdToken(String? idToken) async {
    if (_isGoogleLoading == false && mounted) {
      setState(() => _isGoogleLoading = true);
    }

    try {
      if (idToken == null || idToken.isEmpty) {
        throw Exception('Google did not return an ID token.');
      }

      final response = await ApiService.post('/auth/google', {
        'id_token': idToken,
      });
      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        await _completeLogin(Map<String, dynamic>.from(data as Map));
      } else {
        throw Exception(
          data is Map && data['message'] != null
              ? data['message'].toString()
              : 'Google sign-in failed.',
        );
      }
    } catch (e) {
      _handleGoogleError(e);
    } finally {
      if (mounted) {
        setState(() => _isGoogleLoading = false);
      }
    }
  }

  void _handleGoogleError(Object error) {
    debugPrint('DEBUG: Google Sign-In Error: $error');
    if (!mounted) return;

    final message =
        error is GoogleSignInException &&
            error.code == GoogleSignInExceptionCode.canceled
        ? 'Google sign-in was cancelled.'
        : error.toString().replaceFirst('Exception: ', '');

    setState(() => _googleError = message);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final textPrimary = cs.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: SingleChildScrollView(
              child: FadeTransition(
                opacity: _fadeAnimation,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: AppSpacing.l),

                    // Logo Area
                    Center(
                      child: SlideTransition(
                        position: _logoSlideAnimation,
                        child: ScaleTransition(
                          scale: _logoScaleAnimation,
                          child: const Padding(
                            padding: EdgeInsets.symmetric(vertical: AppSpacing.m),
                            child: GaarsisLogo(height: 120),
                          ),
                        ),
                      ),
                    ),

                    // Header Content
                    SlideTransition(
                      position: _textSlideAnimation,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.l,
                          vertical: AppSpacing.m,
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text(
                              'Welcome Back',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: textPrimary,
                                fontSize: 32,
                                fontWeight: FontWeight.bold,
                                height: 1.2,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.s),
                            Text(
                              'Log in to your fuel delivery account',
                              textAlign: TextAlign.center,
                              style: AppTypography.bodyMain.copyWith(
                                color: textSecondary,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Login Form
                    SlideTransition(
                      position: _formSlideAnimation,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
                        child: Column(
                          children: [
                            CustomTextField(
                              controller: _emailController,
                              label: 'Username, Email or Phone',
                              hintText: 'Enter your username, email or phone',
                            ),
                            const SizedBox(height: AppSpacing.l),
                            Column(
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      'Password',
                                      style: AppTypography.bodySmall.copyWith(
                                        color: textSecondary,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                    // TextButton(
                                    //   onPressed: () {
                                    //     debugPrint('DEBUG: Forgot Password clicked');
                                    //     ScaffoldMessenger.of(context).showSnackBar(
                                    //       const SnackBar(
                                    //         content: Text(
                                    //           'If Password reset functionality coming soon!',
                                    //         ),
                                    //       ),
                                    //     );
                                    //   },
                                    //   child: Text(
                                    //     'Forgot Password?',
                                    //     style: AppTypography.bodySmall.copyWith(
                                    //       color: AppColors.primary,
                                    //       fontWeight: FontWeight.bold,
                                    //     ),
                                    //   ),
                                    // ),
                                  ],
                                ),
                                CustomTextField(
                                  controller: _passwordController,
                                  label:
                                      '', // Label already handled above for exact styling
                                  hintText: 'Enter your password',
                                  isPassword: _obscurePassword,
                                  suffixIcon: IconButton(
                                    icon: Icon(
                                      _obscurePassword
                                          ? Icons.visibility
                                          : Icons.visibility_off,
                                      color: textSecondary,
                                    ),
                                    onPressed: () => setState(
                                      () => _obscurePassword = !_obscurePassword,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppSpacing.xl),
                            CustomButton(
                              text: _isLoading ? 'Logging In...' : 'Log In',
                              onPressed: _isLoading
                                  ? null
                                  : () {
                                    _handleLogin();
                                  },
                              backgroundColor: AppColors.primary,
                              textColor: Colors.white,
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Bottom Section (Sign-up prompt)
                    SlideTransition(
                      position: _buttonSlideAnimation,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
                        child: Column(
                          children: [
                            const SizedBox(height: 48),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  "Don't have an account? ",
                                  style: AppTypography.bodySmall.copyWith(
                                    color: textSecondary,
                                  ),
                                ),
                                TextButton(
                                  onPressed: () =>
                                      Navigator.pushNamed(context, AppRoutes.signup),
                                  child: Text(
                                    'Create Account',
                                    style: AppTypography.bodySmall.copyWith(
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppSpacing.xl),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
      ),
    );
  }

  Widget _buildBackgroundSparePart(String asset,
      {double? top, double? bottom, double? left, double? right, required double delay}) {
    return Positioned(
      top: top,
      bottom: bottom,
      left: left,
      right: right,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.2, 0.2),
          end: Offset.zero,
        ).animate(CurvedAnimation(
          parent: _animationController,
          curve: Interval(delay, delay + 0.2, curve: Curves.easeOut),
        )),
        child: FadeTransition(
          opacity: CurvedAnimation(
            parent: _animationController,
            curve: Interval(delay, delay + 0.2, curve: Curves.easeIn),
          ),
          child: Opacity(
            opacity: 0.05,
            child: Image.asset(asset, width: 150, height: 150),
          ),
        ),
      ),
    );
  }

  Widget _buildGoogleSignInButton() {
    if (kIsWeb &&
        _isGoogleReady &&
        _googleClientId != null &&
        !_isGoogleLoading) {
      return GoogleIdentityButton(
        clientId: _googleClientId!,
        isDark: Theme.of(context).brightness == Brightness.dark,
        onIdToken: (idToken) =>
            unawaited(_authenticateWithGoogleIdToken(idToken)),
        onError: _handleGoogleError,
      );
    }

    return _buildSocialButton(
      _isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google',
      'assets/images/google_logo.png',
      onTap: _isGoogleLoading ? null : () => unawaited(_handleGoogleSignIn()),
      isLoading: _isGoogleLoading,
    );
  }

  Widget _buildSocialButton(
    String label,
    String? imageUrl, {
    IconData? icon,
    VoidCallback? onTap,
    bool isLoading = false,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final backgroundColor = isDark ? AppColors.surfaceDark : Colors.white;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;
    final textColor = theme.colorScheme.onSurface;

    return Container(
      width: double.infinity,
      height: 56,
      margin: const EdgeInsets.only(bottom: AppSpacing.m),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(AppSpacing.radiusL),
        border: Border.all(color: borderColor, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: InkWell(
        onTap:
            onTap ??
            () {
              debugPrint('DEBUG: Social Login clicked: $label');
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('$label integration coming soon!')),
              );
            },
        borderRadius: BorderRadius.circular(AppSpacing.radiusL),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (isLoading)
              SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: textColor,
                ),
              )
            else if (imageUrl != null)
              Image.asset(imageUrl, height: 28, width: 28, fit: BoxFit.contain)
            else if (icon != null)
              Icon(icon, color: textColor, size: 24),
            const SizedBox(width: AppSpacing.m),
            Text(
              label,
              style: TextStyle(
                color: textColor,
                fontWeight: FontWeight.w500,
                fontSize: 16,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
