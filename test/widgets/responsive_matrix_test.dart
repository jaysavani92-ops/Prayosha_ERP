import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/app/router/app_router.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';
import 'package:prayosha_erp/core/storage/preferences.dart';
import 'package:prayosha_erp/core/theme/app_tokens.dart';
import 'package:prayosha_erp/features/auth/models/auth_tokens.dart';
import 'package:prayosha_erp/features/auth/views/login_view.dart';
import 'package:prayosha_erp/features/uploads/models/upload.dart';

import '../helpers/app_fonts.dart';
import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

/// Every screen and dialog on representative real devices (logical pixels),
/// at normal and 200 % text, in English and in the taller Indic scripts,
/// measured with the app's real fonts (see `loadAppFonts`). Flutter reports any RenderFlex overflow or layout error as
/// a test failure, so this guards "works on every device" for new screens:
/// add each new route to `visitAllScreens` below.
const _devices = <String, Size>{
  'small phone (iPhone SE 1st gen)': Size(320, 568),
  'compact Android phone': Size(360, 640),
  'phone (iPhone 15)': Size(393, 852),
  'large phone (Pixel 9 Pro XL)': Size(412, 915),
  'phone landscape': Size(852, 393),
  'foldable open (Galaxy Z Fold)': Size(690, 840),
  'tablet portrait (iPad)': Size(820, 1180),
  'tablet landscape (iPad)': Size(1180, 820),
  'tablet 4:3 landscape / small laptop': Size(1024, 768),
  'short browser window': Size(1280, 600),
  'laptop': Size(1366, 768),
  'desktop full HD': Size(1920, 1080),
  'desktop QHD': Size(2560, 1440),
};

/// English at both text sizes; Gujarati and Hindi (longer words, taller
/// glyphs) at the worst case, 200 %.
const _variants = <(AppLanguage, double)>[
  (AppLanguage.english, 1.0),
  (AppLanguage.english, 2.0),
  (AppLanguage.gujarati, 2.0),
  (AppLanguage.hindi, 2.0),
];

/// Opens the dialog behind [trigger], checks it fits the window, and closes
/// it with its first (safe) action, which has the focus.
Future<void> openAndCloseDialog(WidgetTester tester, Key trigger) async {
  await tester.ensureVisible(find.byKey(trigger));
  await tester.tap(find.byKey(trigger));
  await tester.pumpAndSettle();
  final dialog = find.byType(AlertDialog);
  expect(dialog, findsOneWidget);
  final window = Offset.zero & tester.view.physicalSize / tester.view.devicePixelRatio;
  final rect = tester.getRect(dialog);
  expect(window.contains(rect.topLeft) && window.contains(rect.bottomRight - const Offset(1, 1)), isTrue);
  final firstAction = find
      .descendant(of: dialog, matching: find.byWidgetPredicate((w) => w is ButtonStyleButton))
      .first;
  await tester.ensureVisible(firstAction);
  await tester.tap(firstAction);
  await tester.pumpAndSettle();
  expect(dialog, findsNothing);
}

void main() {
  setUpAll(loadAppFonts);

  late MockAuthService auth;
  late MockUploadsRepository uploads;

  setUp(() {
    auth = MockAuthService();
    uploads = MockUploadsRepository();
    when(() => uploads.recentUploads()).thenAnswer(
      (_) async => [
        testUpload(1),
        // Long, unbroken names are the usual cause of horizontal overflow.
        Upload(
          id: '65f000000000000000000199',
          purpose: UploadPurpose.pettyCashReceipt,
          contentType: 'application/pdf',
          sizeBytes: 523,
          filename: 'site-17_block-C_floor-12_petty-cash-receipt_scan_final_v3_signed_approved.pdf',
          createdAt: DateTime.utc(2026, 10, 21),
        ),
      ],
    );
    when(() => auth.login(username: 'ramesh', password: 'correct-password')).thenAnswer(
      (_) async => LoginResult(
        tokens: AuthTokens(accessToken: 'access', expiresAt: DateTime(2030), refreshToken: 'refresh'),
        user: testUser,
      ),
    );
  });

  Future<void> visitAllScreens(WidgetTester tester, Size size, AppLanguage language) async {
    // Login (signed out).
    final container = await pumpFullApp(
      tester,
      authService: auth,
      uploadsRepository: uploads,
      preferences: {PreferenceKeys.languageCode: language.code},
    );
    expect(find.byType(LoginView), findsOneWidget);
    // Top bar, card and footer stack without overlapping, and the card stays
    // on screen horizontally and no wider than a form.
    final topBar = tester.getRect(find.byKey(const ValueKey('login-top-bar')));
    final card = tester.getRect(find.byKey(const ValueKey('login-card')));
    final footer = tester.getRect(find.byKey(const ValueKey('login-footer')));
    expect(topBar.bottom, lessThanOrEqualTo(card.top));
    expect(card.bottom, lessThanOrEqualTo(footer.top));
    expect(card.left, greaterThanOrEqualTo(0));
    expect(card.right, lessThanOrEqualTo(size.width));
    expect(card.width, lessThanOrEqualTo(AppSpacing.formMaxWidth));
    await openAndCloseDialog(tester, const ValueKey('login-forgot-password'));
    await tester.enterText(find.byKey(const ValueKey('login-username')), 'ramesh');
    await tester.enterText(find.byKey(const ValueKey('login-password')), 'correct-password');
    await tester.ensureVisible(find.byKey(const ValueKey('login-submit')));
    await tester.tap(find.byKey(const ValueKey('login-submit')));
    await tester.pumpAndSettle();

    // Shell navigation adapts to width and height classes.
    final width = AppBreakpoints.of(size.width);
    final height = AppBreakpoints.heightOf(size.height);
    if (width == WindowSize.compact) {
      expect(find.byKey(const ValueKey('app-bottom-nav')), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
    } else {
      final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
      expect(rail.extended, width.isAtLeast(WindowSize.expanded) && height != WindowHeight.compact);
    }

    // Projects (home): the cards, the zone inspector with a tower open, and
    // the WhatsApp preview.
    expect(find.byKey(const ValueKey('kpi-strip')), findsOneWidget);
    expect(find.byKey(const ValueKey('project-card-prj-014')), findsOneWidget);
    for (final (action, panel) in [('inspect', 'zone-inspector'), ('share', 'whatsapp-preview')]) {
      final menu = find.byKey(const ValueKey('project-actions-prj-014'));
      await tester.ensureVisible(menu);
      await tester.pumpAndSettle();
      await tester.tap(menu);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(ValueKey('project-action-$action')));
      await tester.pumpAndSettle();
      expect(find.byKey(ValueKey(panel)), findsOneWidget);
      if (action == 'inspect') {
        // Short windows at 200 % text show the tree only after scrolling.
        final tower = find.byKey(const ValueKey('zone-tower-Tower A'));
        await tester.scrollUntilVisible(
          tower,
          100,
          scrollable: find.descendant(of: find.byKey(ValueKey(panel)), matching: find.byType(Scrollable)).first,
        );
        await tester.ensureVisible(tower);
        await tester.pumpAndSettle();
        await tester.tap(tower);
        await tester.pumpAndSettle();
      }
      Navigator.of(tester.element(find.byKey(ValueKey(panel)))).pop();
      await tester.pumpAndSettle();
    }

    // Every other destination, the Hub (sheet or panel), Settings.
    for (final path in ['/tasks', '/workforce', '/pre-development']) {
      container.read(routerProvider).go(path);
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byKey(const ValueKey('hub-button')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('hub-panel')), findsOneWidget);
    await tester.tapAt(const Offset(4, 4)); // dismiss by tapping the scrim
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('hub-panel')), findsNothing);
    container.read(routerProvider).go('/settings');
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('sign-out')), findsOneWidget);
    await openAndCloseDialog(tester, const ValueKey('sign-out'));
  }

  for (final device in _devices.entries) {
    for (final (language, scale) in _variants) {
      final name = '${device.key} ${device.value.width.toInt()}×${device.value.height.toInt()}';
      testWidgets('$name, ${language.code} @ ${scale}x text', (tester) async {
        setWindowSize(tester, device.value);
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await visitAllScreens(tester, device.value, language);
      });
    }
  }

  testWidgets('text scaling is clamped at 200 % (WCAG 1.4.4)', (tester) async {
    setWindowSize(tester, const Size(393, 852));
    tester.platformDispatcher.textScaleFactorTestValue = 3.5;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
    final scaler = MediaQuery.textScalerOf(tester.element(find.byType(LoginView)));
    expect(scaler.scale(10), 10 * AppTextScale.max);
  });
}
