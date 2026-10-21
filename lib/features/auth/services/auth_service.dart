import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_failure.dart';
import '../../../core/network/json.dart';
import '../models/auth_tokens.dart';
import '../models/user.dart';

/// HTTP calls to the Prayosha API auth endpoints (`/api/v1/auth/*`, see
/// docs/api-guidelines.md on the backend branch). Uses a Dio instance without
/// the auth interceptor, so refreshing can never recurse into itself.
class AuthService {
  AuthService(this._dio, {bool? isWeb}) : _isWeb = isWeb ?? kIsWeb;

  final Dio _dio;
  final bool _isWeb;

  /// Must match the API's refresh cookie name.
  static const refreshCookieName = 'prayosha_rt';

  Future<LoginResult> login({required String username, required String password}) async {
    final response = await _call(
      () => _dio.post<dynamic>('/api/v1/auth/login', data: {'username': username, 'password': password}),
    );
    return _decode(() {
      final data = asJsonMap(response.data).object('data');
      return LoginResult(
        tokens: AuthTokens.fromJson(data, refreshToken: _refreshTokenFrom(response)),
        user: User.fromJson(data.object('user')),
      );
    });
  }

  Future<AuthTokens> refresh({String? refreshToken}) async {
    final response = await _call(
      () => _dio.post<dynamic>('/api/v1/auth/refresh', options: _cookieOptions(refreshToken)),
    );
    return _decode(
      () => AuthTokens.fromJson(asJsonMap(response.data).object('data'), refreshToken: _refreshTokenFrom(response)),
    );
  }

  Future<void> logout({String? refreshToken}) async {
    await _call(() => _dio.post<dynamic>('/api/v1/auth/logout', options: _cookieOptions(refreshToken)));
  }

  Future<User> me(String accessToken) async {
    final response = await _call(
      () => _dio.get<dynamic>('/api/v1/auth/me', options: Options(headers: {'authorization': 'Bearer $accessToken'})),
    );
    return _decode(() => User.fromJson(asJsonMap(response.data).object('data')));
  }

  /// Mobile has no browser cookie jar, so the refresh cookie is sent by hand.
  /// Browsers forbid setting `Cookie`; they attach the httpOnly cookie themselves.
  Options? _cookieOptions(String? refreshToken) {
    if (_isWeb || refreshToken == null) return null;
    return Options(headers: {'cookie': '$refreshCookieName=$refreshToken'});
  }

  String? _refreshTokenFrom(Response<dynamic> response) {
    if (_isWeb) return null;
    for (final header in response.headers.map['set-cookie'] ?? const <String>[]) {
      final pair = header.split(';').first.trim();
      if (pair.startsWith('$refreshCookieName=')) {
        final value = pair.substring(refreshCookieName.length + 1);
        return value.isEmpty ? null : value;
      }
    }
    return null;
  }

  Future<Response<dynamic>> _call(Future<Response<dynamic>> Function() request) async {
    try {
      return await request();
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    }
  }

  T _decode<T>(T Function() decode) {
    try {
      return decode();
    } on FormatException {
      throw const ApiFailure(FailureKind.invalidResponse);
    }
  }
}

final authServiceProvider = Provider<AuthService>((ref) => AuthService(createDio()));
