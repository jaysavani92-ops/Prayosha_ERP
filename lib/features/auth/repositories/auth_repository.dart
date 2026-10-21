import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_failure.dart';
import '../../../core/storage/session_storage.dart';
import '../models/user.dart';
import '../services/auth_service.dart';

/// Owns the session: the in-memory access token and the persisted refresh
/// token. ViewModels talk to this, never to [AuthService] directly.
class AuthRepository {
  AuthRepository(this._service, this._storage);

  final AuthService _service;
  final SessionStorage _storage;

  String? _accessToken;
  Future<String?>? _refreshInFlight;

  String? get accessToken => _accessToken;

  Future<User> signIn({required String username, required String password}) async {
    final result = await _service.login(username: username, password: password);
    _accessToken = result.tokens.accessToken;
    final refreshToken = result.tokens.refreshToken;
    if (refreshToken != null) await _storage.writeRefreshToken(refreshToken);
    return result.user;
  }

  /// Restores a session at startup (or after a browser refresh) from the
  /// refresh token. Returns null when there is no valid session.
  Future<User?> restoreSession() async {
    try {
      final token = await refreshAccessToken();
      if (token == null) return null;
      return await _service.me(token);
    } on ApiFailure {
      // Offline or server trouble: show sign-in; the stored refresh token is
      // kept so the next attempt can still restore the session.
      _accessToken = null;
      return null;
    }
  }

  /// Exchanges the refresh token for a new access token. Concurrent callers
  /// share one request: the API rotates refresh tokens on every use, so two
  /// parallel refreshes would invalidate each other.
  Future<String?> refreshAccessToken() => _refreshInFlight ??= _refresh().whenComplete(() => _refreshInFlight = null);

  Future<String?> _refresh() async {
    final stored = await _storage.readRefreshToken();
    if (!_storage.managedByPlatform && stored == null) return null;
    try {
      final tokens = await _service.refresh(refreshToken: stored);
      _accessToken = tokens.accessToken;
      final rotated = tokens.refreshToken;
      if (rotated != null) await _storage.writeRefreshToken(rotated);
      return _accessToken;
    } on ApiFailure catch (failure) {
      if (failure.kind == FailureKind.unauthorized) {
        _accessToken = null;
        await _storage.clear();
        return null;
      }
      rethrow;
    }
  }

  Future<void> signOut() async {
    final stored = await _storage.readRefreshToken();
    _accessToken = null;
    try {
      await _service.logout(refreshToken: stored);
    } on ApiFailure {
      // Signing out locally must always succeed; the server session expires on its own.
    } finally {
      await _storage.clear();
    }
  }

  /// Forget the session locally (e.g. the server rejected it).
  Future<void> clearLocalSession() async {
    _accessToken = null;
    await _storage.clear();
  }
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(authServiceProvider), ref.watch(sessionStorageProvider)),
);
