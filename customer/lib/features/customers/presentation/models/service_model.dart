import '../../../../core/constants/app_assets.dart';

class ServiceModel {
  final String title;
  final String subtitle;
  final String imageUrl;

  ServiceModel({
    required this.title,
    required this.subtitle,
    required this.imageUrl,
  });

  static List<ServiceModel> get services => [
    ServiceModel(
      title: 'Fuel Delivery',
      subtitle: 'On-demand petrol & diesel',
      imageUrl: AppAssets.petrolIcon,
    ),
    ServiceModel(
      title: 'Gas Cylinder',
      subtitle: 'Cooking gas delivered',
      imageUrl: AppAssets.gasCylinder,
    ),
    ServiceModel(
      title: 'Spare Parts',
      subtitle: 'Premium auto components',
      imageUrl: AppAssets.spareParts,
    ),
    ServiceModel(
      title: 'Battery Service',
      subtitle: 'Tests & replacements',
      imageUrl: AppAssets.battery,
    ),
    ServiceModel(
      title: 'Car Service',
      subtitle: 'Book a car service',
      imageUrl: AppAssets.battery,
    ),
  ];
}
