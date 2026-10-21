import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/core/assets/app_assets.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';
import 'package:prayosha_erp/core/network/api_failure.dart';
import 'package:prayosha_erp/core/theme/app_colors.dart';
import 'package:prayosha_erp/core/theme/app_theme.dart';
import 'package:prayosha_erp/core/theme/app_tokens.dart';
import 'package:prayosha_erp/core/widgets/app_button.dart';
import 'package:prayosha_erp/core/widgets/app_dialog.dart';
import 'package:prayosha_erp/core/widgets/app_text_field.dart';
import 'package:prayosha_erp/core/widgets/responsive.dart';
import 'package:prayosha_erp/features/uploads/repositories/uploads_repository.dart';
import 'package:prayosha_erp/features/uploads/views/recent_uploads_section.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations_en.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations_gu.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  final en = AppLocalizationsEn();

  group('themes', () {
    test('use the locale font with the other scripts as fallbacks', () {
      final gujarati = AppTheme.light(const Locale('gu'));
      expect(gujarati.textTheme.bodyMedium!.fontFamily, AppFonts.gujarati);
      expect(gujarati.textTheme.bodyMedium!.fontFamilyFallback, containsAll([AppFonts.latin, AppFonts.devanagari]));
      expect(AppTheme.dark(const Locale('hi')).textTheme.titleLarge!.fontFamily, AppFonts.devanagari);
      expect(AppTheme.light(const Locale('en')).textTheme.bodyMedium!.fontFamily, AppFonts.latin);
    });

    test('light and dark expose the semantic colour extension and brand colours', () {
      final light = AppTheme.light(const Locale('en'));
      final dark = AppTheme.dark(const Locale('en'));
      expect(light.extension<AppSemanticColors>(), AppSemanticColors.light);
      expect(dark.extension<AppSemanticColors>(), AppSemanticColors.dark);
      expect(light.colorScheme.primary, AppPalette.navy);
      expect(light.colorScheme.secondary, AppPalette.amber);
      expect(dark.colorScheme.brightness, Brightness.dark);
    });

    test('breakpoints classify window widths', () {
      expect(AppBreakpoints.of(360), WindowSize.compact);
      expect(AppBreakpoints.of(599), WindowSize.compact);
      expect(AppBreakpoints.of(600), WindowSize.medium);
      expect(AppBreakpoints.of(839), WindowSize.medium);
      expect(AppBreakpoints.of(840), WindowSize.expanded);
      expect(AppBreakpoints.of(1200), WindowSize.large);
      expect(AppBreakpoints.of(1600), WindowSize.extraLarge);
      expect(AppBreakpoints.heightOf(393), WindowHeight.compact);
      expect(AppBreakpoints.heightOf(800), WindowHeight.medium);
    });

    test('responsiveValue inherits from the nearest smaller class', () {
      expect(responsiveValue(WindowSize.compact, compact: 1, expanded: 3), 1);
      expect(responsiveValue(WindowSize.medium, compact: 1, expanded: 3), 1);
      expect(responsiveValue(WindowSize.large, compact: 1, expanded: 3), 3);
      expect(responsiveValue(WindowSize.extraLarge, compact: 1, medium: 2), 2);
    });
  });

  group('components', () {
    testWidgets('AppButton shows progress, disables itself and keeps its label for screen readers', (tester) async {
      var taps = 0;
      await pumpLocalized(
        tester,
        Scaffold(
          body: AppButton(label: 'Save', loadingLabel: 'Saving…', isLoading: true, onPressed: () => taps++),
        ),
        settle: false,
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Saving…'), findsOneWidget);
      await tester.tap(find.byType(FilledButton));
      expect(taps, 0);
    });

    testWidgets('AppTextField toggles secret visibility with a localized tooltip', (tester) async {
      await pumpLocalized(
        tester,
        const Scaffold(
          body: AppTextField(label: 'Password', obscure: true, showSecretLabel: 'Show', hideSecretLabel: 'Hide'),
        ),
      );
      bool obscured() => tester.widget<EditableText>(find.byType(EditableText)).obscureText;
      expect(obscured(), isTrue);
      await tester.tap(find.byTooltip('Show'));
      await tester.pump();
      expect(obscured(), isFalse);
      expect(find.byTooltip('Hide'), findsOneWidget);
    });

    testWidgets('confirm dialog resolves true/false and focuses the safe action', (tester) async {
      late Future<bool> result;
      await pumpLocalized(
        tester,
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => result = showAppConfirmDialog(
                context,
                title: 'Delete?',
                message: 'Gone for good.',
                confirmLabel: 'Delete',
                cancelLabel: 'Cancel',
                destructive: true,
              ),
              child: const Text('open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      final cancel = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Cancel'));
      expect(cancel.autofocus, isTrue);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(await result, isFalse);
    });
  });

  group('RecentUploadsSection states', () {
    late MockUploadsRepository repository;
    setUp(() => repository = MockUploadsRepository());

    Future<void> pumpSection(WidgetTester tester, {AppLanguage language = AppLanguage.english}) => pumpLocalized(
      tester,
      const Scaffold(body: SingleChildScrollView(child: RecentUploadsSection())),
      language: language,
      overrides: [uploadsRepositoryProvider.overrideWithValue(repository)],
    );

    testWidgets('empty', (tester) async {
      when(() => repository.recentUploads()).thenAnswer((_) async => []);
      await pumpSection(tester);
      expect(find.text(en.recentUploadsEmptyTitle), findsOneWidget);
    });

    testWidgets('success, with localized purpose, size and date', (tester) async {
      when(() => repository.recentUploads()).thenAnswer((_) async => [testUpload(1), testUpload(2)]);
      await pumpSection(tester);
      expect(find.text('crack-1.jpg'), findsOneWidget);
      expect(find.textContaining(en.purposeSnagPhoto), findsNWidgets(2));
      expect(find.textContaining('1.5 MB'), findsNWidgets(2));
      expect(find.textContaining('21 Oct 2026'), findsNWidgets(2));
    });

    testWidgets('success in Gujarati', (tester) async {
      final gu = AppLocalizationsGu();
      when(() => repository.recentUploads()).thenAnswer((_) async => [testUpload(1)]);
      await pumpSection(tester, language: AppLanguage.gujarati);
      expect(find.text(gu.recentUploadsTitle), findsOneWidget);
      expect(find.textContaining(gu.purposeSnagPhoto), findsOneWidget);
    });

    testWidgets('error with a working retry', (tester) async {
      when(() => repository.recentUploads()).thenThrow(const ApiFailure(FailureKind.network));
      await pumpSection(tester);
      expect(find.textContaining(en.errorNetwork), findsOneWidget);

      when(() => repository.recentUploads()).thenAnswer((_) async => [testUpload(1)]);
      await tester.tap(find.text(en.commonRetry));
      await tester.pumpAndSettle();
      expect(find.text('crack-1.jpg'), findsOneWidget);
    });
  });
}
