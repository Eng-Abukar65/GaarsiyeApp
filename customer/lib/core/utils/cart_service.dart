import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../features/customers/presentation/models/cart_item_model.dart';

class CartService {
  static final List<CartItemModel> _items = [];
  static const String _storageKey = 'customer_cart_items';
  static const String _offerStorageKey = 'customer_active_offer';
  static Map<String, dynamic>? _activeOffer;

  static List<CartItemModel> get items => _items;
  static Map<String, dynamic>? get activeOffer =>
      _activeOffer == null ? null : Map<String, dynamic>.from(_activeOffer!);

  static int? get activeOfferId =>
      int.tryParse(_activeOffer?['id']?.toString() ?? '');

  static Future<void> loadCart() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonString = prefs.getString(_storageKey);
      if (jsonString != null) {
        final List<dynamic> decoded = jsonDecode(jsonString);
        _items.clear();
        for (var item in decoded) {
          _items.add(CartItemModel.fromJson(item));
        }
      }

      final offerJsonString = prefs.getString(_offerStorageKey);
      if (offerJsonString != null && offerJsonString.isNotEmpty) {
        final decodedOffer = jsonDecode(offerJsonString);
        if (decodedOffer is Map) {
          _activeOffer = Map<String, dynamic>.from(decodedOffer);
        }
      }
    } catch (e) {
      print('DEBUG: Error loading cart: $e');
    }
  }

  static Future<void> saveCart() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final List<Map<String, dynamic>> encoded = _items
          .map((e) => e.toJson())
          .toList();
      await prefs.setString(_storageKey, jsonEncode(encoded));
    } catch (e) {
      print('DEBUG: Error saving cart: $e');
    }
  }

  static Future<void> applyOffer(Map<String, dynamic> offer) async {
    _activeOffer = Map<String, dynamic>.from(offer);
    await saveActiveOffer();
  }

  static Future<void> saveActiveOffer() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_activeOffer == null) {
        await prefs.remove(_offerStorageKey);
        return;
      }
      await prefs.setString(_offerStorageKey, jsonEncode(_activeOffer));
    } catch (e) {
      print('DEBUG: Error saving active offer: $e');
    }
  }

  static Future<void> clearActiveOffer() async {
    _activeOffer = null;
    await saveActiveOffer();
  }

  /// Adds an item to the cart.
  /// Rejects items with price <= 0 or that are inactive.
  static Future<String?> addItem(CartItemModel item) async {
    final incomingVendorId = item.vendorId;

    // Guard: reject invalid pricing
    if (item.price <= 0) {
      print(
        'DEBUG: [CartService] Rejected item "${item.title}" — invalid price: ${item.price}',
      );
      return 'Cannot add "${item.title}": invalid pricing.';
    }

    // Guard: reject inactive products
    if (!item.isActive) {
      print(
        'DEBUG: [CartService] Rejected item "${item.title}" — product is inactive',
      );
      return 'Cannot add "${item.title}": product is unavailable.';
    }

    // Guard: reject out-of-stock products
    if (item.stock <= 0) {
      print(
        'DEBUG: [CartService] Rejected item "${item.title}" — out of stock',
      );
      return 'Cannot add "${item.title}": out of stock.';
    }

    if (incomingVendorId != null &&
        _items.isNotEmpty &&
        _items.any((existing) => existing.vendorId != incomingVendorId)) {
      await clearCart(clearOffer: false);
    }

    final activeOfferVendorId =
        int.tryParse(_activeOffer?['vendor_id']?.toString() ?? '');
    if (incomingVendorId != null &&
        activeOfferVendorId != null &&
        activeOfferVendorId != incomingVendorId) {
      await clearActiveOffer();
    }

    final index = _items.indexWhere((e) => e.id == item.id);
    if (index != -1) {
      // Don't exceed available stock
      final newQty = _items[index].quantity + item.quantity;
      _items[index].quantity = newQty.clamp(1, item.stock);
    } else {
      _items.add(item);
    }
    await saveCart();
    return null; // null means success
  }

  static Future<void> updateQuantity(int index, int delta) async {
    if (index >= 0 && index < _items.length) {
      final item = _items[index];
      final newQty = item.quantity + delta;
      if (newQty > 0) {
        // Clamp to stock if stock info is available
        _items[index].quantity = item.stock > 0
            ? newQty.clamp(1, item.stock)
            : newQty;
      } else {
        _items.removeAt(index);
      }
      await saveCart();
    }
  }

  static Future<void> removeItem(int index) async {
    if (index >= 0 && index < _items.length) {
      _items.removeAt(index);
      await saveCart();
    }
  }

  static Future<void> clearCart({bool clearOffer = true}) async {
    _items.clear();
    await saveCart();
    if (clearOffer) {
      await clearActiveOffer();
    }
  }

  /// Returns true if any item in the cart has invalid pricing.
  static bool get hasInvalidPricingItems =>
      _items.any((item) => !item.hasValidPricing);

  /// Returns computed subtotal using local prices (preview only; backend recalculates).
  static double get subtotal =>
      _items.fold(0, (sum, item) => sum + (item.price * item.quantity));
}
