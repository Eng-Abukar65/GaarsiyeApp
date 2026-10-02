
import '../../../../core/constants/app_assets.dart';

class ServiceCategoryModel {
  final String title;
  final String count;
  final String imageUrl;

  ServiceCategoryModel({
    required this.title,
    required this.count,
    required this.imageUrl,
  });

  static List<ServiceCategoryModel> get categories => [
    ServiceCategoryModel(
      title: 'Oil & Lubricants',
      count: '1,240+ Items',
      imageUrl: AppAssets.engineOil,
    ),
    ServiceCategoryModel(
      title: 'Batteries',
      count: '450+ Items',
      imageUrl: AppAssets.battery,
    ),
    ServiceCategoryModel(
      title: 'Brake Parts',
      count: '890+ Items',
      imageUrl: AppAssets.brakeParts,
    ),
    ServiceCategoryModel(
      title: 'Tires & Rims',
      count: '2,100+ Items',
      imageUrl: AppAssets.tires,
    ),
    ServiceCategoryModel(
      title: 'Engine Parts',
      count: '3,400+ Items',
      imageUrl: AppAssets.engineParts,
    ),
  ];
}
