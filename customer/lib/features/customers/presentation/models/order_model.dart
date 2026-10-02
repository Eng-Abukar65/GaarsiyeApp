import 'package:flutter/material.dart';

enum OrderStatus { pending, accepted, driverAssigned, onTheWay, delivered, cancelled }

class OrderModel {
  final String id;
  final String title;
  final String station;
  final double amount;
  final String date;
  final OrderStatus status;
  final IconData icon;

  OrderModel({
    required this.id,
    required this.title,
    required this.station,
    required this.amount,
    required this.date,
    required this.status,
    required this.icon,
  });

  static List<OrderModel> get dummyOrders => [
    OrderModel(
      id: 'ORD-9921',
      title: '50L Petrol 95 delivery',
      station: 'Station #402',
      amount: 78.50,
      date: 'Oct 24, 2023',
      status: OrderStatus.delivered,
      icon: Icons.local_gas_station,
    ),
    OrderModel(
      id: 'ORD-9844',
      title: 'UltraPower Battery (12V)',
      station: 'Parts Express',
      amount: 145.00,
      date: 'Oct 20, 2023',
      status: OrderStatus.pending,
      icon: Icons.battery_charging_full,
    ),
    OrderModel(
      id: 'ORD-9750',
      title: 'Synthetic Motor Oil (5L)',
      station: 'Main Depot',
      amount: 42.00,
      date: 'Oct 15, 2023',
      status: OrderStatus.cancelled,
      icon: Icons.oil_barrel,
    ),
    OrderModel(
      id: 'ORD-9722',
      title: '20L Diesel + Wiper Fluid',
      station: 'Station #112',
      amount: 34.20,
      date: 'Oct 12, 2023',
      status: OrderStatus.delivered,
      icon: Icons.local_gas_station,
    ),
  ];
}
