import 'package:flutter/material.dart';
import '../../../../core/constants/app_assets.dart';

class ServiceDetailModel {
  final String title;
  final String description;
  final String imageUrl;
  final IconData icon;
  final String actionText;

  ServiceDetailModel({
    required this.title,
    required this.description,
    required this.imageUrl,
    required this.icon,
    required this.actionText,
  });

  static List<ServiceDetailModel> get allServices => [
    ServiceDetailModel(
      title: 'Petrol',
      description: 'Petrol Delivery',
      imageUrl: AppAssets.petrolIcon,
      icon: Icons.local_gas_station,
      actionText: 'Select Petrol Delivery',
    ),
    ServiceDetailModel(
      title: 'Diesel',
      description: 'Diesel Delivery',
      imageUrl: AppAssets.dieselIcon,
      icon: Icons.ev_station,
      actionText: 'Select Diesel Delivery',
    ),
    ServiceDetailModel(
      title: 'LPG Gas',
      description: 'Gas Cylinder Delivery',
      imageUrl: AppAssets.gasCylinder,
      icon: Icons.propane_tank,
      actionText: 'Select Gas Delivery',
    ),
    ServiceDetailModel(
      title: 'Spare Parts',
      description: 'Spare Parts Delivery',
      imageUrl: AppAssets.spareParts,
      icon: Icons.settings_suggest,
      actionText: 'Shop Spare Parts',
    ),
    ServiceDetailModel(
      title: 'Car Service',
      description: 'Book a car service',
      imageUrl: AppAssets.battery,
      icon: Icons.car_repair,
      actionText: 'Find Car Service',
    ),
  ];
}
