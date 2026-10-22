import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prayosha_erp/app/app.dart';
import 'package:prayosha_erp/app/bootstrap.dart';
import 'package:prayosha_erp/core/config/app_config.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';
import 'package:prayosha_erp/core/storage/preferences.dart';
import 'package:prayosha_erp/core/storage/session_storage.dart';
import 'package:prayosha_erp/core/theme/app_theme.dart';
import 'package:prayosha_erp/features/auth/services/auth_service.dart';
import 'package:prayosha_erp/features/uploads/repositories/uploads_repository.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

/// Sets the test window size (logical pixels).
void setWindowSize(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<SharedPreferences> testPreferences([Map<String, Object> values = const {}]) async {
  SharedPreferences.setMockInitialValues(values);
  return SharedPreferences.getInstance();
}

/// Pumps the whole app (router, theme, localization) with fake I/O.
Future<ProviderContainer> pumpFullApp(
  WidgetTester tester, {
  required AuthService authService,
  UploadsRepository? uploadsRepository,
  SessionStorage? sessionStorage,
  Map<String, Object> preferences = const {},
  bool demoMode = false,
}) async {
  final prefs = await testPreferences(preferences);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        demoModeProvider.overrideWithValue(demoMode),
        // Tests supply their own fakes, so the app's sample services stay out.
        ...appOverrides(prefs, demoMode: false),
        authServiceProvider.overrideWithValue(authService),
        sessionStorageProvider.overrideWithValue(sessionStorage ?? InMemorySessionStorage()),
        if (uploadsRepository != null) uploadsRepositoryProvider.overrideWithValue(uploadsRepository),
      ],
      retry: (_, _) => null,
      child: const PrayoshaApp(),
    ),
  );
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(PrayoshaApp)));
}

/// Pumps a single widget inside a localized, themed MaterialApp.
Future<void> pumpLocalized(
  WidgetTester tester,
  Widget child, {
  AppLanguage language = AppLanguage.english,
  List<Override> overrides = const [],
  bool settle = true,
}) async {
  final prefs = await testPreferences({PreferenceKeys.languageCode: language.code});
  await tester.pumpWidget(
    ProviderScope(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs), ...overrides],
      retry: (_, _) => null,
      child: Consumer(
        builder: (context, ref, _) {
          final locale = ref.watch(languageControllerProvider).locale;
          return MaterialApp(
            locale: locale,
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            theme: AppTheme.light(locale),
            home: child,
          );
        },
      ),
    ),
  );
  // Indeterminate progress indicators never settle.
  settle ? await tester.pumpAndSettle() : await tester.pump();
}
