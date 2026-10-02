class FuelStationModel {
  final String name;
  final String logoUrl;
  final double rating;
  final String distance;
  final double pricePerLiter;

  FuelStationModel({
    required this.name,
    required this.logoUrl,
    required this.rating,
    required this.distance,
    required this.pricePerLiter,
  });

  static List<FuelStationModel> get dummyStations => [
    FuelStationModel(
      name: 'Has',
      logoUrl: 'assets/images/Has_petrol.png',
      rating: 4.8,
      distance: '1.2 km away',
      pricePerLiter: 1.45,
    ),
    FuelStationModel(
      name: 'Somoil',
      logoUrl: 'assets/images/station_logo.png',
      rating: 4.5,
      distance: '2.8 km away',
      pricePerLiter: 1.42,
    ),
    FuelStationModel(
      name: 'EA Energy',
      logoUrl: 'assets/images/station_logo.png',
      rating: 4.9,
      distance: 'Tarbuunka',
      pricePerLiter: 1.48,
    ),
    FuelStationModel(
      name: 'Somagas',
      logoUrl: 'assets/images/station_logo.png',
      rating: 4.2,
      distance: '5.1 km away',
      pricePerLiter: 1.41,
    ),
  ];
}
