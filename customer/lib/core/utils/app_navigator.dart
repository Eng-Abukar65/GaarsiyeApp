import 'package:flutter/widgets.dart';

/// App-wide navigator key so background services (e.g. the driver socket
/// listener) can show dialogs / navigate without a local BuildContext.
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// The current context of the root navigator, if the app is mounted.
BuildContext? get rootContext => rootNavigatorKey.currentContext;
