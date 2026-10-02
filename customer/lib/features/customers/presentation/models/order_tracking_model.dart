enum OrderStatusStep { placed, assigned, enRoute, delivered }

class OrderTrackingModel {
  final String orderId;
  final String fuelType;
  final String quantity;
  final String estimatedArrival;
  final OrderStatusStep currentStep;
  final String driverName;
  final String driverPhoto;

  OrderTrackingModel({
    required this.orderId,
    required this.fuelType,
    required this.quantity,
    required this.estimatedArrival,
    required this.currentStep,
    required this.driverName,
    required this.driverPhoto,
  });

  static OrderTrackingModel get dummyOrder => OrderTrackingModel(
    orderId: '#ORD-772910',
    fuelType: 'Premium Unleaded',
    quantity: '50 Gallons',
    estimatedArrival: '14:45 PM',
    currentStep: OrderStatusStep.enRoute,
    driverName: 'Abdirahman A.',
    driverPhoto: 'https://i.pravatar.cc/150?u=abdirahman',
  );
}
