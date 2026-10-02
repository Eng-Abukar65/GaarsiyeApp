import 'package:flutter/material.dart';

class GoogleIdentityButton extends StatelessWidget {
  const GoogleIdentityButton({
    super.key,
    required this.clientId,
    required this.onIdToken,
    required this.onError,
    this.buttonWidth = 400,
    this.isDark = false,
  });

  final String clientId;
  final ValueChanged<String> onIdToken;
  final ValueChanged<Object> onError;
  final double buttonWidth;
  final bool isDark;

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
