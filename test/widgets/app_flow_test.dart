import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/app/router/app_router.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';
import 'package:prayosha_erp/core/network/api_failure.dart';
import 'package:prayosha_erp/core/storage/preferences.dart';
import 'package:prayosha_erp/features/auth/models/auth_tokens.dart';
import 'package:prayosha_erp/features/auth/views/login_view.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations_en.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations_gu.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations_hi.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  final en = AppLocalizationsEn();
  final gu = AppLocalizationsGu();
  final hi = AppLocalizationsHi();

  late MockAuthService auth;
  late MockUploadsRepository uploads;

  setUp(() {
    auth = MockAuthService();
    uploads = MockUploadsRepository();
    when(() => uploads.recentUploads()).thenAnswer((_) async => []);
    when(() => auth.login(username: 'ramesh', password: 'correct-password')).thenAnswer(
      (_) async => LoginResult(
        tokens: AuthTokens(accessToken: 'access', expiresAt: DateTime(2030), refreshToken: 'refresh'),
        user: testUser,
      ),
    );
    when(() => auth.logout(refreshToken: any(named: 'refreshToken'))).thenAnswer((_) async {});
  });

  Future<void> signIn(WidgetTester tester) async {
    await tester.enterText(find.byKey(const ValueKey('login-username')), 'ramesh');
    await tester.enterText(find.byKey(const ValueKey('login-password')), 'correct-password');
    await tester.tap(find.byKey(const ValueKey('login-submit')));
    await tester.pumpAndSettle();
  }

  group('sign-in flow', () {
    testWidgets('signed-out users land on the login page and reach the dashboard', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      expect(find.byType(LoginView), findsOneWidget);

      await signIn(tester);
      expect(find.text(en.dashboardGreeting(testUser.displayName)), findsOneWidget);
      expect(find.text(en.recentUploadsEmptyTitle), findsOneWidget);
    });

    testWidgets('validation and API errors are shown in the current language', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      when(
        () => auth.login(username: 'ramesh', password: 'wrong'),
      ).thenThrow(const ApiFailure(FailureKind.unauthorized, code: 'INVALID_CREDENTIALS'));
      await pumpFullApp(
        tester,
        authService: auth,
        uploadsRepository: uploads,
        preferences: {PreferenceKeys.languageCode: 'hi'},
      );

      await tester.tap(find.byKey(const ValueKey('login-submit')));
      await tester.pumpAndSettle();
      expect(find.text(hi.validationRequired), findsNWidgets(2));

      await tester.enterText(find.byKey(const ValueKey('login-username')), 'ramesh');
      await tester.enterText(find.byKey(const ValueKey('login-password')), 'wrong');
      await tester.tap(find.byKey(const ValueKey('login-submit')));
      await tester.pumpAndSettle();
      expect(find.text(hi.errorInvalidCredentials), findsOneWidget);
    });

    testWidgets('Enter in the password field signs in', (tester) async {
      setWindowSize(tester, const Size(1366, 768));
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      await tester.enterText(find.byKey(const ValueKey('login-username')), 'ramesh');
      await tester.enterText(find.byKey(const ValueKey('login-password')), 'correct-password');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(find.text(en.dashboardGreeting(testUser.displayName)), findsOneWidget);
    });

    testWidgets('forgot password explains the administrator reset', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      await tester.ensureVisible(find.byKey(const ValueKey('login-forgot-password')));
      await tester.tap(find.byKey(const ValueKey('login-forgot-password')));
      await tester.pumpAndSettle();
      expect(find.text(en.loginForgotPasswordTitle), findsOneWidget);
      expect(find.text(en.loginForgotPasswordMessage), findsOneWidget);
    });

    testWidgets('a deep link survives sign-in (web refresh / shared URL)', (tester) async {
      setWindowSize(tester, const Size(1280, 800));
      final container = await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      container.read(routerProvider).go('/settings');
      await tester.pumpAndSettle();
      expect(find.byType(LoginView), findsOneWidget);
      expect(container.read(routerProvider).state.uri.toString(), '/login?from=%2Fsettings');

      await signIn(tester);
      expect(container.read(routerProvider).state.uri.path, '/settings');
      expect(find.text(en.settingsLanguage), findsOneWidget);
    });

    testWidgets('a stored session is restored on startup without the login page', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      when(
        () => auth.refresh(refreshToken: 'stored'),
      ).thenAnswer((_) async => AuthTokens(accessToken: 'a', expiresAt: DateTime(2030), refreshToken: 'rotated'));
      when(() => auth.me('a')).thenAnswer((_) async => testUser);
      final storage = InMemorySessionStorage(token: 'stored');
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads, sessionStorage: storage);
      expect(find.byType(LoginView), findsNothing);
      expect(find.text(en.dashboardGreeting(testUser.displayName)), findsOneWidget);
      expect(storage.token, 'rotated');
    });

    testWidgets('signing out asks for confirmation and returns to login', (tester) async {
      setWindowSize(tester, const Size(1280, 800));
      final container = await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      await signIn(tester);
      container.read(routerProvider).go('/settings');
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('sign-out')));
      await tester.pumpAndSettle();
      expect(find.text(en.signOutConfirmTitle), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, en.signOut));
      await tester.pumpAndSettle();
      expect(find.byType(LoginView), findsOneWidget);
      expect(find.text(en.signedOutMessage), findsOneWidget);
    });
  });

  group('language switching', () {
    testWidgets('sign-in: one tap applies and persists, without covering the form', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      expect(find.text(en.appSubtitle), findsOneWidget);
      final topBar = tester.getSize(find.byKey(const ValueKey('login-top-bar')));
      final cardTop = tester.getRect(find.byKey(const ValueKey('login-card'))).top;

      // The sign-in screen shows every language; one tap switches.
      await tester.tap(find.byKey(const ValueKey('language-gu')));
      await tester.pumpAndSettle();

      expect(find.text(gu.appSubtitle), findsOneWidget);
      expect(find.text(gu.loginSubmit), findsOneWidget);
      // The selected segment is the confirmation; a snackbar would cover the card.
      expect(find.byType(SnackBar), findsNothing);
      // Neither the top bar nor the card moves when the language changes.
      expect(tester.getSize(find.byKey(const ValueKey('login-top-bar'))), topBar);
      expect(tester.getRect(find.byKey(const ValueKey('login-card'))).top, cardTop);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(PreferenceKeys.languageCode), 'gu');
    });

    testWidgets('settings: confirms the change in the new language', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      final container = await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      await signIn(tester);
      container.read(routerProvider).go('/settings');
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.byKey(const ValueKey('language-hi')));
      await tester.tap(find.byKey(const ValueKey('language-hi')));
      await tester.pumpAndSettle();
      expect(find.text(hi.languageChanged(AppLanguage.hindi.nativeName)), findsOneWidget);
    });

    testWidgets('remembers the language on the next launch', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      await pumpFullApp(
        tester,
        authService: auth,
        uploadsRepository: uploads,
        preferences: {PreferenceKeys.languageCode: 'gu'},
      );
      expect(find.text(gu.appSubtitle), findsOneWidget);
      expect(Localizations.localeOf(tester.element(find.byType(LoginView))).languageCode, 'gu');
    });
  });

  group('responsive shell', () {
    Future<void> openDashboard(WidgetTester tester, Size size) async {
      setWindowSize(tester, size);
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      await signIn(tester);
    }

    testWidgets('phone: bottom navigation bar', (tester) async {
      await openDashboard(tester, const Size(400, 800));
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);

      await tester.tap(find.text(en.navSettings));
      await tester.pumpAndSettle();
      expect(GoRouter.of(tester.element(find.text(en.settingsLanguage))).state.uri.path, '/settings');
    });

    testWidgets('tablet: compact navigation rail', (tester) async {
      await openDashboard(tester, const Size(800, 1000));
      expect(find.byType(NavigationBar), findsNothing);
      expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).extended, isFalse);
    });

    testWidgets('desktop: extended navigation rail', (tester) async {
      await openDashboard(tester, const Size(1400, 900));
      expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).extended, isTrue);
    });
  });

  group('keyboard and accessibility', () {
    testWidgets('Tab moves through the login form in reading order', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      final username = find.descendant(
        of: find.byKey(const ValueKey('login-username')),
        matching: find.byType(EditableText),
      );
      final password = find.descendant(
        of: find.byKey(const ValueKey('login-password')),
        matching: find.byType(EditableText),
      );

      expect(tester.widget<EditableText>(username).focusNode.hasFocus, isTrue, reason: 'username is autofocused');
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      expect(tester.widget<EditableText>(password).focusNode.hasFocus, isTrue);
    });

    testWidgets('meets tap-target and labelled-control guidelines', (tester) async {
      setWindowSize(tester, const Size(400, 800));
      final handle = tester.ensureSemantics();
      await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  });
}
