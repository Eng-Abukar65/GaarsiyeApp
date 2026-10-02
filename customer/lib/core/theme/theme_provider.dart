import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_theme.dart';

class ThemeProvider extends ChangeNotifier {
  static const String _themeKey = 'theme_mode';

  ThemeMode _themeMode = ThemeMode.light;

  ThemeMode get themeMode => _themeMode;
  ThemeData get currentTheme =>
      isDarkMode ? AppTheme.darkTheme : AppTheme.lightTheme;
  bool get isDarkMode => _themeMode == ThemeMode.dark;

  Future<void> loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final savedTheme = prefs.getString(_themeKey);
    final nextMode = savedTheme == 'dark' ? ThemeMode.dark : ThemeMode.light;
    if (_themeMode != nextMode) {
      _themeMode = nextMode;
      notifyListeners();
    }
  }

  Future<void> toggleTheme() async {
    await setThemeMode(isDarkMode ? ThemeMode.light : ThemeMode.dark);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final nextMode = mode == ThemeMode.dark ? ThemeMode.dark : ThemeMode.light;
    if (_themeMode == nextMode) {
      return;
    }

    _themeMode = nextMode;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeKey, isDarkMode ? 'dark' : 'light');
  }
}
