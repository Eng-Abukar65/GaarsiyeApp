class MapTileConfig {
  static const String mapboxAccessToken = String.fromEnvironment(
    'MAPBOX_ACCESS_TOKEN',
  );
  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
  );

  static String get urlTemplate {
    if (mapboxAccessToken.isNotEmpty) {
      return 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=$mapboxAccessToken';
    } else if (googleMapsApiKey.isNotEmpty) {
      return 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=$googleMapsApiKey';
    } else {
      return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
  }

  static List<String> get subdomains {
    return const [];
  }

  static bool get needsColorInversion {
    return false;
  }
}
