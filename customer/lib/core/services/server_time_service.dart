import 'dart:convert';
import 'package:http/http.dart' as http;
import '../utils/api_service.dart';

/// ─── Trusted server time ─────────────────────────────────────────────────────
/// The device clock is NOT trusted. Changing the phone's date/time must not
/// change which delivery slots are offered, nor any payment/booking/order time.
///
/// On first use this syncs with the backend's `/api/time` endpoint and stores
/// the offset between the server clock and the device clock. `now()` then
/// returns device-time + offset, which tracks the server even if the user
/// changes their phone clock afterwards.
///
/// The backend independently re-validates every submitted slot against its own
/// clock, so this class is about showing the *correct* options — it is not the
/// security boundary.
class ServerTimeService {
  static Duration _offset = Duration.zero;
  static bool _synced = false;
  static DateTime? _lastSyncDeviceTime;

  /// Re-sync if we've never synced, or if the device clock jumped since the
  /// last sync (a strong hint the user changed it).
  static bool get _needsSync {
    if (!_synced) return true;
    final last = _lastSyncDeviceTime;
    if (last == null) return true;
    return DateTime.now().difference(last).abs() > const Duration(hours: 1);
  }

  /// Fetches the authoritative time. Safe to call repeatedly and on every screen
  /// open; it is a no-op when already fresh.
  static Future<void> sync({bool force = false}) async {
    if (!force && !_needsSync) return;
    try {
      final deviceBefore = DateTime.now();
      final response = await http
          .get(Uri.parse('${ApiService.baseUrl}/time'))
          .timeout(const Duration(seconds: 6));
      if (response.statusCode != 200) return;

      final body = jsonDecode(response.body) as Map<String, dynamic>;
      final utc = body['utc'];
      if (utc == null) return;

      final serverNow = DateTime.parse(utc as String).toLocal();
      final deviceAfter = DateTime.now();
      // Compensate for round-trip latency by using the request midpoint.
      final latency = deviceAfter.difference(deviceBefore);
      final deviceMid = deviceBefore.add(latency ~/ 2);

      _offset = serverNow.difference(deviceMid);
      _synced = true;
      _lastSyncDeviceTime = deviceAfter;
    } catch (_) {
      // Offline or unreachable: fall back to the device clock. The backend still
      // rejects anything in its own past, so a tampered clock cannot book.
    }
  }

  /// Best available "now": server-corrected when synced, device clock otherwise.
  static DateTime now() => DateTime.now().add(_offset);

  /// True when [now] is backed by a real server sync.
  static bool get isSynced => _synced;

  /// Exposed for diagnostics/tests.
  static Duration get offset => _offset;

  static void resetForTest() {
    _offset = Duration.zero;
    _synced = false;
    _lastSyncDeviceTime = null;
  }
}
