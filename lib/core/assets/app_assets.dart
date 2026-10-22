import 'package:flutter/material.dart';

/// Every bundled asset is referenced through this registry. Paths here must
/// match files under `assets/` and entries in `pubspec.yaml`;
/// test/core/app_assets_test.dart fails if one does not exist.
abstract final class AppFonts {
  /// English UI text: Plus Jakarta Sans (SIL OFL 1.1), a modern geometric
  /// sans that stays crisp at small sizes.
  static const english = 'PlusJakartaSans';

  /// Latin fallback with the same metrics family as the Indic fonts, used for
  /// Latin words and digits inside Gujarati / Hindi text.
  static const latin = 'NotoSans';
  static const gujarati = 'NotoSansGujarati';
  static const devanagari = 'NotoSansDevanagari';

  static const all = [english, latin, gujarati, devanagari];

  /// Font files by family (used by the coverage and asset tests).
  static const files = <String, List<String>>{
    english: [
      'assets/fonts/PlusJakartaSans-Regular.ttf',
      'assets/fonts/PlusJakartaSans-Medium.ttf',
      'assets/fonts/PlusJakartaSans-SemiBold.ttf',
      'assets/fonts/PlusJakartaSans-Bold.ttf',
    ],
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

/// Bundled images.
abstract final class AppImages {
  /// Sign-in background: site engineer in a Prayosha hard hat overlooking a
  /// tower under construction at sunset. Portrait (1601 × 2844), carried over
  /// from the original web frontend's `IMAGE.jpg`.
  static const loginBackground = 'assets/images/login_background.jpg';

  static const all = [loginBackground];
}

/// Icons by meaning, so a feature never picks an arbitrary glyph inline.
/// Material Icons ship with Flutter (`uses-material-design: true`).
abstract final class AppIcons {
  // Navigation: outlined at rest, filled (rounded) when selected.
  /// Overview is the app's home screen.
  static const overview = Icons.home_outlined;
  static const overviewSelected = Icons.home_rounded;

  /// Site tasks are work orders: a clipboard with a tick.
  static const tasks = Icons.assignment_turned_in_outlined;
  static const tasksSelected = Icons.assignment_turned_in_rounded;

  /// The labour crew (two people: same optical weight as its neighbours,
  /// unlike the wide, low "groups" glyph).
  static const workforce = Icons.people_alt_outlined;
  static const workforceSelected = Icons.people_alt_rounded;

  /// Pre-development is everything before building starts: the foundation.
  static const preDevelopment = Icons.foundation_outlined;
  static const preDevelopmentSelected = Icons.foundation_rounded;

  /// The Hub opens every tool and suite: the "all apps" grid.
  static const hub = Icons.grid_view_rounded;
  static const close = Icons.close;
  static const chevron = Icons.chevron_right;
  static const inventory = Icons.inventory_2_outlined;
  static const purchase = Icons.shopping_cart_outlined;
  static const pettyCash = Icons.account_balance_wallet_outlined;
  static const drawings = Icons.draw_outlined;
  static const planChange = Icons.edit_note_outlined;
  static const possession = Icons.vpn_key_outlined;
  static const siteMap = Icons.map_outlined;
  static const admin = Icons.admin_panel_settings_outlined;
  static const settings = Icons.settings_outlined;
  static const settingsSelected = Icons.settings;
  static const language = Icons.translate;
  static const theme = Icons.brightness_6_outlined;
  static const signOut = Icons.logout;
  static const user = Icons.person_outline;
  static const lock = Icons.lock_outline;
  static const signIn = Icons.login;
  static const visibilityOn = Icons.visibility_outlined;
  static const visibilityOff = Icons.visibility_off_outlined;
  static const error = Icons.error_outline;
  static const empty = Icons.inbox_outlined;
  static const image = Icons.image_outlined;
  static const document = Icons.description_outlined;
  static const brand = Icons.apartment;
  static const check = Icons.check;
  static const help = Icons.help_outline;
  static const info = Icons.info_outline;
}
