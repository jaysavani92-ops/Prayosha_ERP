import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/gen/app_localizations.dart';
import '../storage/preferences.dart';

/// Supported UI languages. [nativeName] is each language's own name
/// (an autonym) and is intentionally identical in every UI language, so
/// people can find their language even when they cannot read the current one.
enum AppLanguage {
  english('en', 'English'),
  gujarati('gu', 'ગુજરાતી'),
  hindi('hi', 'हिन्दी');

  const AppLanguage(this.code, this.nativeName);

  final String code;
  final String nativeName;

  Locale get locale => Locale(code);

  static AppLanguage? fromCode(String? code) {
    for (final language in values) {
      if (language.code == code) return language;
    }
    return null;
  }

  /// First supported language among the device's preferred locales, else English.
  static AppLanguage fromDevice(List<Locale> deviceLocales) {
    for (final locale in deviceLocales) {
      final match = fromCode(locale.languageCode);
      if (match != null) return match;
    }
    return english;
  }
}

/// The active UI language. Persisted, applied immediately (MaterialApp
/// rebuilds on change), defaulting to the device language on first launch.
class LanguageController extends Notifier<AppLanguage> {
  @override
  AppLanguage build() {
    final stored = ref.watch(sharedPreferencesProvider).getString(PreferenceKeys.languageCode);
    return AppLanguage.fromCode(stored) ?? AppLanguage.fromDevice(WidgetsBinding.instance.platformDispatcher.locales);
  }

  Future<void> select(AppLanguage language) async {
    state = language;
    await ref.read(sharedPreferencesProvider).setString(PreferenceKeys.languageCode, language.code);
  }
}

final languageControllerProvider = NotifierProvider<LanguageController, AppLanguage>(LanguageController.new);

extension AppLocalizationsContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}
