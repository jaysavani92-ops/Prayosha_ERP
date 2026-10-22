import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/app/router/app_router.dart';
import 'package:prayosha_erp/core/theme/app_tokens.dart';
import 'package:prayosha_erp/features/auth/models/auth_tokens.dart';
import 'package:prayosha_erp/features/auth/views/login_view.dart';
import 'package:prayosha_erp/features/uploads/models/upload.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

/// Every screen on representative real devices (logical pixels), at normal
/// and 200 % text. Flutter reports any RenderFlex overflow or layout error as
/// a test failure, so this guards "works on every device" for new screens:
/// add each new route to `visitAllScreens` below.
const _devices = <String, Size>{
  'small phone (iPhone SE 1st gen)': Size(320, 568),
  'phone (iPhone 15)': Size(393, 852),
  'large phone (Pixel 9 Pro XL)': Size(412, 915),
  'phone landscape': Size(852, 393),
  'foldable open (Galaxy Z Fold)': Size(690, 840),
  'tablet portrait (iPad)': Size(820, 1180),
  'tablet landscape (iPad)': Size(1180, 820),
  'laptop': Size(1366, 768),
  'desktop full HD': Size(1920, 1080),
  'desktop QHD': Size(2560, 1440),
};

const _textScales = [1.0, 2.0];

void main() {
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

  Future<void> visitAllScreens(WidgetTester tester, Size size) async {
    // Login (signed out).
    final container = await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
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

    // Overview, every other destination, the Hub (sheet or panel), Settings.
    expect(find.textContaining('Ramesh Patel'), findsOneWidget);
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
  }

  for (final device in _devices.entries) {
    for (final scale in _textScales) {
      testWidgets('${device.key} ${device.value.width.toInt()}×${device.value.height.toInt()} @ ${scale}x text', (
        tester,
      ) async {
        setWindowSize(tester, device.value);
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await visitAllScreens(tester, device.value);
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
