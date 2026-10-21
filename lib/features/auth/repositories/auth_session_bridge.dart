import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/authenticated_client.dart';
import '../viewmodels/auth_controller.dart';
import 'auth_repository.dart';

/// Connects the authenticated Dio client to the auth feature.
class AuthSessionBridge implements SessionBridge {
  AuthSessionBridge(this._ref);

  final Ref _ref;

  AuthRepository get _repository => _ref.read(authRepositoryProvider);

  @override
  String? get accessToken => _repository.accessToken;

  /// Null means the session is gone; transient failures (offline, 5xx)
  /// throw, so the interceptor keeps the session and reports the error.
  @override
  Future<String?> refreshAccessToken() => _repository.refreshAccessToken();

  @override
  void onSessionExpired() => _ref.read(authControllerProvider.notifier).onSessionExpired();
}
