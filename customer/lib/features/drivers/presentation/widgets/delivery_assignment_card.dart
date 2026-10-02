import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/services/driver_offers_service.dart';

/// The persistent "New Delivery Assignment" card shown on the Driver Home
/// dashboard and the Driver Notifications screen. All data is real
/// (delivery_offers via /driver/offers/pending). Includes Decline / Accept.
class DeliveryAssignmentCard extends StatefulWidget {
  final Map<String, dynamic> offer;

  /// Called after a successful accept/decline so the parent can react
  /// (e.g. route to Active Deliveries on accept).
  final void Function(String action)? onResponded;

  const DeliveryAssignmentCard({super.key, required this.offer, this.onResponded});

  @override
  State<DeliveryAssignmentCard> createState() => _DeliveryAssignmentCardState();
}

class _DeliveryAssignmentCardState extends State<DeliveryAssignmentCard> {
  String _busy = '';

  dynamic get _offerId => widget.offer['id'] ?? widget.offer['offer_id'];

  String get _orderNo {
    final id = widget.offer['order_id'];
    final label = widget.offer['order_label']?.toString();
    if (label != null && label.isNotEmpty) return label;
    return id != null ? 'ORD-${id.toString().padLeft(4, '0')}' : '—';
  }

  String get _amount {
    final a = double.tryParse('${widget.offer['offered_amount'] ?? 0}') ?? 0;
    return '\$${a.toStringAsFixed(2)}';
  }

  String get _assignedTime {
    final raw = (widget.offer['offered_at'] ?? widget.offer['created_at'])?.toString();
    if (raw == null || raw.isEmpty) return '';
    final dt = DateTime.tryParse(raw);
    if (dt == null) return raw;
    final l = dt.toLocal();
    final diff = DateTime.now().difference(l);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${l.day}/${l.month}/${l.year}';
  }

  Future<void> _respond(String action) async {
    if (_busy.isNotEmpty) return;
    setState(() => _busy = action);
    final result = await DriverOffersService.instance.respond(_offerId, action);
    if (!mounted) return;
    setState(() => _busy = '');
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(result.message.isNotEmpty
          ? result.message
          : (action == 'accept' ? 'Delivery accepted.' : 'Delivery declined.')),
      backgroundColor: result.ok
          ? (action == 'accept' ? Colors.green : Colors.blueGrey)
          : AppColors.error,
    ));
    if (result.ok) widget.onResponded?.call(action);
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.primary.withOpacity(0.25)),
        boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.06), blurRadius: 14, offset: const Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header band
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.08),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: Row(
              children: [
                Container(
                  width: 38, height: 38, alignment: Alignment.center,
                  decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(11)),
                  child: const Icon(Icons.local_shipping_outlined, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text('New Delivery Assignment',
                      style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: Color(0xFF0F172A))),
                ),
                _statusPill((o['status'] ?? 'pending').toString()),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'You have received a new delivery assignment.\nPlease accept or decline this delivery.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF475569), height: 1.35),
                ),
                const SizedBox(height: 12),
                _row(Icons.tag, 'Order No', _orderNo),
                _row(Icons.person_outline, 'Customer', o['customer_name']?.toString()),
                _row(Icons.storefront_outlined, 'Vendor', o['vendor_name']?.toString()),
                _row(Icons.inventory_2_outlined, 'Order type',
                    (o['order_type'] ?? o['product_summary'])?.toString()),
                _row(Icons.my_location, 'Pickup', o['pickup_location']?.toString()),
                _row(Icons.location_on_outlined, 'Delivery', o['customer_destination']?.toString()),
                _row(Icons.attach_money, 'Your earning', _amount, highlight: true),
                if (_assignedTime.isNotEmpty)
                  _row(Icons.schedule, 'Assigned', _assignedTime),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy.isEmpty ? () => _respond('decline') : null,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFE11D48),
                          side: const BorderSide(color: Color(0xFFE11D48)),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                        ),
                        child: _busy == 'decline'
                            ? const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFE11D48)))
                            : const Text('Decline', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 3,
                      child: ElevatedButton(
                        onPressed: _busy.isEmpty ? () => _respond('accept') : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary, foregroundColor: Colors.white, elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                        ),
                        child: _busy == 'accept'
                            ? const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('Accept Delivery', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusPill(String status) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(999)),
      child: Text(
        status == 'pending' ? 'Awaiting response' : status,
        style: const TextStyle(color: Color(0xFF92400E), fontSize: 10.5, fontWeight: FontWeight.w800),
      ),
    );
  }

  Widget _row(IconData icon, String label, String? value, {bool highlight = false}) {
    if (value == null || value.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: highlight ? AppColors.primary : const Color(0xFF94A3B8)),
          const SizedBox(width: 9),
          SizedBox(
            width: 74,
            child: Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(value,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: highlight ? FontWeight.w800 : FontWeight.w600,
                    color: highlight ? AppColors.primary : const Color(0xFF1E293B))),
          ),
        ],
      ),
    );
  }
}
