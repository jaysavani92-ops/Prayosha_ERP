import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/user.dart';
import '../repositories/auth_repository.dart';

/// App-wide session state, watched by the router for redirects.
///
///   AsyncLoading    -> restoring the session at startup (splash)
///   AsyncData(null) -> signed out
///   AsyncData(user) -> signed in
class AuthController extends AsyncNotifier<User?> {
  /// Set when the session ended without the user asking (expired/revoked),
  /// so the sign-in screen can explain why.
  bool sessionExpired = false;

  @override
  Future<User?> build() => ref.read(authRepositoryProvider).restoreSession();

  /// Throws [ApiFailure] on failure; the login ViewModel presents it.
  Future<void> signIn({required String username, required String password}) async {
    final user = await ref.read(authRepositoryProvider).signIn(username: username, password: password);
    sessionExpired = false;
    state = AsyncData(user);
  }

  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).signOut();
    sessionExpired = false;
    state = const AsyncData(null);
  }

  /// Called by the network layer when a refresh fails mid-session.
  Future<void> onSessionExpired() async {
    if (state.value == null) return;
    await ref.read(authRepositoryProvider).clearLocalSession();
    sessionExpired = true;
    state = const AsyncData(null);
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, User?>(AuthController.new);
