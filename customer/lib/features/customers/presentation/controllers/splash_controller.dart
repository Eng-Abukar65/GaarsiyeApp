import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../../../../core/services/initialization_service.dart';

class SplashController extends ChangeNotifier {
  SplashController({required InitializationService initializationService})
    : _initializationService = initializationService;

  final InitializationService _initializationService;

  double _progress = 0;
  String _message = 'Initializing...';
  String? _errorMessage;
  String? _nextRoute;
  bool _isLoading = false;

  double get progress => _progress;
  String get message => _message;
  String? get errorMessage => _errorMessage;
  String? get nextRoute => _nextRoute;
  bool get isLoading => _isLoading;
  bool get hasError => _errorMessage != null;

  Future<void> start() async {
    if (_isLoading) {
      return;
    }

    _progress = 0;
    _message = 'Initializing...';
    _errorMessage = null;
    _nextRoute = null;
    _isLoading = true;
    notifyListeners();

    try {
      final result = await _initializationService.initialize(
        onProgress: _setProgress,
      );
      _nextRoute = result.nextRoute;
      _isLoading = false;
      notifyListeners();
    } on InitializationException catch (e) {
      _showError(e.message);
    } catch (e) {
      debugPrint('Splash initialization failed: $e');
      _showError('Connection issue');
    }
  }

  Future<void> retry() => start();

  void _setProgress(String message, double progress) {
    _message = message;
    _progress = math.max(_progress, progress.clamp(0, 1));
    notifyListeners();
  }

  void _showError(String message) {
    _message = message;
    _errorMessage = message;
    _isLoading = false;
    _progress = math.max(_progress, 0.18);
    notifyListeners();
  }
}
