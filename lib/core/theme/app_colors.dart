import 'package:flutter/material.dart';

/// Raw palette. Only the theme files read these; widgets use
/// `Theme.of(context).colorScheme` or [AppSemanticColors] instead.
///
/// Brand values come from the original Prayosha frontend
/// (navy #1E3A5F / #13263E, amber #FFBF00 / #E0A800).
abstract final class AppPalette {
  static const navy = Color(0xFF1E3A5F);
  static const navyDark = Color(0xFF13263E);
  static const navyLight = Color(0xFF9DB7D8);
  static const amber = Color(0xFFFFBF00);
  static const amberDark = Color(0xFFE0A800);

  static const white = Color(0xFFFFFFFF);
  static const black = Color(0xFF000000);
  static const neutral50 = Color(0xFFF7F8FA);
  static const neutral100 = Color(0xFFEEF1F5);
  static const neutral200 = Color(0xFFDCE1E8);
  static const neutral400 = Color(0xFF8B95A5);
  static const neutral600 = Color(0xFF4F5968);
  static const neutral800 = Color(0xFF232A35);
  static const neutral900 = Color(0xFF151A22);
  static const neutral950 = Color(0xFF0D1117);

  static const green600 = Color(0xFF1E7B46);
  static const green300 = Color(0xFF7FD3A2);
  static const orange700 = Color(0xFFB35900);
  static const orange300 = Color(0xFFFFB86B);
  static const red700 = Color(0xFFB3261E);
  static const red300 = Color(0xFFF2B8B5);
  static const blue700 = Color(0xFF1F5FAD);
  static const blue300 = Color(0xFF9CC3F5);
}

/// Semantic colours not covered by [ColorScheme] (status colours).
@immutable
class AppSemanticColors extends ThemeExtension<AppSemanticColors> {
  const AppSemanticColors({
    required this.success,
    required this.onSuccess,
    required this.warning,
    required this.onWarning,
    required this.info,
    required this.onInfo,
    required this.mutedText,
  });

  final Color success;
  final Color onSuccess;
  final Color warning;
  final Color onWarning;
  final Color info;
  final Color onInfo;

  /// Secondary text that must still meet 4.5:1 contrast on surfaces.
  final Color mutedText;

  static const light = AppSemanticColors(
    success: AppPalette.green600,
    onSuccess: AppPalette.white,
    warning: AppPalette.orange700,
    onWarning: AppPalette.white,
    info: AppPalette.blue700,
    onInfo: AppPalette.white,
    mutedText: AppPalette.neutral600,
  );

  static const dark = AppSemanticColors(
    success: AppPalette.green300,
    onSuccess: AppPalette.neutral950,
    warning: AppPalette.orange300,
    onWarning: AppPalette.neutral950,
    info: AppPalette.blue300,
    onInfo: AppPalette.neutral950,
    mutedText: AppPalette.neutral400,
  );

  @override
  AppSemanticColors copyWith({
    Color? success,
    Color? onSuccess,
    Color? warning,
    Color? onWarning,
    Color? info,
    Color? onInfo,
    Color? mutedText,
  }) {
    return AppSemanticColors(
      success: success ?? this.success,
      onSuccess: onSuccess ?? this.onSuccess,
      warning: warning ?? this.warning,
      onWarning: onWarning ?? this.onWarning,
      info: info ?? this.info,
      onInfo: onInfo ?? this.onInfo,
      mutedText: mutedText ?? this.mutedText,
    );
  }

  @override
  AppSemanticColors lerp(ThemeExtension<AppSemanticColors>? other, double t) {
    if (other is! AppSemanticColors) return this;
    return AppSemanticColors(
      success: Color.lerp(success, other.success, t)!,
      onSuccess: Color.lerp(onSuccess, other.onSuccess, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      onWarning: Color.lerp(onWarning, other.onWarning, t)!,
      info: Color.lerp(info, other.info, t)!,
      onInfo: Color.lerp(onInfo, other.onInfo, t)!,
      mutedText: Color.lerp(mutedText, other.mutedText, t)!,
    );
  }
}

/// Colour schemes for light and dark themes.
abstract final class AppColorSchemes {
  static const light = ColorScheme(
    brightness: Brightness.light,
    primary: AppPalette.navy,
    onPrimary: AppPalette.white,
    primaryContainer: Color(0xFFD5E3F5),
    onPrimaryContainer: AppPalette.navyDark,
    secondary: AppPalette.amber,
    onSecondary: AppPalette.navyDark,
    secondaryContainer: Color(0xFFFFE9A8),
    onSecondaryContainer: Color(0xFF3D2E00),
    tertiary: AppPalette.blue700,
    onTertiary: AppPalette.white,
    error: AppPalette.red700,
    onError: AppPalette.white,
    errorContainer: Color(0xFFF9DEDC),
    onErrorContainer: Color(0xFF410E0B),
    surface: AppPalette.white,
    onSurface: AppPalette.neutral900,
    surfaceContainerLowest: AppPalette.white,
    surfaceContainerLow: AppPalette.neutral50,
    surfaceContainer: AppPalette.neutral100,
    surfaceContainerHigh: AppPalette.neutral100,
    surfaceContainerHighest: AppPalette.neutral200,
    onSurfaceVariant: AppPalette.neutral600,
    outline: AppPalette.neutral400,
    outlineVariant: AppPalette.neutral200,
    shadow: AppPalette.black,
    scrim: AppPalette.black,
    inverseSurface: AppPalette.neutral800,
    onInverseSurface: AppPalette.neutral50,
    inversePrimary: AppPalette.navyLight,
  );

  static const dark = ColorScheme(
    brightness: Brightness.dark,
    primary: AppPalette.navyLight,
    onPrimary: AppPalette.navyDark,
    primaryContainer: AppPalette.navy,
    onPrimaryContainer: Color(0xFFD5E3F5),
    secondary: AppPalette.amber,
    onSecondary: AppPalette.navyDark,
    secondaryContainer: Color(0xFF5C4600),
    onSecondaryContainer: Color(0xFFFFE9A8),
    tertiary: AppPalette.blue300,
    onTertiary: AppPalette.neutral950,
    error: AppPalette.red300,
    onError: Color(0xFF601410),
    errorContainer: Color(0xFF8C1D18),
    onErrorContainer: Color(0xFFF9DEDC),
    surface: AppPalette.neutral950,
    onSurface: AppPalette.neutral100,
    surfaceContainerLowest: AppPalette.neutral950,
    surfaceContainerLow: AppPalette.neutral900,
    surfaceContainer: AppPalette.neutral900,
    surfaceContainerHigh: AppPalette.neutral800,
    surfaceContainerHighest: AppPalette.neutral800,
    onSurfaceVariant: AppPalette.neutral400,
    outline: AppPalette.neutral600,
    outlineVariant: AppPalette.neutral800,
    shadow: AppPalette.black,
    scrim: AppPalette.black,
    inverseSurface: AppPalette.neutral100,
    onInverseSurface: AppPalette.neutral900,
    inversePrimary: AppPalette.navy,
  );
}

extension AppColorsContext on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;
  AppSemanticColors get semanticColors => Theme.of(this).extension<AppSemanticColors>()!;
}
