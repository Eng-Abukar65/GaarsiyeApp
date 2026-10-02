import 'package:flutter/material.dart';

enum PaymentType { waafiy, card }

class PaymentMethodModel {
  final String name;
  final String subtitle;
  final String? imageUrl;
  final IconData? icon;
  final PaymentType type;

  /// The exact string sent to the backend as payment_method
  final String apiKey;

  PaymentMethodModel({
    required this.name,
    required this.subtitle,
    this.imageUrl,
    this.icon,
    required this.type,
    required this.apiKey,
  });

  static List<PaymentMethodModel> get methods => [
    PaymentMethodModel(
      name: 'Wallet',
      subtitle: 'A payment prompt will be sent to your phone',
      imageUrl: 'assets/images/image.png',
      type: PaymentType.waafiy,
      apiKey: 'Wallet',
    ),
    PaymentMethodModel(
      name: 'Credit / Debit Card',
      subtitle: 'Visa or Mastercard',
      icon: Icons.credit_card_outlined,
      type: PaymentType.card,
      apiKey: 'Card',
    ),
  ];
}
