import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../utils/api_service.dart';

class GoogleAuthService {
  GoogleAuthService._();

  static Future<void>? _initializeFuture;

  static Future<void> initialize() {
    _initializeFuture ??= _initialize();
    return _initializeFuture!;
  }

  static Future<void> _initialize() {
    if (kIsWeb) {
      return Future<void>.value();
    }

    const clientId = String.fromEnvironment('GOOGLE_CLIENT_ID');
    const serverClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');
    final resolvedClientId = clientId.isEmpty ? null : clientId;
    final resolvedServerClientId = serverClientId.isNotEmpty
        ? serverClientId
        : resolvedClientId;

    return GoogleSignIn.instance.initialize(
      clientId: resolvedClientId,
      serverClientId: kIsWeb ? null : resolvedServerClientId,
    );
  }

  static Future<String?> loadWebClientId() async {
    const clientId = String.fromEnvironment('GOOGLE_CLIENT_ID');
    if (clientId.trim().isNotEmpty) {
      return clientId.trim();
    }

    final response = await ApiService.get('/auth/google/config');
    if (response.statusCode != 200) {
      return null;
    }

    final data = jsonDecode(response.body);
    if (data is! Map || data['configured'] != true) {
      return null;
    }

    final configuredClientId = data['clientId']?.toString().trim();
    return configuredClientId == null || configuredClientId.isEmpty
        ? null
        : configuredClientId;
  }
}
