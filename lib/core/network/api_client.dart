import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';

/// Creates a Dio instance with the shared base configuration.
///
/// `withCredentials` makes browsers send the API's httpOnly refresh cookie on
/// cross-origin requests to the auth endpoints (the API allows credentials
/// only for its configured CORS origins). It has no effect on mobile.
Dio createDio({String baseUrl = AppConfig.apiBaseUrl}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: AppConfig.connectTimeout,
      receiveTimeout: AppConfig.receiveTimeout,
      sendTimeout: kIsWeb ? null : AppConfig.receiveTimeout,
      responseType: ResponseType.json,
      headers: {'accept': 'application/json'},
      extra: {'withCredentials': true},
    ),
  );
  return dio;
}

/// Adds the access token, and on a 401 refreshes the session once and
/// retries the request. Concurrent 401s share a single refresh.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.dio,
    required this.accessToken,
    required this.refreshAccessToken,
    required this.onSessionExpired,
  });

  final Dio dio;
  final String? Function() accessToken;

  /// Returns a new access token, null if the session is gone (signs out),
  /// or throws on a transient failure (the session is kept).
  final Future<String?> Function() refreshAccessToken;
  final void Function() onSessionExpired;

  static const _retriedKey = 'auth.retried';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = accessToken();
    if (token != null) options.headers['authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final request = err.requestOptions;
    final isUnauthorized = err.response?.statusCode == 401;
    if (!isUnauthorized || request.extra[_retriedKey] == true) {
      return handler.next(err);
    }
    final String? token;
    try {
      token = await refreshAccessToken();
    } catch (_) {
      return handler.next(err);
    }
    if (token == null) {
      onSessionExpired();
      return handler.next(err);
    }
    request
      ..headers['authorization'] = 'Bearer $token'
      ..extra[_retriedKey] = true;
    try {
      handler.resolve(await dio.fetch<dynamic>(request));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
