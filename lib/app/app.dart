import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/l10n/app_language.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_tokens.dart';
import '../core/theme/theme_mode_controller.dart';
import '../l10n/gen/app_localizations.dart';
import 'router/app_router.dart';

class PrayoshaApp extends ConsumerWidget {
  const PrayoshaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(languageControllerProvider).locale;
    return MaterialApp.router(
      onGenerateTitle: (context) => context.l10n.appTitle,
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      theme: AppTheme.light(locale),
      darkTheme: AppTheme.dark(locale),
      themeMode: ref.watch(themeModeControllerProvider),
      // Honour the user's text size up to 200 % (WCAG 1.4.4); larger system
      // settings would make every layout unusable.
      builder: (context, child) =>
          MediaQuery.withClampedTextScaling(maxScaleFactor: AppTextScale.max, child: child ?? const SizedBox.shrink()),
    );
  }
}
