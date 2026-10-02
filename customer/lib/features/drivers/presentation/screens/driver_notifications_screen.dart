import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/routes/app_routes.dart';
import '../../../../core/services/driver_offers_service.dart';
import '../../../../core/theme/theme_provider.dart';
import '../widgets/delivery_assignment_card.dart';

class DriverNotificationsScreen extends StatefulWidget {
  const DriverNotificationsScreen({super.key});

  @override
  State<DriverNotificationsScreen> createState() => _DriverNotificationsScreenState();
}

class _DriverNotificationsScreenState extends State<DriverNotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => DriverOffersService.instance.refresh());
  }

  @override
  Widget build(BuildContext context) {
    final isDark = context.watch<ThemeProvider>().isDarkMode;
    final bg = isDark ? AppColors.backgroundDark : AppColors.backgroundLight;
    final titleColor = isDark ? AppColors.textPrimaryDark : AppColors.textPrimary;

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        iconTheme: IconThemeData(color: titleColor),
        title: Text('Notifications', style: TextStyle(color: titleColor, fontWeight: FontWeight.bold)),
      ),
      body: SafeArea(
        child: AnimatedBuilder(
          animation: DriverOffersService.instance,
          builder: (context, _) {
            final offers = DriverOffersService.instance.offers;
            return RefreshIndicator(
              onRefresh: DriverOffersService.instance.refresh,
              color: AppColors.primary,
              child: offers.isEmpty
                  ? ListView(children: [
                      const SizedBox(height: 120),
                      _empty(titleColor),
                    ])
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                      children: [
                        Text('New Delivery Assignments',
                            style: TextStyle(color: titleColor, fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        ...offers.map((o) => DeliveryAssignmentCard(
                              offer: o,
                              onResponded: (action) {
                                if (action == 'accept') {
                                  Navigator.of(context).pushReplacementNamed(AppRoutes.driverDeliveries);
                                }
                              },
                            )),
                      ],
                    ),
            );
          },
        ),
      ),
    );
  }

  Widget _empty(Color titleColor) => Center(
        child: Column(
          children: [
            Container(
              width: 72, height: 72, alignment: Alignment.center,
              decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
              child: const Icon(Icons.notifications_none, color: AppColors.primary, size: 32),
            ),
            const SizedBox(height: 14),
            Text('No new assignments', style: TextStyle(color: titleColor, fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text('New delivery requests will appear here.',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
          ],
        ),
      );
}
