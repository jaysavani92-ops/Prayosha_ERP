import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the long-lived refresh token lives between app launches.
///
/// - Web: the API keeps it in an httpOnly cookie that JavaScript (and
///   therefore Dart) cannot read; the browser sends it automatically, so
///   nothing is stored by the app.
/// - Android/iOS: there is no browser cookie jar, so the token is kept in the
///   platform keystore/keychain via flutter_secure_storage.
///
/// The short-lived access token is never persisted; it lives in memory only.
abstract interface class SessionStorage {
  /// True when the platform manages the refresh token itself (web cookies).
  bool get managedByPlatform;

  Future<String?> readRefreshToken();
  Future<void> writeRefreshToken(String token);
  Future<void> clear();
}

class BrowserCookieSessionStorage implements SessionStorage {
  const BrowserCookieSessionStorage();

  @override
  bool get managedByPlatform => true;

  @override
  Future<String?> readRefreshToken() async => null;

  @override
  Future<void> writeRefreshToken(String token) async {}

  @override
  Future<void> clear() async {}
}

class SecureSessionStorage implements SessionStorage {
  SecureSessionStorage([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'auth.refreshToken';
  final FlutterSecureStorage _storage;

  @override
  bool get managedByPlatform => false;

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _key);

  @override
  Future<void> writeRefreshToken(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

final sessionStorageProvider = Provider<SessionStorage>(
  (ref) => kIsWeb ? const BrowserCookieSessionStorage() : SecureSessionStorage(),
);
