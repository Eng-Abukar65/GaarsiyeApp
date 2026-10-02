import 'package:flutter/material.dart';

class FuelTypeModel {
  final String name;
  final String tag;
  final double pricePerLiter;
  final IconData icon;
  final bool isPremium;

  FuelTypeModel({
    required this.name,
    required this.tag,
    required this.pricePerLiter,
    required this.icon,
    this.isPremium = false,
  });

  static List<FuelTypeModel> get petrolOptions => [
    FuelTypeModel(
      name: 'Petrol 95',
      tag: 'REGULAR',
      pricePerLiter: 2.15,
      icon: Icons.water_drop,
      isPremium: false,
    ),
    FuelTypeModel(
      name: 'Petrol 98',
      tag: 'PREMIUM',
      pricePerLiter: 2.45,
      icon: Icons.bolt,
      isPremium: true,
    ),
  ];

  static List<FuelTypeModel> get dieselOptions => [
    FuelTypeModel(
      name: 'Premium Diesel',
      tag: 'REGULAR',
      pricePerLiter: 1.45,
      icon: Icons.water_drop,
      isPremium: false,
    ),
    FuelTypeModel(
      name: 'High-Performance Diesel',
      tag: 'PREMIUM',
      pricePerLiter: 1.60,
      icon: Icons.bolt,
      isPremium: true,
    ),
  ];
}
