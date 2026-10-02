import 'package:flutter/material.dart';

class GaarsisLogo extends StatelessWidget {
  final double height;
  final bool? isDarkMode;

  const GaarsisLogo({
    super.key,
    this.height = 120,
    this.isDarkMode,
  });

  @override
  Widget build(BuildContext context) {
    final themeIsDark = isDarkMode ?? (Theme.of(context).brightness == Brightness.dark);
    final primaryAsset = themeIsDark
        ? 'assets/images/gaarsis_logo_dark.png'
        : 'assets/images/gaarsis_logo.png';
    final fallbackAsset = 'assets/images/gaarsis_logo.png';

    return Container(
      height: height,
      alignment: Alignment.center,
      color: Colors.transparent,
      child: Image.asset(
        primaryAsset,
        height: height,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) {
          return Image.asset(
            fallbackAsset,
            height: height,
            fit: BoxFit.contain,
            errorBuilder: (context, error, stackTrace) {
              return Icon(
                Icons.local_gas_station,
                size: height * 0.6,
                color: Theme.of(context).primaryColor,
              );
            },
          );
        },
      ),
    );
  }
}
