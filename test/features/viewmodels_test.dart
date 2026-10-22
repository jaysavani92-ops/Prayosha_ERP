import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/app/router/app_router.dart';
import 'package:prayosha_erp/core/config/app_config.dart';
import 'package:prayosha_erp/core/network/api_failure.dart';
import 'package:prayosha_erp/core/storage/session_storage.dart';
import 'package:prayosha_erp/core/validation/validators.dart';
import 'package:prayosha_erp/features/auth/models/auth_tokens.dart';
import 'package:prayosha_erp/features/auth/models/user.dart';
import 'package:prayosha_erp/features/auth/services/auth_service.dart';
import 'package:prayosha_erp/features/auth/viewmodels/auth_controller.dart';
import 'package:prayosha_erp/features/auth/viewmodels/login_view_model.dart';
import 'package:prayosha_erp/features/uploads/repositories/uploads_repository.dart';
import 'package:prayosha_erp/features/uploads/viewmodels/recent_uploads_view_model.dart';

import '../helpers/fakes.dart';

void main() {
  group('LoginViewModel', () {
    late MockAuthService service;
    late ProviderContainer container;

    setUp(() {
      service = MockAuthService();
      container = ProviderContainer.test(
        overrides: [
          demoModeProvider.overrideWithValue(false),
          authServiceProvider.overrideWithValue(service),
          sessionStorageProvider.overrideWithValue(InMemorySessionStorage()),
        ],
        retry: (_, _) => null,
      );
      container.listen(loginViewModelProvider, (_, _) {});
    });

    Future<void> settleAuth() => container.read(authControllerProvider.future);

    test('reports validation errors without calling the API', () async {
      await settleAuth();
      await container.read(loginViewModelProvider.notifier).submit(username: 'x', password: '');
      final state = container.read(loginViewModelProvider);
      expect(state.usernameError, ValidationError.usernameFormat);
      expect(state.passwordError, ValidationError.required);
      verifyNever(
        () => service.login(
          username: any(named: 'username'),
          password: any(named: 'password'),
        ),
      );
    });

    test('signs in with the normalised username and updates the session', () async {
      await settleAuth();
      when(() => service.login(username: 'ramesh', password: 'pw')).thenAnswer(
        (_) async => LoginResult(
          tokens: AuthTokens(accessToken: 'a', expiresAt: DateTime(2026)),
          user: testUser,
        ),
      );
      await container.read(loginViewModelProvider.notifier).submit(username: ' Ramesh ', password: 'pw');
      expect(container.read(authControllerProvider).value, testUser);
      expect(container.read(loginViewModelProvider).failure, isNull);
      expect(container.read(loginViewModelProvider).isSubmitting, isFalse);
    });

    test('keeps the failure for the view and stays signed out', () async {
      await settleAuth();
      when(
        () => service.login(username: 'ramesh', password: 'bad'),
      ).thenThrow(const ApiFailure(FailureKind.unauthorized, code: 'INVALID_CREDENTIALS'));
      await container.read(loginViewModelProvider.notifier).submit(username: 'ramesh', password: 'bad');
      final state = container.read(loginViewModelProvider);
      expect((state.failure! as ApiFailure).code, 'INVALID_CREDENTIALS');
      expect(state.isSubmitting, isFalse);
      expect(container.read(authControllerProvider).value, isNull);

      container.read(loginViewModelProvider.notifier).fieldChanged(password: true);
      expect(container.read(loginViewModelProvider).failure, isNull);
    });
  });

  group('RecentUploadsViewModel', () {
    late MockUploadsRepository repository;
    late ProviderContainer container;

    setUp(() {
      repository = MockUploadsRepository();
      container = ProviderContainer.test(
        overrides: [uploadsRepositoryProvider.overrideWithValue(repository)],
        retry: (_, _) => null,
      );
    });

    // Subscribe only after stubbing: subscribing runs build().
    void listen() => container.listen(recentUploadsViewModelProvider, (_, _) {});

    test('loads uploads (success and empty)', () async {
      when(() => repository.recentUploads()).thenAnswer((_) async => [testUpload(1), testUpload(2)]);
      listen();
      expect(await container.read(recentUploadsViewModelProvider.future), hasLength(2));

      when(() => repository.recentUploads()).thenAnswer((_) async => []);
      await container.read(recentUploadsViewModelProvider.notifier).refresh();
      expect(container.read(recentUploadsViewModelProvider).value, isEmpty);
    });

    test('exposes failures and recovers on refresh', () async {
      when(() => repository.recentUploads()).thenThrow(const ApiFailure(FailureKind.network));
      listen();
      await expectLater(container.read(recentUploadsViewModelProvider.future), throwsA(isA<ApiFailure>()));
      expect(container.read(recentUploadsViewModelProvider).hasError, isTrue);

      when(() => repository.recentUploads()).thenAnswer((_) async => [testUpload(1)]);
      await container.read(recentUploadsViewModelProvider.notifier).refresh();
      expect(container.read(recentUploadsViewModelProvider).value, hasLength(1));
    });
  });

  group('authRedirect', () {
    const signedOut = AsyncData<User?>(null);
    final signedIn = AsyncData<User?>(testUser);
    const restoring = AsyncLoading<User?>();

    String? redirect(AsyncValue<User?> auth, String location) =>
        authRedirect(auth: auth, location: Uri.parse(location));

    test('waits on the splash while restoring, remembering the deep link', () {
      expect(redirect(restoring, '/settings'), '/splash?from=%2Fsettings');
      expect(redirect(restoring, '/splash?from=/settings'), isNull);
    });

    test('sends signed-out users to login and keeps the target', () {
      expect(redirect(signedOut, '/settings'), '/login?from=%2Fsettings');
      expect(redirect(signedOut, '/splash?from=/settings'), '/login?from=%2Fsettings');
      expect(redirect(signedOut, '/login'), isNull);
    });

    test('returns signed-in users to the deep link, else the dashboard', () {
      expect(redirect(signedIn, '/login?from=/settings'), '/settings');
      expect(redirect(signedIn, '/login'), '/dashboard');
      expect(redirect(signedIn, '/settings'), isNull);
    });

    test('refuses open redirects', () {
      expect(redirect(signedIn, '/login?from=https://evil.example'), '/dashboard');
      expect(redirect(signedIn, '/login?from=//evil.example'), '/dashboard');
    });
  });
}
