import 'package:flutter/material.dart';

/// Every bundled asset is referenced through this registry. Paths here must
/// match files under `assets/` and entries in `pubspec.yaml`;
/// test/core/app_assets_test.dart fails if one does not exist.
abstract final class AppFonts {
  static const latin = 'NotoSans';
  static const gujarati = 'NotoSansGujarati';
  static const devanagari = 'NotoSansDevanagari';

  static const all = [latin, gujarati, devanagari];

  /// Font files by family (used by the coverage and asset tests).
  static const files = <String, List<String>>{
    latin: [
      'assets/fonts/NotoSans-Regular.ttf',
      'assets/fonts/NotoSans-Medium.ttf',
      'assets/fonts/NotoSans-SemiBold.ttf',
      'assets/fonts/NotoSans-Bold.ttf',
    ],
    gujarati: [
      'assets/fonts/NotoSansGujarati-Regular.ttf',
      'assets/fonts/NotoSansGujarati-Medium.ttf',
      'assets/fonts/NotoSansGujarati-SemiBold.ttf',
      'assets/fonts/NotoSansGujarati-Bold.ttf',
    ],
    devanagari: [
      'assets/fonts/NotoSansDevanagari-Regular.ttf',
      'assets/fonts/NotoSansDevanagari-Medium.ttf',
      'assets/fonts/NotoSansDevanagari-SemiBold.ttf',
      'assets/fonts/NotoSansDevanagari-Bold.ttf',
    ],
  };
}

/// Icons by meaning, so a feature never picks an arbitrary glyph inline.
/// Material Icons ship with Flutter (`uses-material-design: true`).
abstract final class AppIcons {
  static const dashboard = Icons.dashboard_outlined;
  static const dashboardSelected = Icons.dashboard;
  static const settings = Icons.settings_outlined;
  static const settingsSelected = Icons.settings;
  static const language = Icons.translate;
  static const theme = Icons.brightness_6_outlined;
  static const signOut = Icons.logout;
  static const user = Icons.person_outline;
  static const lock = Icons.lock_outline;
  static const visibilityOn = Icons.visibility_outlined;
  static const visibilityOff = Icons.visibility_off_outlined;
  static const error = Icons.error_outline;
  static const empty = Icons.inbox_outlined;
  static const image = Icons.image_outlined;
  static const document = Icons.description_outlined;
  static const brand = Icons.apartment;
  static const check = Icons.check;
  static const help = Icons.help_outline;
}
