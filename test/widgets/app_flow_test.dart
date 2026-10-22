import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/app/router/app_router.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';
import 'package:prayosha_erp/core/network/api_failure.dart';
import 'package:prayosha_erp/core/storage/preferences.dart';
import 'package:prayosha_erp/core/theme/app_tokens.dart';
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

    testWidgets('phone: dock with four destinations and the Hub', (tester) async {
      await openDashboard(tester, const Size(400, 800));
      expect(find.byKey(const ValueKey('app-bottom-nav')), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);

      // Each destination opens its page.
      for (final (key, path, title) in [
        ('tasks', '/tasks', en.navTasks),
        ('workforce', '/workforce', en.navWorkforce),
        ('pre-development', '/pre-development', en.navPreDevelopment),
        ('overview', '/dashboard', en.navOverview),
      ]) {
        await tester.tap(find.byKey(ValueKey('nav-$key')));
        await tester.pumpAndSettle();
        expect(GoRouter.of(tester.element(find.byType(AppBar))).state.uri.path, path);
        expect(find.descendant(of: find.byType(AppBar), matching: find.text(title)), findsOneWidget);
      }

      // The Hub opens as a bottom sheet and reaches Settings.
      await tester.tap(find.byKey(const ValueKey('hub-button')));
      await tester.pumpAndSettle();
      expect(find.byType(BottomSheet), findsOneWidget);
      expect(find.text(en.hubTitle), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('hub-settings')));
      await tester.pumpAndSettle();
      expect(find.byType(BottomSheet), findsNothing);
      expect(GoRouter.of(tester.element(find.text(en.settingsLanguage))).state.uri.path, '/settings');
    });

    testWidgets(
      'phone dock: tabs announce their position, the amber underline follows the selected tab, and changes give haptic feedback',
      (tester) async {
        final handle = tester.ensureSemantics();
        final haptics = <String>[];
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == 'HapticFeedback.vibrate') haptics.add(call.arguments as String);
          return null;
        });
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null),
        );
        await openDashboard(tester, const Size(400, 800));

        final task = find.bySemanticsLabel(en.navTabPosition(en.navTasks, 2, 4));
        expect(task, findsOneWidget);
        expect(tester.getSemantics(task), isSemantics(isSelected: false, isButton: true));

        // The amber underline marks the selected tab and moves with it.
        double underline(String key) => tester.getSize(find.byKey(ValueKey('nav-underline-$key'))).width;
        expect(underline('overview'), AppNav.underlineWidth);
        expect(underline('tasks'), 0);

        await tester.tap(find.byKey(const ValueKey('nav-tasks')));
        await tester.pumpAndSettle();
        expect(underline('tasks'), AppNav.underlineWidth);
        expect(underline('overview'), 0);
        expect(tester.getSemantics(task), isSemantics(isSelected: true));
        expect(haptics, ['HapticFeedbackType.selectionClick']);

        // Re-tapping the current tab gives no extra tick.
        await tester.tap(find.byKey(const ValueKey('nav-tasks')));
        await tester.pumpAndSettle();
        expect(haptics, hasLength(1));

        await tester.tap(find.byKey(const ValueKey('hub-button')));
        await tester.pumpAndSettle();
        expect(haptics.last, 'HapticFeedbackType.lightImpact');
        handle.dispose();
      },
    );

    testWidgets('phone dock: pages scroll clear of it (bottom inset covers the dock)', (tester) async {
      await openDashboard(tester, const Size(400, 800));
      final dockTop = tester.getRect(find.byKey(const ValueKey('app-bottom-nav'))).top;
      final pageInset = MediaQuery.paddingOf(tester.element(find.text(en.recentUploadsEmptyTitle))).bottom;
      expect(800 - pageInset, lessThanOrEqualTo(dockTop));
    });

    testWidgets('destinations that have no API yet say so, without invented data', (tester) async {
      await openDashboard(tester, const Size(400, 800));
      await tester.tap(find.byKey(const ValueKey('nav-tasks')));
      await tester.pumpAndSettle();
      expect(find.text(en.tasksPendingTitle), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('nav-workforce')));
      await tester.pumpAndSettle();
      expect(find.text(en.workforcePendingTitle), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('nav-pre-development')));
      await tester.pumpAndSettle();
      expect(find.text(en.preDevelopmentPendingTitle), findsOneWidget);
    });

    testWidgets('Hub: coming-soon suites are announced as such and are not buttons', (tester) async {
      final handle = tester.ensureSemantics();
      await openDashboard(tester, const Size(400, 800));
      await tester.tap(find.byKey(const ValueKey('hub-button')));
      await tester.pumpAndSettle();
      final tile = find.bySemanticsLabel(en.hubSuiteComingSoon(en.suitePettyCash));
      expect(tile, findsOneWidget);
      final data = tester.getSemantics(tile).getSemanticsData();
      expect(data.hasAction(SemanticsAction.tap), isFalse);
      handle.dispose();
    });

    testWidgets('Hub: signing out asks for confirmation and returns to login', (tester) async {
      await openDashboard(tester, const Size(400, 800));
      await tester.tap(find.byKey(const ValueKey('hub-button')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('hub-sign-out')));
      await tester.tap(find.byKey(const ValueKey('hub-sign-out')));
      await tester.pumpAndSettle();
      expect(find.text(en.signOutConfirmTitle), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, en.signOut));
      await tester.pumpAndSettle();
      expect(find.byType(LoginView), findsOneWidget);
    });

    testWidgets('tablet: compact rail with a round Hub; the Hub opens as a panel', (tester) async {
      await openDashboard(tester, const Size(800, 1000));
      expect(find.byKey(const ValueKey('app-bottom-nav')), findsNothing);
      expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).extended, isFalse);

      await tester.tap(find.byKey(const ValueKey('hub-button')));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
      expect(find.byType(BottomSheet), findsNothing);
      await tester.tap(find.byTooltip(en.commonClose));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsNothing);
    });

    testWidgets('desktop: sidebar; Settings highlights no destination', (tester) async {
      final container = await (() async {
        setWindowSize(tester, const Size(1400, 900));
        final c = await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
        await signIn(tester);
        return c;
      })();
      final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
      expect(rail.extended, isTrue);
      expect(rail.selectedIndex, 0);

      await tester.tap(find.byKey(const ValueKey('nav-workforce')));
      await tester.pumpAndSettle();
      expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).selectedIndex, 2);

      container.read(routerProvider).go('/settings');
      await tester.pumpAndSettle();
      expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).selectedIndex, isNull);
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
