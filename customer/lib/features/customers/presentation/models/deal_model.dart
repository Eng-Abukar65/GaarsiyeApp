import '../../../../core/constants/app_assets.dart';

class DealModel {
  final String title;
  final double price;
  final double? oldPrice;
  final int? discount;
  final String imageUrl;

  DealModel({
    required this.title,
    required this.price,
    this.oldPrice,
    this.discount,
    required this.imageUrl,
  });

  static List<DealModel> get recentDeals => [
    DealModel(
      title: 'Castrol EDGE 5W-30 Full Synthetic',
      price: 34.99,
      oldPrice: 42.99,
      discount: 20,
      imageUrl: AppAssets.engineOil,
    ),
    DealModel(
      title: 'Bosch Double Iridium Spark Plug',
      price: 12.50,
      imageUrl: AppAssets.sparkPlug,
    ),
  ];
}
