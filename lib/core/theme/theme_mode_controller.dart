import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/preferences.dart';

/// Light / dark / follow-system, persisted per device.
class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final stored = ref.watch(sharedPreferencesProvider).getString(PreferenceKeys.themeMode);
    return ThemeMode.values.asNameMap()[stored] ?? ThemeMode.system;
  }

  Future<void> select(ThemeMode mode) async {
    state = mode;
    await ref.read(sharedPreferencesProvider).setString(PreferenceKeys.themeMode, mode.name);
  }
}

final themeModeControllerProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);
