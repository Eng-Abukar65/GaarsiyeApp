/// Single source of truth for the backend base URL.
///
/// Nothing else in the app may hardcode a host. Every service resolves through
/// [ApiService], which resolves through this file.
///
/// ── How the URL is chosen ────────────────────────────────────────────────────
///
///  1. `--dart-define=API_BASE_URL=…` always wins, in every build mode. This is
///     how CI and release builds are pointed at an environment.
///  2. Release builds otherwise use [productionUrl] and nothing else. A release
///     APK must never silently fall back to a LAN address: on a customer's phone
///     that address either fails to resolve or, worse, reaches an unrelated
///     device on their home network.
///  3. Debug builds fall back to [developmentBaseUrls] so `flutter run` keeps
///     working against a laptop on the same Wi-Fi.
class ApiConstants {
  const ApiConstants._();

  /// Build-time override. Set with:
  ///   flutter build apk --release --dart-define=API_BASE_URL=https://host/api
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  /// Production backend on Railway.
  ///
  /// Replace `RAILWAY_BACKEND_DOMAIN` with the domain Railway assigns the
  /// backend service (Railway → project → backend service → Settings →
  /// Networking → Public Networking). Must stay `https://` and must keep the
  /// trailing `/api`.
  static const String productionUrl =
      'https://RAILWAY_BACKEND_DOMAIN/api';

  /// True once [productionUrl] has been pointed at a real host. Used to fail
  /// with a clear message instead of hanging on DNS lookups for a placeholder.
  static bool get isProductionUrlConfigured =>
      !productionUrl.contains('RAILWAY_BACKEND_DOMAIN');

  /// Debug-only candidates, probed in parallel. Order is preference order.
  ///
  /// These are deliberately unreachable from a release build — see the class
  /// doc. Add your machine's current LAN IP here when developing on a phone.
  static const List<String> developmentBaseUrls = [
    'http://10.0.2.2:5001/api', // Android emulator -> host loopback
    'http://localhost:5001/api', // adb reverse tcp:5001 tcp:5001
    'http://127.0.0.1:5001/api',
    'http://192.168.100.2:5001/api', // dev machine on hotspot/ethernet
    'http://10.212.216.76:5001/api', // dev machine, previous ethernet lease
    'http://172.20.10.6:5001/api', // dev machine, previous Wi-Fi lease
  ];

  /// Resolved base URL for the current build mode, ignoring runtime probing.
  /// [ApiService] uses this to build its candidate list.
  static const Duration healthProbeTimeout = Duration(seconds: 5);
  static const Duration requestTimeout = Duration(seconds: 30);
}
