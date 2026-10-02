import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/utils/api_service.dart';

class SavedAddressesScreen extends StatefulWidget {
  const SavedAddressesScreen({super.key});

  @override
  State<SavedAddressesScreen> createState() => _SavedAddressesScreenState();
}

class _SavedAddressesScreenState extends State<SavedAddressesScreen> {
  List<Map<String, dynamic>> _addresses = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchAddresses();
  }

  Future<void> _fetchAddresses() async {
    setState(() => _isLoading = true);
    try {
      final response = await ApiService.get('/customer/addresses');
      if (!mounted) return;
      if (response.statusCode == 200) {
        final List decoded = jsonDecode(response.body);
        setState(() {
          _addresses = decoded
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load addresses: ${response.statusCode}'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error loading addresses: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _deleteAddress(int addressId) async {
    try {
      final response = await ApiService.delete(
        '/customer/addresses/$addressId',
      );
      if (!mounted) return;
      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Address deleted successfully')),
        );
        _fetchAddresses();
      } else {
        String message = 'Failed to delete address: ${response.statusCode}';
        try {
          final body = jsonDecode(response.body);
          if (body is Map && body['message'] != null) {
            message = body['message'].toString();
          }
        } catch (_) {
          // Keep the status code fallback when the server does not return JSON.
        }
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error deleting address: $e')));
      }
    }
  }

  Future<void> _setDefaultAddress(int addressId) async {
    try {
      final response = await ApiService.patch(
        '/customer/addresses/$addressId/default',
        {},
      );
      if (!mounted) return;
      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Default address updated')),
        );
        _fetchAddresses();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to set default: ${response.statusCode}'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error setting default address: $e')),
        );
      }
    }
  }

  Future<Position?> _getCurrentGPSLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return null;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(const Duration(seconds: 10));
    } catch (e) {
      return null;
    }
  }

  void _showAddDialog({Map<String, dynamic>? editAddress}) {
    final isDark = Provider.of<ThemeProvider>(
      context,
      listen: false,
    ).isDarkMode;
    final labelCtrl = TextEditingController(
      text: editAddress != null ? editAddress['label'] : '',
    );
    final cityCtrl = TextEditingController(
      text: editAddress != null ? editAddress['city'] : '',
    );
    final areaCtrl = TextEditingController(
      text: editAddress != null ? editAddress['area'] : '',
    );
    final addressLineCtrl = TextEditingController(
      text: editAddress != null ? editAddress['address_line'] : '',
    );
    final phoneCtrl = TextEditingController(
      text: editAddress != null ? editAddress['phone'] ?? '' : '',
    );

    double? latitude = editAddress != null
        ? double.tryParse(editAddress['latitude']?.toString() ?? '')
        : null;
    double? longitude = editAddress != null
        ? double.tryParse(editAddress['longitude']?.toString() ?? '')
        : null;
    bool isDefault = editAddress != null
        ? (editAddress['is_default'] == 1 || editAddress['is_default'] == true)
        : false;

    bool isFetchingLocation = false;

    final bgColor = Theme.of(context).scaffoldBackgroundColor;
    final textPrimary = Theme.of(context).colorScheme.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final borderColor = isDark ? AppColors.borderDark : AppColors.border;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: bgColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          return ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(ctx).size.height * 0.9,
            ),
            child: AnimatedPadding(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 24,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(
                  editAddress != null ? 'Edit Address' : 'Add New Address',
                  style: TextStyle(
                    color: textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: AppSpacing.m),
                TextField(
                  controller: labelCtrl,
                  style: TextStyle(color: textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Label (e.g. Home, Work)',
                    labelStyle: TextStyle(color: textSecondary),
                    prefixIcon: Icon(Icons.label_outline, color: textSecondary),
                    filled: true,
                    fillColor: isDark
                        ? AppColors.surfaceDark
                        : Colors.grey.shade100,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                      borderSide: BorderSide(color: borderColor),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                      borderSide: BorderSide(color: borderColor),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                      borderSide: const BorderSide(
                        color: AppColors.primary,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.m),
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  style: TextStyle(color: textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Contact Phone Number',
                    labelStyle: TextStyle(color: textSecondary),
                    prefixIcon: Icon(
                      Icons.phone_outlined,
                      color: textSecondary,
                    ),
                    filled: true,
                    fillColor: isDark
                        ? AppColors.surfaceDark
                        : Colors.grey.shade100,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.m),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: cityCtrl,
                        style: TextStyle(color: textPrimary),
                        decoration: InputDecoration(
                          labelText: 'City',
                          labelStyle: TextStyle(color: textSecondary),
                          prefixIcon: Icon(
                            Icons.location_city,
                            color: textSecondary,
                          ),
                          filled: true,
                          fillColor: isDark
                              ? AppColors.surfaceDark
                              : Colors.grey.shade100,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              AppSpacing.radiusXL,
                            ),
                            borderSide: BorderSide(color: borderColor),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              AppSpacing.radiusXL,
                            ),
                            borderSide: BorderSide(color: borderColor),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              AppSpacing.radiusXL,
                            ),
                            borderSide: const BorderSide(
                              color: AppColors.primary,
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.s),
                    Expanded(
                      child: TextField(
                        controller: areaCtrl,
                        style: TextStyle(color: textPrimary),
                        decoration: InputDecoration(
                          labelText: 'Area / District',
                          labelStyle: TextStyle(color: textSecondary),
                          prefixIcon: Icon(
                            Icons.explore_outlined,
                            color: textSecondary,
                          ),
                          filled: true,
                          fillColor: isDark
                              ? AppColors.surfaceDark
                              : Colors.grey.shade100,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              AppSpacing.radiusXL,
                            ),
                            borderSide: BorderSide(color: borderColor),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              AppSpacing.radiusXL,
                            ),
                            borderSide: BorderSide(color: borderColor),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(
                              AppSpacing.radiusXL,
                            ),
                            borderSide: const BorderSide(
                              color: AppColors.primary,
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.m),
                TextField(
                  controller: addressLineCtrl,
                  style: TextStyle(color: textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Street / Address Line',
                    labelStyle: TextStyle(color: textSecondary),
                    prefixIcon: Icon(Icons.home_outlined, color: textSecondary),
                    filled: true,
                    fillColor: isDark
                        ? AppColors.surfaceDark
                        : Colors.grey.shade100,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                      borderSide: BorderSide(color: borderColor),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                      borderSide: BorderSide(color: borderColor),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                      borderSide: const BorderSide(
                        color: AppColors.primary,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.m),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(
                              AppSpacing.radiusXL,
                            ),
                          ),
                          side: BorderSide(
                            color: AppColors.primary.withOpacity(0.5),
                          ),
                        ),
                        onPressed: isFetchingLocation
                            ? null
                            : () async {
                                setModalState(() => isFetchingLocation = true);
                                final pos = await _getCurrentGPSLocation();
                                setModalState(() {
                                  isFetchingLocation = false;
                                  if (pos != null) {
                                    latitude = pos.latitude;
                                    longitude = pos.longitude;
                                  }
                                });
                              },
                        icon: isFetchingLocation
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: AppColors.primary,
                                ),
                              )
                            : const Icon(
                                Icons.gps_fixed,
                                color: AppColors.primary,
                              ),
                        label: Text(
                          isFetchingLocation
                              ? 'Getting GPS...'
                              : 'Use Current GPS',
                          style: const TextStyle(color: AppColors.primary),
                        ),
                      ),
                    ),
                    if (latitude != null && longitude != null) ...[
                      const SizedBox(width: AppSpacing.m),
                      Text(
                        'Saved: ${latitude!.toStringAsFixed(4)}, ${longitude!.toStringAsFixed(4)}',
                        style: TextStyle(color: textSecondary, fontSize: 12),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: AppSpacing.s),
                CheckboxListTile(
                  title: Text(
                    'Set as default address',
                    style: TextStyle(color: textPrimary, fontSize: 14),
                  ),
                  value: isDefault,
                  onChanged: (val) {
                    setModalState(() {
                      isDefault = val ?? false;
                    });
                  },
                  activeColor: AppColors.primary,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                ),
                const SizedBox(height: AppSpacing.m),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(
                          AppSpacing.radiusXL,
                        ),
                      ),
                    ),
                    onPressed: () async {
                      final label = labelCtrl.text.trim();
                      final city = cityCtrl.text.trim();
                      final area = areaCtrl.text.trim();
                      final addressLine = addressLineCtrl.text.trim();
                      final phone = phoneCtrl.text.trim();
                      if (label.isEmpty ||
                          city.isEmpty ||
                          area.isEmpty ||
                          addressLine.isEmpty ||
                          phone.isEmpty) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Please fill all required fields'),
                          ),
                        );
                        return;
                      }

                      Navigator.pop(ctx);
                      setState(() => _isLoading = true);

                      final payload = {
                        'label': label,
                        'city': city,
                        'area': area,
                        'address_line': addressLine,
                        'phone': phone,
                        'latitude': latitude,
                        'longitude': longitude,
                        'is_default': isDefault,
                      };

                      try {
                        final response = editAddress != null
                            ? await ApiService.put(
                                '/customer/addresses/${editAddress['id']}',
                                payload,
                              )
                            : await ApiService.post(
                                '/customer/addresses',
                                payload,
                              );

                        if (response.statusCode == 200 ||
                            response.statusCode == 201) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                editAddress != null
                                    ? 'Address updated'
                                    : 'Address added',
                              ),
                            ),
                          );
                          _fetchAddresses();
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                'Failed to save address: ${response.statusCode}',
                              ),
                            ),
                          );
                          setState(() => _isLoading = false);
                        }
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Error saving address: $e')),
                        );
                        setState(() => _isLoading = false);
                      }
                    },
                    child: Text(
                      editAddress != null ? 'Save Changes' : 'Add Address',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Provider.of<ThemeProvider>(context).isDarkMode;
    final theme = Theme.of(context);
    final bgColor = theme.scaffoldBackgroundColor;
    final textPrimary = theme.colorScheme.onSurface;
    final textSecondary = isDark
        ? AppColors.textSecondaryDark
        : AppColors.textSecondary;
    final tileColor = isDark
        ? AppColors.surfaceDark.withOpacity(0.5)
        : Colors.grey.shade100;

    return Scaffold(
      backgroundColor: bgColor,
      appBar: AppBar(
        backgroundColor: bgColor,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Saved Addresses',
          style: TextStyle(
            color: textPrimary,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
      ),
      body: SafeArea(
        child: _isLoading
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.primary),
              )
            : _addresses.isEmpty
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.location_off_outlined,
                      size: 64,
                      color: textSecondary.withOpacity(0.4),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No saved addresses yet',
                      style: TextStyle(color: textSecondary, fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Tap + to add your first address',
                      style: TextStyle(
                        color: textSecondary.withOpacity(0.6),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.all(AppSpacing.m),
                itemCount: _addresses.length,
                itemBuilder: (context, index) {
                  final addr = _addresses[index];
                  final label = addr['label'] ?? '';
                  final addressLine = addr['address_line'] ?? '';
                  final city = addr['city'] ?? '';
                  final area = addr['area'] ?? '';
                  final isDefault =
                      addr['is_default'] == 1 || addr['is_default'] == true;

                  final addressText = '$addressLine, $area, $city';

                  final iconData = label.toLowerCase().contains('home')
                      ? Icons.home_outlined
                      : label.toLowerCase().contains('work')
                      ? Icons.work_outline
                      : Icons.location_on_outlined;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: tileColor,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
                      border: isDefault
                          ? Border.all(color: AppColors.primary, width: 1.5)
                          : null,
                    ),
                    child: ListTile(
                      onTap: isDefault
                          ? null
                          : () => _setDefaultAddress(addr['id']),
                      leading: Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(
                            AppSpacing.radiusL,
                          ),
                        ),
                        child: Icon(
                          iconData,
                          color: AppColors.primary,
                          size: 20,
                        ),
                      ),
                      title: Row(
                        children: [
                          Text(
                            label,
                            style: TextStyle(
                              color: textPrimary,
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                          ),
                          if (isDefault) ...[
                            const SizedBox(width: AppSpacing.s),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.primary.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'DEFAULT',
                                style: TextStyle(
                                  color: AppColors.primary,
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      subtitle: Text(
                        addressText,
                        style: TextStyle(color: textSecondary, fontSize: 13),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: Icon(
                              Icons.edit_outlined,
                              color: textSecondary.withOpacity(0.6),
                              size: 20,
                            ),
                            onPressed: () => _showAddDialog(editAddress: addr),
                          ),
                          IconButton(
                            icon: const Icon(
                              Icons.delete_outline,
                              color: Colors.red,
                              size: 20,
                            ),
                            onPressed: () => _deleteAddress(addr['id']),
                          ),
                        ],
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(
                          AppSpacing.radiusXL,
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddDialog(),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
    );
  }
}
