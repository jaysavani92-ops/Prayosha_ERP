import 'package:flutter/foundation.dart';

import '../../../core/network/json.dart';
import 'user.dart';

/// Result of `POST /api/v1/auth/refresh`.
@immutable
class AuthTokens {
  const AuthTokens({required this.accessToken, required this.expiresAt, this.refreshToken});

  factory AuthTokens.fromJson(JsonMap data, {String? refreshToken}) => AuthTokens(
    accessToken: data.string('accessToken'),
    expiresAt: data.dateTime('expiresAt'),
    refreshToken: refreshToken,
  );

  final String accessToken;
  final DateTime expiresAt;

  /// Only on mobile (read from Set-Cookie); browsers keep it in an httpOnly cookie.
  final String? refreshToken;
}

/// Result of `POST /api/v1/auth/login`.
@immutable
class LoginResult {
  const LoginResult({required this.tokens, required this.user});

  final AuthTokens tokens;
  final User user;
}
