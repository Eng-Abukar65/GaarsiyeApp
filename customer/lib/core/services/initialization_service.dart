import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../routes/app_routes.dart';
import '../theme/theme_provider.dart';
import '../utils/api_service.dart';
import 'driver_presence_service.dart';

class InitializationResult {
  const InitializationResult({required this.nextRoute});

  final String nextRoute;
}

class InitializationException implements Exception {
  const InitializationException(this.message);

  final String message;

  @override
  String toString() => message;
}

class InitializationService {
  const InitializationService({required this.themeProvider});

  final ThemeProvider themeProvider;

  Future<InitializationResult> initialize({
    required void Function(String message, double progress) onProgress,
  }) {
    return _run(onProgress).timeout(
      const Duration(seconds: 10),
      onTimeout: () => const InitializationResult(nextRoute: AppRoutes.login),
    );
  }

  Future<InitializationResult> _run(
    void Function(String message, double progress) onProgress,
  ) async {
    onProgress('Initializing...', 0.06);
    await _minimumStepDelay();

    onProgress('Loading assets...', 0.18);
    final prefsFuture = SharedPreferences.getInstance().timeout(
      const Duration(seconds: 2),
    );
    await themeProvider.loadTheme().timeout(const Duration(seconds: 2));
    final prefs = await prefsFuture;

    onProgress('Preparing app...', 0.36);
    ApiService.checkConnection()
        .timeout(const Duration(seconds: 4), onTimeout: () => false)
        .then((_) {}, onError: (_) {});

    onProgress('Preparing maps...', 0.58);
    await Future.wait([
      _preloadLocationPermission(),
      _initializeSocketPlaceholder(prefs),
    ]);

    onProgress('Syncing user session...', 0.82);
    final nextRoute = await _resolveNextRoute(prefs);

    onProgress('Ready', 1);
    await Future<void>.delayed(const Duration(milliseconds: 650));

    return InitializationResult(nextRoute: nextRoute);
  }

  Future<String> _resolveNextRoute(SharedPreferences prefs) async {
    final token = prefs.getString('token');
    final role = prefs.getString('user_role');

    if (token == null || token.isEmpty || role == null) {
      return AppRoutes.login;
    }

    try {
      if (role == 'customer') {
        final response = await ApiService.get(
          '/customer/profile',
        ).timeout(const Duration(seconds: 4));
        return response.statusCode == 200 ? AppRoutes.home : AppRoutes.login;
      }

      if (role == 'driver') {
        final response = await ApiService.get(
          '/driver/profile',
        ).timeout(const Duration(seconds: 4));
        if (response.statusCode == 200) {
          await DriverPresenceService.instance.start();
          return AppRoutes.driverDashboard;
        }
        return AppRoutes.login;
      }

      if (role == 'car_wash_worker' || role == 'worker') {
        final response = await ApiService.get(
          '/worker/profile',
        ).timeout(const Duration(seconds: 4));
        if (response.statusCode == 200) {
          return AppRoutes.workerDashboard;
        }
        return AppRoutes.login;
      }
    } catch (e) {
      debugPrint('Auth validation fallback: $e');
    }

    return AppRoutes.login;
  }


  Future<void> _preloadLocationPermission() async {
    try {
      await Future.wait([
        Geolocator.isLocationServiceEnabled(),
        Geolocator.checkPermission(),
      ]).timeout(const Duration(seconds: 2));
    } catch (e) {
      debugPrint('Location preload skipped: $e');
    }
  }

  Future<void> _initializeSocketPlaceholder(SharedPreferences prefs) async {
    final token = prefs.getString('token');
    if (token == null || token.isEmpty) {
      return;
    }

    if (prefs.getString('user_role') == 'driver') {
      await DriverPresenceService.instance.start();
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 120));
    }
  }

  Future<void> _minimumStepDelay() {
    return Future<void>.delayed(const Duration(milliseconds: 180));
  }
}
