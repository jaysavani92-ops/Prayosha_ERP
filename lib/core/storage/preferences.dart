import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Synchronous key-value store for non-sensitive preferences (language,
/// theme). Loaded once in `bootstrap()` and injected via an override.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider must be overridden in bootstrap()'),
);

abstract final class PreferenceKeys {
  static const languageCode = 'settings.languageCode';
  static const themeMode = 'settings.themeMode';
}
