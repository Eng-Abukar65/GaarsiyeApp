import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_provider.dart';
import 'core/utils/app_navigator.dart';
import 'features/customers/presentation/screens/splash_screen.dart';
import 'features/customers/presentation/screens/login_screen.dart';
import 'features/customers/presentation/screens/sign_up_screen.dart';
import 'features/customers/presentation/screens/home_dashboard_screen.dart';
import 'features/customers/presentation/screens/select_service_screen.dart';
import 'features/customers/presentation/screens/select_fuel_station_screen.dart';
import 'features/customers/presentation/screens/select_fuel_type_screen.dart';
import 'features/customers/presentation/screens/diesel_selection_screen.dart';
import 'features/customers/presentation/screens/select_gas_station_screen.dart';
import 'features/customers/presentation/screens/gas_cylinder_selection_screen.dart';
import 'features/customers/presentation/screens/select_quantity/select_quantity_screen.dart';
import 'features/customers/presentation/screens/car_wash_service_screen.dart';
import 'features/customers/presentation/screens/car_wash_booking_screen.dart';
import 'features/customers/presentation/screens/car_wash_booking_details_screen.dart';
import 'features/customers/presentation/screens/select_delivery_location_screen.dart';
import 'features/customers/presentation/screens/delivery_location_choice_screen.dart';
import 'features/customers/presentation/screens/delivery_time_selection_screen.dart';
import 'features/customers/presentation/screens/payment_method_selection_screen.dart';
import 'features/customers/presentation/screens/price_summary_screen.dart';
import 'features/customers/presentation/screens/order_confirmation_screen.dart';
import 'features/customers/presentation/screens/order_status_screen.dart';
import 'features/customers/presentation/screens/live_driver_tracking_screen.dart';
import 'features/customers/presentation/screens/profile_screen.dart';
import 'features/customers/presentation/screens/order_history_screen.dart';
import 'features/customers/presentation/screens/notifications_screen.dart';
import 'features/customers/presentation/screens/shopping_cart_screen.dart';
import 'features/customers/presentation/screens/empty_cart_screen.dart';
import 'features/customers/presentation/screens/spare_parts_shop_screen.dart';
import 'features/customers/presentation/screens/product_details_screen.dart';
import 'features/customers/presentation/screens/rating_review_screen.dart';
import 'features/customers/presentation/screens/settings_screen.dart';
import 'features/customers/presentation/screens/personal_info_screen.dart';
import 'features/customers/presentation/screens/saved_addresses_screen.dart';
import 'features/customers/presentation/screens/payment_methods_screen.dart';
import 'features/customers/presentation/screens/offer_details_screen.dart';
import 'features/customers/presentation/screens/offers_list_screen.dart';
import 'features/customers/presentation/screens/location_onboarding_screen.dart';
import 'features/drivers/presentation/screens/driver_dashboard_screen.dart';
import 'features/drivers/presentation/screens/driver_notifications_screen.dart';
import 'core/services/driver_offers_service.dart';
import 'features/drivers/presentation/screens/assigned_deliveries_screen.dart';
import 'features/drivers/presentation/screens/delivery_details_screen.dart';
import 'features/drivers/presentation/screens/driver_profile_screen.dart';
import 'features/drivers/presentation/screens/driver_history_screen.dart';
import 'features/drivers/presentation/screens/driver_wallet_screen.dart';
import 'features/workers/presentation/screens/worker_dashboard_screen.dart';
import 'features/workers/presentation/screens/worker_jobs_screen.dart';
import 'features/workers/presentation/screens/worker_history_screen.dart';
import 'features/workers/presentation/screens/worker_profile_screen.dart';
import 'features/workers/presentation/screens/worker_job_details_screen.dart';
import 'features/workers/presentation/screens/worker_notifications_screen.dart';
import 'core/routes/app_routes.dart';




import 'core/utils/cart_service.dart';
import 'core/services/driver_presence_service.dart';
import 'core/services/customer_notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FirebaseMessaging.onBackgroundMessage(
    customerFirebaseMessagingBackgroundHandler,
  );
  await CartService.loadCart();
  final themeProvider = ThemeProvider();
  await themeProvider.loadTheme();
  await DriverPresenceService.instance.startIfDriver();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: themeProvider),
        ChangeNotifierProvider.value(value: DriverOffersService.instance),
        ChangeNotifierProvider(create: (_) => CustomerNotificationService()),
      ],
      child: const DeliveryApp(),
    ),
  );
}

class DeliveryApp extends StatelessWidget {
  const DeliveryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<ThemeProvider>(
      builder: (context, themeProvider, child) {
        return MaterialApp(
          title: 'Garsiis Delivery App',
          debugShowCheckedModeBanner: false,
          navigatorKey: rootNavigatorKey,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: themeProvider.themeMode,
          themeAnimationDuration: const Duration(milliseconds: 250),
          themeAnimationCurve: Curves.easeInOut,
          initialRoute: AppRoutes.splash,
          onGenerateRoute: (settings) {
            final routesMap = <String, WidgetBuilder>{
              AppRoutes.splash: (context) => const SplashScreen(),
              AppRoutes.login: (context) => const LoginScreen(),
              AppRoutes.signup: (context) => const SignUpScreen(),
              AppRoutes.home: (context) => const HomeDashboardScreen(),
              AppRoutes.selectService: (context) => const SelectServiceScreen(),
              AppRoutes.selectStation: (context) =>
                  const SelectFuelStationScreen(),
              AppRoutes.selectFuelType: (context) => const SelectFuelTypeScreen(),
              AppRoutes.dieselSelection: (context) =>
                  const DieselSelectionScreen(),
              AppRoutes.selectGasStation: (context) =>
                  const SelectGasStationScreen(),
              AppRoutes.gasCylinderSelection: (context) =>
                  const GasCylinderSelectionScreen(),
              AppRoutes.selectQuantity: (context) => const SelectQuantityScreen(),
              AppRoutes.carWashServices: (context) =>
                  const CarWashServiceScreen(),
              AppRoutes.carWashBooking: (context) =>
                  const CarWashBookingScreen(),
              AppRoutes.carWashBookingDetails: (context) =>
                  const CarWashBookingDetailsScreen(),
              AppRoutes.selectLocation: (context) =>
                  const SelectDeliveryLocationScreen(),
              AppRoutes.deliveryLocationChoice: (context) =>
                  const DeliveryLocationChoiceScreen(),
              AppRoutes.deliveryTime: (context) =>
                  const DeliveryTimeSelectionScreen(),
              AppRoutes.payment: (context) =>
                  const PaymentMethodSelectionScreen(),
              AppRoutes.priceSummary: (context) => const PriceSummaryScreen(),
              AppRoutes.confirmation: (context) =>
                  const OrderConfirmationScreen(),
              AppRoutes.status: (context) => const OrderStatusScreen(),
              AppRoutes.liveTracking: (context) =>
                  const LiveDriverTrackingScreen(),
              AppRoutes.profile: (context) => const ProfileScreen(),
              AppRoutes.history: (context) => const OrderHistoryScreen(),
              AppRoutes.notifications: (context) => const NotificationsScreen(),
              AppRoutes.cart: (context) => const ShoppingCartScreen(),
              AppRoutes.emptyCart: (context) => const EmptyCartScreen(),
              AppRoutes.spareParts: (context) => const SparePartsShopScreen(),
              AppRoutes.productDetails: (context) => const ProductDetailsScreen(),
              AppRoutes.ratingReview: (context) => const RatingReviewScreen(),
              AppRoutes.settings: (context) => const SettingsScreen(),
              AppRoutes.personalInfo: (context) => const PersonalInfoScreen(),
              AppRoutes.savedAddresses: (context) => const SavedAddressesScreen(),
              AppRoutes.paymentMethods: (context) => const PaymentMethodsScreen(),
              AppRoutes.offerDetails: (context) => const OfferDetailsScreen(),
              AppRoutes.offersList: (context) => const OffersListScreen(),
              AppRoutes.locationOnboarding: (context) =>
                  const LocationOnboardingScreen(),

              // Driver Routes
              AppRoutes.driverDashboard: (context) =>
                  const DriverDashboardScreen(),
              AppRoutes.driverDeliveries: (context) =>
                  const AssignedDeliveriesScreen(),
              AppRoutes.driverDeliveryDetails: (context) =>
                  const DeliveryDetailsScreen(),
              AppRoutes.driverProfile: (context) => const DriverProfileScreen(),
              AppRoutes.driverHistory: (context) => const DriverHistoryScreen(),
              AppRoutes.driverWallet: (context) => const EarningsWalletScreen(),
              AppRoutes.driverNotifications: (context) =>
                  const DriverNotificationsScreen(),

              // Worker Routes
              AppRoutes.workerDashboard: (context) =>
                  const WorkerDashboardScreen(),
              AppRoutes.workerJobs: (context) =>
                  const WorkerJobsScreen(),
              AppRoutes.workerHistory: (context) =>
                  const WorkerHistoryScreen(),
              AppRoutes.workerProfile: (context) =>
                  const WorkerProfileScreen(),
              AppRoutes.workerJobDetails: (context) =>
                  const WorkerJobDetailsScreen(),
              AppRoutes.workerNotifications: (context) =>
                  const WorkerNotificationsScreen(),
            };

            final builder = routesMap[settings.name];
            if (builder == null) return null;

            return PageRouteBuilder(
              settings: settings,
              transitionDuration: const Duration(milliseconds: 280),
              reverseTransitionDuration: const Duration(milliseconds: 280),
              pageBuilder: (context, animation, secondaryAnimation) =>
                  builder(context),
              transitionsBuilder: (context, animation, secondaryAnimation, child) {
                // 1. Forward transition: Entering screen slides right-to-left (Offset(0.08, 0) -> Offset.zero) + Fade in
                final forwardSlide = Tween<Offset>(
                  begin: const Offset(0.08, 0.0),
                  end: Offset.zero,
                ).animate(
                  CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
                );

                final forwardFade = Tween<double>(begin: 0.0, end: 1.0).animate(
                  CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
                );

                // 2. Reverse transition: Returning to Home screen applies subtle zoom-out (Scale 1.03 -> 1.00) + Light fade
                final secondaryScale = Tween<double>(begin: 1.0, end: 1.03).animate(
                  CurvedAnimation(
                    parent: secondaryAnimation,
                    curve: Curves.easeOutCubic,
                  ),
                );

                final secondaryFade = Tween<double>(begin: 1.0, end: 0.94).animate(
                  CurvedAnimation(
                    parent: secondaryAnimation,
                    curve: Curves.easeOutCubic,
                  ),
                );

                return SlideTransition(
                  position: forwardSlide,
                  child: FadeTransition(
                    opacity: forwardFade,
                    child: ScaleTransition(
                      scale: secondaryScale,
                      child: FadeTransition(
                        opacity: secondaryFade,
                        child: child,
                      ),
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}



