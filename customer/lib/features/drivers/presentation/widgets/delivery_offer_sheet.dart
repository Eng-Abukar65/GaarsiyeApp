import 'dart:convert';
import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';

/// A modal shown to the driver when a vendor sends a delivery request/offer.
/// Displays the order details and lets the driver Accept or Decline; the
/// response goes to PATCH /driver/offers/:offerId/respond, and the backend
/// notifies the vendor in real time.
class DeliveryOfferSheet extends StatefulWidget {
  final Map<String, dynamic> offer;
  const DeliveryOfferSheet({super.key, required this.offer});

  /// Shows the sheet on [context]. Returns 'accept' / 'decline' / null.
  static Future<String?> show(BuildContext context, Map<String, dynamic> offer) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (_) => DeliveryOfferSheet(offer: offer),
    );
  }

  @override
  State<DeliveryOfferSheet> createState() => _DeliveryOfferSheetState();
}

class _DeliveryOfferSheetState extends State<DeliveryOfferSheet> {
  String _busy = ''; // 'accept' | 'decline' | ''
  String? _error;

  dynamic get _offerId => widget.offer['offer_id'] ?? widget.offer['id'];

  String get _amount {
    final a = double.tryParse('${widget.offer['offered_amount'] ?? 0}') ?? 0;
    return '\$${a.toStringAsFixed(2)}';
  }

  String get _orderLabel {
    final label = widget.offer['order_label']?.toString();
    if (label != null && label.isNotEmpty) return label;
    final id = widget.offer['order_id'];
    return id != null ? 'ORD-${id.toString().padLeft(4, '0')}' : 'Order';
  }

  Future<void> _respond(String action) async {
    if (_busy.isNotEmpty || _offerId == null) return;
    setState(() { _busy = action; _error = null; });
    try {
      final res = await ApiService.patch('/driver/offers/$_offerId/respond', {'action': action});
      final data = jsonDecode(res.body);
      if (res.statusCode == 200 && data['success'] == true) {
        if (mounted) Navigator.of(context).pop(action);
        return;
      }
      setState(() {
        _error = data['message']?.toString() ?? 'Could not $action this request.';
        _busy = '';
      });
    } catch (_) {
      setState(() { _error = 'Network error. Please try again.'; _busy = ''; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(width: 42, height: 4,
                    decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Container(
                    width: 44, height: 44, alignment: Alignment.center,
                    decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.12), borderRadius: BorderRadius.circular(13)),
                    child: const Icon(Icons.local_shipping_outlined, color: AppColors.primary, size: 22),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text('New Delivery Request',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text('$_orderLabel • You will earn $_amount',
                  style: const TextStyle(fontSize: 13.5, color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
              const SizedBox(height: 16),

              _row(Icons.storefront_outlined, 'Pickup', o['pickup_location']?.toString() ?? o['vendor_name']?.toString()),
              _row(Icons.location_on_outlined, 'Drop-off', o['customer_destination']?.toString()),
              if ((o['customer_name'] ?? '').toString().isNotEmpty)
                _row(Icons.person_outline, 'Customer', o['customer_name']?.toString()),
              _row(Icons.attach_money, 'Your earning', _amount, highlight: true),

              if (_error != null) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                  decoration: BoxDecoration(color: const Color(0xFFFFE4E6), borderRadius: BorderRadius.circular(10)),
                  child: Text(_error!, style: const TextStyle(color: Color(0xFFE11D48), fontSize: 12.5, fontWeight: FontWeight.w600)),
                ),
              ],

              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy.isEmpty ? () => _respond('decline') : null,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFE11D48),
                        side: const BorderSide(color: Color(0xFFE11D48)),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: _busy == 'decline'
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFE11D48)))
                          : const Text('Decline', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _busy.isEmpty ? () => _respond('accept') : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary, foregroundColor: Colors.white, elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: _busy == 'accept'
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Accept', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(IconData icon, String label, String? value, {bool highlight = false}) {
    if (value == null || value.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: highlight ? AppColors.primary : const Color(0xFF94A3B8)),
          const SizedBox(width: 10),
          SizedBox(
            width: 78,
            child: Text(label, style: const TextStyle(fontSize: 12.5, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(value,
                style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: highlight ? FontWeight.w800 : FontWeight.w600,
                    color: highlight ? AppColors.primary : const Color(0xFF1E293B))),
          ),
        ],
      ),
    );
  }
}

/// Handles the result of a shown offer sheet: on accept, take the driver to
/// their deliveries so they can start the run.
void handleOfferResult(BuildContext context, String? result) {
  if (result == 'accept') {
    Navigator.of(context).pushNamedAndRemoveUntil(
      AppRoutes.driverDeliveries,
      (route) => route.settings.name == AppRoutes.driverDashboard,
    );
  }
}
