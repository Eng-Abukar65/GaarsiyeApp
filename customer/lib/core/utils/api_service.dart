import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http_parser/http_parser.dart';

import '../constants/api_constants.dart';

class ApiService {
  static String _activeBaseUrl = _defaultBaseUrl;
  static Future<String>? _baseUrlResolution;
  static String? _lastConnectionError;

  static String get baseUrl {
    return _activeBaseUrl;
  }

  /// Debug-only logging.
  ///
  /// A release build must not write request payloads, response bodies or
  /// `Authorization` headers to logcat — on Android any process holding
  /// READ_LOGS, and any crash reporter, can read them back.
  static void _log(String message) {
    if (kDebugMode) {
      // ignore: avoid_print
      print(message);
    }
  }

  /// The URL used before any probing has happened, so screens that read
  /// [baseUrl] to build an image URL never see an empty string.
  static String get _defaultBaseUrl {
    final envUrl = ApiConstants.baseUrl.trim();
    if (envUrl.isNotEmpty) return envUrl;
    if (kReleaseMode) return ApiConstants.productionUrl;
    return ApiConstants.developmentBaseUrls.first;
  }

  static String get connectionErrorMessage =>
      _lastConnectionError ??
      'Cannot connect to the delivery server. Check your internet connection and try again.';

  /// Candidate base URLs in preference order.
  ///
  /// A release build resolves to exactly one URL. Probing a list of LAN
  /// addresses from a customer's phone is both slow and unsafe, so that only
  /// happens in debug builds.
  static List<String> get _candidateBaseUrls {
    final seen = <String>{};
    final List<String> urls = [];

    // 1. --dart-define=API_BASE_URL always wins.
    final envUrl = ApiConstants.baseUrl.trim();
    if (envUrl.isNotEmpty) {
      urls.add(envUrl);
    }

    if (kReleaseMode) {
      urls.add(ApiConstants.productionUrl);
    } else {
      urls.addAll(_runtimeBaseUrls);
      urls.addAll(ApiConstants.developmentBaseUrls);
    }

    return urls
        .map((url) => url.trim())
        .where((url) => url.isNotEmpty && seen.add(url))
        .toList(growable: false);
  }

  /// Debug-only: addresses derived from where the app is actually running.
  static List<String> get _runtimeBaseUrls {
    if (!kIsWeb) {
      if (defaultTargetPlatform == TargetPlatform.android) {
        return const ['http://10.0.2.2:5001/api'];
      }
      return const ['http://localhost:5001/api', 'http://127.0.0.1:5001/api'];
    }

    final host = Uri.base.host.trim();
    if (host.isEmpty) return const [];

    final scheme = Uri.base.scheme == 'https' ? 'https' : 'http';
    return [
      Uri(scheme: scheme, host: host, port: 5001, path: '/api').toString(),
    ];
  }

  static Uri _healthUri(String baseUrl) {
    final uri = Uri.parse(baseUrl);
    return uri.replace(path: '/health', query: null, fragment: null);
  }

  static Future<String> _resolveBaseUrl({bool forceRefresh = false}) {
    if (!forceRefresh && _baseUrlResolution != null) {
      return _baseUrlResolution!;
    }

    _baseUrlResolution = _findReachableBaseUrl();
    return _baseUrlResolution!;
  }

  static Future<String> _findReachableBaseUrl() async {
    if (kReleaseMode &&
        ApiConstants.baseUrl.trim().isEmpty &&
        !ApiConstants.isProductionUrlConfigured) {
      _lastConnectionError =
          'This build has no backend configured. Rebuild with '
          '--dart-define=API_BASE_URL=https://<your-backend>/api';
      throw StateError(_lastConnectionError!);
    }

    final candidates = _candidateBaseUrls;
    if (candidates.isEmpty) {
      throw StateError('No candidate backend URLs configured.');
    }

    final completer = Completer<String>();
    var pending = candidates.length;

    Future<void> probe(String candidate) async {
      try {
        final healthUrl = _healthUri(candidate);
        _log('DEBUG: Checking connection to $healthUrl...');
        final response = await http
            .get(healthUrl)
            .timeout(const Duration(seconds: 3));
        _log('DEBUG: Health check $candidate -> ${response.statusCode}');
        if (response.statusCode == 200 && !completer.isCompleted) {
          _lastConnectionError = null;
          completer.complete(candidate);
        }
      } catch (_) {
        // Individual failures are expected in parallel probing.
      } finally {
        pending -= 1;
        if (pending == 0 && !completer.isCompleted) {
          completer.completeError(
            StateError('No reachable backend server was found.'),
          );
        }
      }
    }

    for (final candidate in candidates) {
      unawaited(probe(candidate));
    }

    try {
      final reachable = await completer.future.timeout(
        const Duration(seconds: 5),
      );
      _activeBaseUrl = reachable;
      return reachable;
    } catch (_) {
      throw StateError('No reachable backend server was found.');
    }
  }

  static Future<bool> checkConnection() async {
    try {
      await _resolveBaseUrl(forceRefresh: true);
      _lastConnectionError = null;
      return true;
    } catch (e) {
      _log('Connection check failed: $e');
      if (kReleaseMode) {
        // Never surface internal hostnames to end users.
        _lastConnectionError ??=
            'Cannot reach the delivery server. Check your internet connection and try again.';
      } else {
        _lastConnectionError =
            'Cannot reach the delivery server. Tried: ${_candidateBaseUrls.join(', ')}. '
            'Make sure your phone is on the same Wi-Fi as the backend PC.';
      }
      return false;
    }
  }

  static Future<Map<String, String>> _getHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<http.Response> _sendWithBackendRetry(
    String method,
    String endpoint,
    Future<http.Response> Function(Uri url, Map<String, String> headers) send, {
    bool allowRetry = true,
  }) async {
    Future<http.Response> attempt({required bool forceRefresh}) async {
      final resolvedBaseUrl = await _resolveBaseUrl(forceRefresh: forceRefresh);
      final url = Uri.parse('$resolvedBaseUrl$endpoint');
      final headers = await _getHeaders();
      _log('DEBUG: [$method] $url');
      return send(url, headers);
    }

    try {
      return await attempt(forceRefresh: false);
    } catch (e) {
      _baseUrlResolution = null;
      _log('DEBUG: [$method] failed ($e)');
      if (!allowRetry) rethrow;
      _log('DEBUG: [$method] re-probing backend URL...');
      return attempt(forceRefresh: true);
    }
  }

  static Future<http.Response> post(
    String endpoint,
    Map<String, dynamic> body, {
    Duration timeout = const Duration(seconds: 60),
  }) async {
    return _sendWithBackendRetry(
      'POST',
      endpoint,
      (url, headers) async {
        _log('DEBUG: Payload: ${jsonEncode(body)}');
        final response = await http
            .post(url, headers: headers, body: jsonEncode(body))
            .timeout(timeout);
        _log('DEBUG: [RESPONSE] ${response.statusCode} from $endpoint');
        if (response.statusCode != 200 && response.statusCode != 201) {
          _log('DEBUG: [ERROR BODY] ${response.body}');
        }
        return response;
      },
      allowRetry: false,
    );
  }

  static Future<http.Response> get(String endpoint) async {
    return _sendWithBackendRetry('GET', endpoint, (url, headers) async {
      final response = await http
          .get(url, headers: headers)
          .timeout(const Duration(seconds: 10));
      _log('DEBUG: Status: ${response.statusCode}');
      return response;
    });
  }

  static Future<http.Response> patch(
    String endpoint,
    Map<String, dynamic> body,
  ) async {
    return _sendWithBackendRetry('PATCH', endpoint, (url, headers) async {
      _log('DEBUG: Body: ${jsonEncode(body)}');
      final response = await http
          .patch(url, headers: headers, body: jsonEncode(body))
          .timeout(const Duration(seconds: 10));
      _log('DEBUG: Status: ${response.statusCode}');
      return response;
    });
  }

  static Future<http.Response> put(
    String endpoint,
    Map<String, dynamic> body,
  ) async {
    return _sendWithBackendRetry('PUT', endpoint, (url, headers) async {
      _log('DEBUG: Body: ${jsonEncode(body)}');
      final response = await http
          .put(url, headers: headers, body: jsonEncode(body))
          .timeout(const Duration(seconds: 10));
      _log('DEBUG: Status: ${response.statusCode}');
      return response;
    });
  }

  static Future<http.Response> delete(String endpoint) async {
    return _sendWithBackendRetry('DELETE', endpoint, (url, headers) async {
      final response = await http
          .delete(url, headers: headers)
          .timeout(const Duration(seconds: 10));
      _log('DEBUG: Status: ${response.statusCode}');
      return response;
    });
  }

  static Future<http.Response> uploadFileBytes(
    String endpoint,
    String fileField,
    List<int> bytes,
    String filename,
  ) async {
    final resolvedBaseUrl = await _resolveBaseUrl();
    final url = Uri.parse('$resolvedBaseUrl$endpoint');
    final headers = await _getHeaders();
    headers.remove(
      'Content-Type',
    ); // Let multipart set its own content type and boundary

    // Derive correct MIME type from file extension
    final ext = filename.toLowerCase().split('.').last;
    final mimeType =
        {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'webp': 'image/webp',
        }[ext] ??
        'image/jpeg';

    var request = http.MultipartRequest('POST', url);
    request.headers.addAll(headers);
    request.files.add(
      http.MultipartFile.fromBytes(
        fileField,
        bytes,
        filename: filename,
        contentType: MediaType.parse(mimeType),
      ),
    );

    _log(
      'DEBUG: [MULTIPART UPLOAD] $url  mime=$mimeType  size=${bytes.length}',
    );
    try {
      final streamedResponse = await request.send();
      return await http.Response.fromStream(streamedResponse);
    } catch (e) {
      _log('DEBUG: Error in MULTIPART UPLOAD: $e');
      rethrow;
    }
  }
}
