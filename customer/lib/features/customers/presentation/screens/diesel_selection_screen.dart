import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:deliveryapp/core/theme/theme_provider.dart';
import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_spacing.dart';
import '../../../../shared/widgets/custom_button.dart';
import '../models/fuel_type_model.dart';
import '../../../../core/routes/app_routes.dart';

class DieselSelectionScreen extends StatefulWidget {
  const DieselSelectionScreen({super.key});

  @override
  State<DieselSelectionScreen> createState() => _DieselSelectionScreenState();
}

class _DieselSelectionScreenState extends State<DieselSelectionScreen> {
  int _selectedOptionIndex = 0;

  @override
  Widget build(BuildContext context) {
    Provider.of<ThemeProvider>(context); // listen for theme changes
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar
            _buildAppBar(context),
            
            // Progress Indicator
            _buildProgressIndicator(),
            
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.m),
                child: Column(
                  children: [
                    // Hero Section/Visual
                    _buildHeroVisual(),
                    
                    // Fuel Options
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.l),
                      child: Column(
                        children: List.generate(
                          FuelTypeModel.dieselOptions.length,
                          (index) => _buildFuelOption(index, FuelTypeModel.dieselOptions[index]),
                        ),
                      ),
                    ),
                    
                    // Disclaimer
                    _buildDisclaimer(),
                  ],
                ),
              ),
            ),
            
            // Footer Action
            _buildFooter(context),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.m),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.arrow_back, color: Colors.white),
          ),
          const Expanded(
            child: Text(
              'Diesel Delivery',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 48), // Balance for back button
        ],
      ),
    );
  }

  Widget _buildProgressIndicator() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Ordering Progress',
                style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
              ),
              const Text(
                'Step 1 of 3',
                style: TextStyle(color: AppColors.primary, fontSize: 13, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
            child: LinearProgressIndicator(
              value: 0.33,
              backgroundColor: AppColors.surfaceDark.withOpacity(0.3),
              color: AppColors.primary,
              minHeight: 6,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroVisual() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Container(
        height: 160,
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.primary.withOpacity(0.2), AppColors.primary.withOpacity(0.05)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(color: AppColors.borderDark.withOpacity(0.5)),
        ),
        child: Stack(
          children: [
            Center(
              child: Icon(Icons.ev_station, size: 80, color: AppColors.primary.withOpacity(0.3)),
            ),
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Choose your fuel',
                    style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'Select the best option for your vehicle',
                    style: TextStyle(color: AppColors.textSecondaryDark, fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFuelOption(int index, FuelTypeModel option) {
    final isSelected = _selectedOptionIndex == index;
    return GestureDetector(
      onTap: () => setState(() => _selectedOptionIndex = index),
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.m),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary.withOpacity(0.05) : Colors.transparent,
          borderRadius: BorderRadius.circular(AppSpacing.radiusXL),
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.borderDark.withOpacity(0.5),
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Radio(
              value: index,
              groupValue: _selectedOptionIndex,
              onChanged: (val) => setState(() => _selectedOptionIndex = val as int),
              activeColor: AppColors.primary,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          option.name,
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.s),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: isSelected 
                            ? AppColors.primary.withOpacity(0.2) 
                            : AppColors.surfaceDark.withOpacity(0.5),
                          borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                        ),
                        child: Text(
                          option.tag,
                          style: TextStyle(
                            color: isSelected ? Colors.white : AppColors.textSecondaryDark,
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Text(
                        '\$',
                        style: TextStyle(color: AppColors.primary, fontSize: 14, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        option.pricePerLiter.toStringAsFixed(2),
                        style: const TextStyle(color: AppColors.primary, fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const Text(
                        ' / litre',
                        style: TextStyle(color: Colors.grey, fontSize: 11),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.surfaceDark.withOpacity(0.5),
                borderRadius: BorderRadius.circular(AppSpacing.radiusM),
              ),
              child: Icon(option.icon, color: AppColors.textSecondaryDark, size: 20),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDisclaimer() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.l),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.m),
        decoration: BoxDecoration(
          color: AppColors.surfaceDark.withOpacity(0.3),
          borderRadius: BorderRadius.circular(AppSpacing.radiusL),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info, color: AppColors.textSecondaryDark, size: 16),
            const SizedBox(width: 8),
            const Expanded(
              child: Text(
                'Prices are updated every hour based on market rates. Delivery fees will be calculated at the final step.',
                style: TextStyle(color: Colors.grey, fontSize: 11, height: 1.4),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.l),
      child: CustomButton(
        text: 'Continue to Amount',
        onPressed: () => Navigator.pushNamed(context, AppRoutes.selectQuantity),
        icon: const Icon(Icons.arrow_forward, color: Colors.white, size: 20),
      ),
    );
  }
}
