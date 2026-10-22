import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prayosha_erp/core/config/app_config.dart';
import 'package:prayosha_erp/core/network/api_failure.dart';
import 'package:prayosha_erp/core/storage/session_storage.dart';
import 'package:prayosha_erp/features/auth/services/auth_service.dart';
import 'package:prayosha_erp/features/auth/services/demo_auth_service.dart';
import 'package:prayosha_erp/features/auth/viewmodels/auth_controller.dart';
import 'package:prayosha_erp/features/auth/viewmodels/login_view_model.dart';
import 'package:prayosha_erp/features/uploads/repositories/demo_uploads_repository.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations_en.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  final en = AppLocalizationsEn();

  test('sample-data mode follows the build: debug yes, release no (unless DEMO_MODE says otherwise)', () {
    expect(AppConfig.demoMode, kDebugMode);
  });

  group('DemoAuthService', () {
    test('any credentials sign in as the sample user, with no session to restore', () async {
      final service = DemoAuthService();
      final result = await service.login(username: '', password: '');
      expect(result.user, DemoAuthService.demoUser);
      expect(result.tokens.refreshToken, isNull);
      await expectLater(service.refresh(), throwsA(isA<ApiFailure>()));
    });
  });

  test('DemoUploadsRepository returns a realistic list, newest first', () async {
    final uploads = await DemoUploadsRepository().recentUploads();
    expect(uploads, isNotEmpty);
    for (var i = 1; i < uploads.length; i++) {
      expect(uploads[i - 1].createdAt.isAfter(uploads[i].createdAt), isTrue);
    }
  });

  group('LoginViewModel in sample-data mode', () {
    test('skips validation: empty fields still sign in', () async {
      final container = ProviderContainer.test(
        overrides: [
          demoModeProvider.overrideWithValue(true),
          authServiceProvider.overrideWithValue(DemoAuthService()),
          sessionStorageProvider.overrideWithValue(InMemorySessionStorage()),
        ],
        retry: (_, _) => null,
      );
      container.listen(loginViewModelProvider, (_, _) {});
      await container.read(authControllerProvider.future);

      await container.read(loginViewModelProvider.notifier).submit(username: '', password: '');
      final state = container.read(loginViewModelProvider);
      expect(state.usernameError, isNull);
      expect(state.passwordError, isNull);
      expect(container.read(authControllerProvider).value, DemoAuthService.demoUser);
    });

    test('normal mode still validates', () async {
      final container = ProviderContainer.test(
        overrides: [
          demoModeProvider.overrideWithValue(false),
          authServiceProvider.overrideWithValue(DemoAuthService()),
          sessionStorageProvider.overrideWithValue(InMemorySessionStorage()),
        ],
        retry: (_, _) => null,
      );
      container.listen(loginViewModelProvider, (_, _) {});
      await container.read(authControllerProvider.future);
      await container.read(loginViewModelProvider.notifier).submit(username: '', password: '');
      expect(container.read(loginViewModelProvider).usernameError, isNotNull);
      expect(container.read(authControllerProvider).value, isNull);
    });
  });

  testWidgets('one tap on Secure Login opens Overview with sample data', (tester) async {
    setWindowSize(tester, const Size(400, 800));
    await pumpFullApp(
      tester,
      authService: DemoAuthService(),
      uploadsRepository: DemoUploadsRepository(),
      demoMode: true,
    );
    expect(find.text(en.loginDemoNotice), findsOneWidget);

    await tester.ensureVisible(find.byKey(const ValueKey('login-submit')));
    await tester.tap(find.byKey(const ValueKey('login-submit')));
    await tester.pumpAndSettle();
    // Lands on Overview inside the shell, with the bottom navigation dock.
    expect(find.text(en.dashboardGreeting(DemoAuthService.demoUser.displayName)), findsOneWidget);
    expect(find.byKey(const ValueKey('app-bottom-nav')), findsOneWidget);
    expect(find.byKey(const ValueKey('hub-button')), findsOneWidget);
    expect(find.text('block-c_floor-12_wall-crack.jpg'), findsOneWidget);
  });

  testWidgets('normal builds show no sample-data notice', (tester) async {
    setWindowSize(tester, const Size(400, 800));
    await pumpFullApp(tester, authService: MockAuthService());
    expect(find.text(en.loginDemoNotice), findsNothing);
  });
}
