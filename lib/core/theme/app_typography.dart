import 'package:flutter/material.dart';

import '../assets/app_assets.dart';

/// Typography scale with locale-aware font selection.
///
/// The primary family matches the UI language so its glyphs, metrics and
/// line height are used for most text; the other families are fallbacks for
/// mixed content (Latin digits and brand names in Gujarati/Hindi screens,
/// language names in the language selector).
abstract final class AppTypography {
  static String primaryFamily(Locale locale) => switch (locale.languageCode) {
    'gu' => AppFonts.gujarati,
    'hi' => AppFonts.devanagari,
    _ => AppFonts.english,
  };

  /// Gujarati and Hindi fall back to Noto Sans first for Latin, so mixed
  /// text keeps one family's metrics; English falls back to the Indic fonts
  /// (for language names) after Noto Sans.
  static List<String> fallbackFamilies(Locale locale) => switch (locale.languageCode) {
    'gu' => [AppFonts.latin, AppFonts.devanagari, AppFonts.english],
    'hi' => [AppFonts.latin, AppFonts.gujarati, AppFonts.english],
    _ => [AppFonts.latin, AppFonts.gujarati, AppFonts.devanagari],
  };

  /// Indic scripts need extra vertical room for matras and conjuncts.
  static double _heightFactor(Locale locale) => locale.languageCode == 'en' ? 1.0 : 1.12;

  /// Font and line height for text that is always in [script]'s language,
  /// whatever the UI language: autonyms in the language selector. Built from
  /// [base] (a style of the [uiLocale] theme) with no colour or size, so it
  /// inherits those from its surroundings (a button's foreground, say).
  static TextStyle forScript(TextStyle base, {required Locale uiLocale, required Locale script}) => TextStyle(
    fontFamily: primaryFamily(script),
    fontFamilyFallback: fallbackFamilies(script),
    height: base.height == null ? null : base.height! / _heightFactor(uiLocale) * _heightFactor(script),
    // Tracking would otherwise follow the UI language's font.
    letterSpacing: 0,
  );

  static TextTheme textTheme(Locale locale, Color color) {
    final family = primaryFamily(locale);
    final fallback = fallbackFamilies(locale);
    final h = _heightFactor(locale);

    TextStyle style(double size, FontWeight weight, double height, [double letterSpacing = 0]) {
      return TextStyle(
        fontFamily: family,
        fontFamilyFallback: fallback,
        fontSize: size,
        fontWeight: weight,
        height: height * h,
        // Material's default tracking suits Noto Sans; Plus Jakarta Sans is
        // already open, so English text gets a fifth of it.
        letterSpacing: family == AppFonts.english ? letterSpacing * 0.2 : letterSpacing,
        color: color,
      );
    }

    return TextTheme(
      displaySmall: style(36, FontWeight.w600, 1.22),
      headlineLarge: style(32, FontWeight.w600, 1.25),
      headlineMedium: style(28, FontWeight.w600, 1.29),
      headlineSmall: style(24, FontWeight.w600, 1.33),
      titleLarge: style(22, FontWeight.w600, 1.27),
      titleMedium: style(16, FontWeight.w600, 1.5, 0.15),
      titleSmall: style(14, FontWeight.w600, 1.43, 0.1),
      bodyLarge: style(16, FontWeight.w400, 1.5, 0.15),
      bodyMedium: style(14, FontWeight.w400, 1.43, 0.25),
      bodySmall: style(12, FontWeight.w400, 1.33, 0.4),
      labelLarge: style(14, FontWeight.w600, 1.43, 0.1),
      labelMedium: style(12, FontWeight.w500, 1.33, 0.5),
      labelSmall: style(11, FontWeight.w500, 1.45, 0.5),
    );
  }
}
