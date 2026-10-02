import 'dart:convert';
import 'package:flutter/foundation.dart';

import '../utils/api_service.dart';

/// Holds the driver's PENDING delivery assignments (from delivery_offers) and
/// keeps every surface — the dashboard cards, the notification bell badge and
/// the Notifications screen — in sync from one real backend source.
///
/// This is strictly Delivery Driver data (GET /driver/offers/pending) and is
/// never mixed with Car Wash Worker notifications.
class DriverOffersService extends ChangeNotifier {
  DriverOffersService._();
  static final DriverOffersService instance = DriverOffersService._();

  List<Map<String, dynamic>> _offers = [];
  bool _loading = false;

  List<Map<String, dynamic>> get offers => List.unmodifiable(_offers);
  int get count => _offers.length;
  bool get isLoading => _loading;

  /// Re-fetch the driver's pending assignments.
  Future<void> refresh() async {
    if (_loading) return;
    _loading = true;
    try {
      final res = await ApiService.get('/driver/offers/pending');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final raw = (data is Map)
            ? (data['offers'] ?? data['data'])
            : (data is List ? data : null);
        if (raw is List) {
          _offers = raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        }
      } else if (res.statusCode == 401 || res.statusCode == 403) {
        _offers = [];
      }
    } catch (_) {
      // keep the last known list on a transient error
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Accept or decline an assignment. Returns (ok, message). On success the
  /// backend moves the order into the driver's active deliveries (accept) or
  /// frees it for another driver (decline), and notifies the vendor/admin.
  Future<({bool ok, String message})> respond(dynamic offerId, String action) async {
    try {
      final res = await ApiService.patch('/driver/offers/$offerId/respond', {'action': action});
      final data = jsonDecode(res.body);
      final ok = res.statusCode == 200 && data['success'] == true;
      // Optimistically drop it locally so the card/badge update instantly.
      if (ok) {
        _offers.removeWhere((o) => (o['id'] ?? o['offer_id']).toString() == offerId.toString());
        notifyListeners();
      }
      await refresh();
      return (ok: ok, message: (data['message'] ?? '').toString());
    } catch (_) {
      return (ok: false, message: 'Network error. Please try again.');
    }
  }

  /// Clear on logout so a new session never sees stale assignments.
  void clear() {
    _offers = [];
    notifyListeners();
  }
}
