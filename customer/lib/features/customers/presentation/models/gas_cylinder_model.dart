class GasCylinderModel {
  final String label;
  final String weight;
  final String description;
  final double price;

  GasCylinderModel({
    required this.label,
    required this.weight,
    required this.description,
    required this.price,
  });

  static List<GasCylinderModel> get sizes => [
    GasCylinderModel(
      label: 'Small',
      weight: '11kg',
      description: 'Perfect for outdoor BBQs and small heaters',
      price: 25.0,
    ),
    GasCylinderModel(
      label: 'Medium',
      weight: '22kg',
      description: 'Best for regular residential cooking use',
      price: 45.0,
    ),
    GasCylinderModel(
      label: 'Large',
      weight: '44kg',
      description: 'Heavy duty for large families or businesses',
      price: 85.0,
    ),
  ];
}
