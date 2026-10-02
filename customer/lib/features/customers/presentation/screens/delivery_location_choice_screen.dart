import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/utils/api_service.dart';
import '../../../../shared/widgets/custom_button.dart';

class DeliveryLocationChoiceScreen extends StatefulWidget {
  const DeliveryLocationChoiceScreen({super.key});

  @override
  State<DeliveryLocationChoiceScreen> createState() =>
      _DeliveryLocationChoiceScreenState();
}

class _DeliveryLocationChoiceScreenState
    extends State<DeliveryLocationChoiceScreen> {
  Map<String, dynamic> _args = <String, dynamic>{};
  Map<String, dynamic>? _savedLocation;
  String _phone = '';
  bool _isLoading = true;
  bool _isUsingCurrent = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final rawArgs = ModalRoute.of(context)?.settings.arguments;
    if (rawArgs is Map) {
      _args = Map<String, dynamic>.from(rawArgs);
    }
  }

  @override
  void initState() {
    super.initState();
    _loadSavedLocation();
  }

  Future<void> _loadSavedLocation() async {
    try {
      final responses = await Future.wait([
        ApiService.get('/customer/profile'),
        ApiService.get('/customer/location'),
      ]);

      if (responses[0].statusCode == 200) {
        final profile = jsonDecode(responses[0].body) as Map<String, dynamic>;
        _phone = (profile['phone'] ?? '').toString();
      }
      if (responses[1].statusCode == 200) {
        _savedLocation = jsonDecode(responses[1].body) as Map<String, dynamic>;
      }
    } catch (e) {
      debugPrint('Delivery location choice load failed: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<bool> _ensureLocationPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      _showMessage('Turn on Location Services first.');
      return false;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      _showMessage('Location permission was denied.');
      return false;
    }
    if (permission == LocationPermission.deniedForever) {
      _showMessage('Enable location permission from Android settings.');
      return false;
    }
    return true;
  }

  Future<Map<String, String>> _resolveLocationDetails(Position position) async {
    final fallbackAddress =
        'Lat ${position.latitude.toStringAsFixed(5)}, Lon ${position.longitude.toStringAsFixed(5)}';
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/reverse', {
        'format': 'jsonv2',
        'lat': position.latitude.toString(),
        'lon': position.longitude.toString(),
        'zoom': '18',
        'addressdetails': '1',
      });
      final response = await http
          .get(uri, headers: const {'User-Agent': 'GarsiisApp/1.0'})
          .timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) {
        return {'city': '', 'area': '', 'address': fallbackAddress};
      }

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final addressData = Map<String, dynamic>.from(
        (data['address'] as Map?) ?? const {},
      );
      final city =
          (addressData['city'] ??
                  addressData['town'] ??
                  addressData['village'] ??
                  addressData['state'] ??
                  '')
              .toString();
      final area =
          (addressData['suburb'] ??
                  addressData['neighbourhood'] ??
                  addressData['city_district'] ??
                  addressData['hamlet'] ??
                  city)
              .toString();
      final address = (data['display_name'] ?? '').toString();
      return {
        'city': city,
        'area': area,
        'address': address.isNotEmpty ? address : fallbackAddress,
      };
    } catch (e) {
      debugPrint('Reverse geocode failed in current location choice: $e');
      return {'city': '', 'area': '', 'address': fallbackAddress};
    }
  }

  Future<void> _useCurrentLocation() async {
    if (_isUsingCurrent) return;
    setState(() => _isUsingCurrent = true);
    try {
      if (!await _ensureLocationPermission()) return;
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      final resolvedLocation = await _resolveLocationDetails(position);
      final response = await ApiService.put('/customer/location', {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'city': resolvedLocation['city'],
        'area': resolvedLocation['area'],
        'address': resolvedLocation['address'],
      });
      if (!mounted) return;
      if (response.statusCode != 200 && response.statusCode != 201) {
        _showMessage('Could not save current location.');
        return;
      }

      Navigator.pushNamed(
        context,
        AppRoutes.payment,
        arguments: {
          ..._args,
          'delivery_address': resolvedLocation['address'],
          'delivery_city': resolvedLocation['city'],
          'delivery_area': resolvedLocation['area'],
          'customer_latitude': position.latitude,
          'customer_longitude': position.longitude,
          'delivery_phone': _phone,
          'delivery_addresses': [
            {
              'address_line': resolvedLocation['address'],
              'phone': _phone,
              'latitude': position.latitude,
              'longitude': position.longitude,
            },
          ],
        },
      );
    } catch (e) {
      debugPrint('Use current location failed: $e');
      if (mounted) _showMessage('Could not get your current location.');
    } finally {
      if (mounted) setState(() => _isUsingCurrent = false);
    }
  }

  void _goHome() {
    Navigator.pushNamedAndRemoveUntil(
      context,
      AppRoutes.home,
      (route) => false,
    );
  }

  void _chooseAnotherLocation() {
    Navigator.pushNamed(
      context,
      AppRoutes.selectLocation,
      arguments: {..._args, 'next_route': AppRoutes.payment},
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final address =
        (_savedLocation?['address'] ??
                _savedLocation?['area'] ??
                'Your current GPS position')
            .toString();

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: theme.scaffoldBackgroundColor,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: cs.onSurface),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Delivery Location',
          style: TextStyle(color: cs.onSurface, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            onPressed: _goHome,
            icon: Icon(Icons.home_outlined, color: cs.onSurface),
            tooltip: 'Home',
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.l),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Where should we deliver?',
                style: TextStyle(
                  color: cs.onSurface,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Choose whether we should use the location you are currently at, or a different delivery point.',
                style: TextStyle(
                  color: cs.onSurface.withAlpha(160),
                  height: 1.4,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              _buildChoiceCard(
                icon: Icons.my_location,
                title: 'Use my current location',
                subtitle: _isLoading ? 'Checking saved location...' : address,
                isLoading: _isUsingCurrent,
                onTap: _useCurrentLocation,
              ),
              const SizedBox(height: AppSpacing.m),
              _buildChoiceCard(
                icon: Icons.edit_location_alt_outlined,
                title: 'Choose another location',
                subtitle: 'Open the map and select a different address.',
                onTap: _chooseAnotherLocation,
              ),
              const Spacer(),
              CustomButton(
                text: _isUsingCurrent
                    ? 'Getting Location...'
                    : 'Continue with Current Location',
                onPressed: _isUsingCurrent ? null : _useCurrentLocation,
                icon: const Icon(Icons.arrow_forward, color: Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildChoiceCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    bool isLoading = false,
  }) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: isLoading ? null : onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.l),
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppColors.primary.withAlpha(70)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.primary.withAlpha(24),
                borderRadius: BorderRadius.circular(16),
              ),
              child: isLoading
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(icon, color: AppColors.primary),
            ),
            const SizedBox(width: AppSpacing.m),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: cs.onSurface,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: cs.onSurface.withAlpha(145),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: cs.onSurface.withAlpha(120)),
          ],
        ),
      ),
    );
  }
}
