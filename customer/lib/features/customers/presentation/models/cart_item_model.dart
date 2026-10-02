import '../../../../core/constants/app_assets.dart';

class CartItemModel {
  final String id;
  final String title;
  final String? subtitle;
  final String imageUrl;
  final double price;
  final String priceUnit;
  int quantity;
  final int? vendorId;
  final String? vendorName;

  /// Unit of quantity: 'KG' for gas, 'L' for liquid fuel, '' for others.
  final String unit;

  /// Stock from the DB at the time the item was added.
  final int stock;

  /// Whether the product was active when added.
  final bool isActive;

  CartItemModel({
    required this.id,
    required this.title,
    this.subtitle,
    required this.imageUrl,
    required this.price,
    required this.priceUnit,
    required this.quantity,
    this.vendorId,
    this.vendorName,
    this.unit = '',
    this.stock = 0,
    this.isActive = true,
  });

  /// Returns true when quantity unit is KG (gas products).
  bool get isKgUnit => unit.toUpperCase() == 'KG';

  /// Returns true when this item has valid pricing and is active.
  bool get hasValidPricing => isActive && price > 0;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'subtitle': subtitle,
    'imageUrl': imageUrl,
    'price': price,
    'priceUnit': priceUnit,
    'quantity': quantity,
    'vendorId': vendorId,
    'vendorName': vendorName,
    'unit': unit,
    'stock': stock,
    'isActive': isActive,
  };

  factory CartItemModel.fromJson(Map<String, dynamic> json) => CartItemModel(
    id: json['id']?.toString() ?? '',
    title: json['title']?.toString() ?? '',
    subtitle: json['subtitle']?.toString(),
    imageUrl: json['imageUrl']?.toString() ?? AppAssets.battery,
    price: _parseDouble(json['price']),
    priceUnit: json['priceUnit']?.toString() ?? '',
    quantity: _parseInt(json['quantity']) ?? 1,
    vendorId: _parseInt(json['vendorId']),
    vendorName: json['vendorName']?.toString(),
    unit: json['unit']?.toString() ?? '',
    stock: _parseInt(json['stock']) ?? 0,
    isActive: json['isActive'] as bool? ?? true,
  );

  static double _parseDouble(dynamic value) {
    if (value == null) return 0.0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0.0;
  }

  static int? _parseInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value.toString());
  }

  static List<CartItemModel> get dummyItems => [
    CartItemModel(
      id: 'item1',
      title: 'Petrol 95 Octane',
      imageUrl: AppAssets.petrolIcon,
      price: 1.50,
      priceUnit: '/ Liter',
      quantity: 50,
      stock: 1000,
      isActive: true,
    ),
    CartItemModel(
      id: 'item2',
      title: 'UltraPower AGM Battery',
      subtitle: 'H6 (48) • 48 Month Warranty',
      imageUrl: AppAssets.battery,
      price: 349.99,
      priceUnit: '',
      quantity: 1,
      stock: 5,
      isActive: true,
    ),
  ];
}
