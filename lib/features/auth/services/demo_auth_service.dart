import '../../../core/network/api_failure.dart';
import '../models/auth_tokens.dart';
import '../models/user.dart';
import 'auth_service.dart';

/// Sign-in for sample-data mode (`AppConfig.demoMode`): no network. Any
/// username and password sign in as [demoUser]; there is no session to
/// restore, so each launch starts at the sign-in screen.
class DemoAuthService implements AuthService {
  static final demoUser = User(
    id: 'demo-user',
    username: 'demo',
    displayName: 'Ramesh Patel',
    role: UserRole.siteEngineer,
    isActive: true,
    lastLoginAt: DateTime.now().subtract(const Duration(days: 1)),
    createdAt: DateTime(2026),
  );

  static AuthTokens get _tokens =>
      AuthTokens(accessToken: 'demo', expiresAt: DateTime.now().add(const Duration(hours: 12)));

  @override
  Future<LoginResult> login({required String username, required String password}) async =>
      LoginResult(tokens: _tokens, user: demoUser);

  @override
  Future<AuthTokens> refresh({String? refreshToken}) async => throw const ApiFailure(FailureKind.unauthorized);

  @override
  Future<User> me(String accessToken) async => demoUser;

  @override
  Future<void> logout({String? refreshToken}) async {}
}
