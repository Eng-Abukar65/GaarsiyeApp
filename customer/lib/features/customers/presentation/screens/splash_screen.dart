import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/constants/app_assets.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/services/initialization_service.dart';
import '../../../../core/theme/theme_provider.dart';
import '../controllers/splash_controller.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _introController;
  late final AnimationController _glowController;
  late final Animation<double> _fadeAnimation;
  late final Animation<double> _scaleAnimation;
  late SplashController _splashController;
  bool _didCreateController = false;
  bool _didNavigate = false;

  @override
  void initState() {
    super.initState();
    _introController = AnimationController(
      duration: const Duration(milliseconds: 900),
      vsync: this,
    );
    _glowController = AnimationController(
      duration: const Duration(milliseconds: 2200),
      vsync: this,
    );
    _fadeAnimation = CurvedAnimation(
      parent: _introController,
      curve: Curves.easeInOut,
    );
    _scaleAnimation = Tween<double>(begin: 0.94, end: 1).animate(
      CurvedAnimation(parent: _introController, curve: Curves.easeOutCubic),
    );
    _introController.forward();
    _glowController.repeat(reverse: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didCreateController) {
      return;
    }

    final themeProvider = context.read<ThemeProvider>();
    _splashController = SplashController(
      initializationService: InitializationService(
        themeProvider: themeProvider,
      ),
    )..addListener(_handleControllerUpdate);
    _didCreateController = true;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _splashController.start();
    });
  }

  void _handleControllerUpdate() {
    final route = _splashController.nextRoute;
    if (route == null || _didNavigate || !mounted) {
      return;
    }

    _didNavigate = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Navigator.of(context).pushReplacementNamed(route);
      }
    });
  }

  @override
  void dispose() {
    _splashController.removeListener(_handleControllerUpdate);
    _splashController.dispose();
    _introController.dispose();
    _glowController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.watch<ThemeProvider>().isDarkMode;
    final background = isDark ? AppColors.backgroundDark : AppColors.background;
    final textPrimary = isDark
        ? AppColors.textPrimaryDark
        : AppColors.textPrimary;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    return Scaffold(
      backgroundColor: background,
      body: Stack(
        children: [
          _buildGlowBackground(isDark),
          SafeArea(
            child: FadeTransition(
              opacity: _fadeAnimation,
              child: ScaleTransition(
                scale: _scaleAnimation,
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Column(
                      children: [
                        const SizedBox(height: 8),
                        _buildBrandHeader(textPrimary),
                        const SizedBox(height: 32),
                        _buildIllustration(isDark),
                        const SizedBox(height: 24),
                        _buildTagline(textPrimary, textSecondary),
                        const SizedBox(height: 32),
                        _buildProgressPanel(textSecondary, borderColor),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGlowBackground(bool isDark) {
    return AnimatedBuilder(
      animation: _glowController,
      builder: (context, child) {
        final glow = lerpDouble(0.08, 0.18, _glowController.value)!;
        return Stack(
          children: [
            Positioned(
              top: -100,
              right: -100,
              child: Container(
                width: 300,
                height: 300,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.primary.withOpacity(glow),
                      AppColors.primary.withOpacity(0),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              left: -120,
              bottom: 80,
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      (isDark ? AppColors.secondaryDark : AppColors.secondary)
                          .withOpacity(glow * 0.55),
                      AppColors.primary.withOpacity(0),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildBrandHeader(Color textPrimary) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        AnimatedBuilder(
          animation: _glowController,
          builder: (context, child) {
            return Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.primary,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(
                      0.24 + (_glowController.value * 0.18),
                    ),
                    blurRadius: 18,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: child,
            );
          },
          child: const Icon(
            Icons.local_gas_station,
            color: Colors.white,
            size: 28,
          ),
        ),
        const SizedBox(width: 12),
        Text(
          'Gaarsis App',
          style: TextStyle(
            color: textPrimary,
            fontSize: 24,
            fontWeight: FontWeight.bold,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }

  Widget _buildIllustration(bool isDark) {
    return AnimatedBuilder(
      animation: _glowController,
      builder: (context, child) {
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 40),
          height: 300,
          width: double.infinity,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withOpacity(
                  isDark ? 0.12 + (_glowController.value * 0.08) : 0.08,
                ),
                blurRadius: 30,
                offset: const Offset(0, 15),
              ),
            ],
            image: const DecorationImage(
              image: AssetImage(AppAssets.splashLogo),
              fit: BoxFit.contain,
            ),
          ),
        );
      },
    );
  }

  Widget _buildTagline(Color textPrimary, Color textSecondary) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Text(
            'Fuel delivery at your doorstep',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: textPrimary,
              fontSize: 32,
              fontWeight: FontWeight.bold,
              height: 1.2,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 50),
          child: Text(
            'Ultimate fuel and spare parts service. Rapid delivery, anytime, anywhere.',
            textAlign: TextAlign.center,
            style: TextStyle(color: textSecondary, fontSize: 16, height: 1.5),
          ),
        ),
      ],
    );
  }

  Widget _buildProgressPanel(Color textSecondary, Color borderColor) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 60),
      child: AnimatedBuilder(
        animation: _splashController,
        builder: (context, child) {
          if (_splashController.hasError) {
            return _buildRetryState(textSecondary);
          }

          return TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: _splashController.progress),
            duration: const Duration(milliseconds: 450),
            curve: Curves.easeInOutCubic,
            builder: (context, animatedProgress, child) {
              final progress = (animatedProgress * 100).round().clamp(0, 100);

              return Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: Align(
                            key: ValueKey(_splashController.message),
                            alignment: Alignment.centerLeft,
                            child: Text(
                              _splashController.message,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.primary,
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        '$progress%',
                        style: TextStyle(color: textSecondary, fontSize: 12),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: LinearProgressIndicator(
                      value: animatedProgress,
                      backgroundColor: borderColor,
                      color: AppColors.primary,
                      minHeight: 6,
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildRetryState(Color textSecondary) {
    return Column(
      children: [
        Text(
          _splashController.errorMessage ?? 'Connection issue',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.error,
            fontSize: 13,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Please check the backend server and try again.',
          textAlign: TextAlign.center,
          style: TextStyle(color: textSecondary, fontSize: 12),
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: 156,
          height: 42,
          child: ElevatedButton.icon(
            onPressed: _splashController.isLoading
                ? null
                : () => _splashController.retry(),
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Retry'),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
