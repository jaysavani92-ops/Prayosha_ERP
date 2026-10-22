import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_field_border.dart';
import 'app_tokens.dart';
import 'app_typography.dart';

/// Builds the light and dark [ThemeData] for a locale. All component styling
/// lives here so widgets never set colours or text styles inline.
abstract final class AppTheme {
  static ThemeData light(Locale locale) => _build(AppColorSchemes.light, AppSemanticColors.light, locale);

  static ThemeData dark(Locale locale) => _build(AppColorSchemes.dark, AppSemanticColors.dark, locale);

  static ThemeData _build(ColorScheme scheme, AppSemanticColors semantic, Locale locale) {
    final textTheme = AppTypography.textTheme(locale, scheme.onSurface);
    // Fields: soft fill, hairline edge at rest; on focus the edge, label and
    // icons turn primary; errors use the error colour instead.
    BorderSide edge(Color color, [double width = AppField.borderWidth]) => BorderSide(color: color, width: width);
    final fieldBorder = AppFieldBorder(borderRadius: AppRadius.controlAll, borderSide: edge(scheme.outlineVariant));
    // InputDecorator draws floating labels at 75 % size, so a 16 dp style
    // renders as a readable 12 dp label inside the field.
    final fieldLabel = textTheme.bodyLarge!.copyWith(fontWeight: FontWeight.w500);
    Color fieldAccent(Set<WidgetState> states, Color rest) {
      if (states.contains(WidgetState.error)) return scheme.error;
      if (states.contains(WidgetState.focused)) return scheme.primary;
      return rest;
    }

    const buttonPadding = EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.md);
    const buttonShape = RoundedRectangleBorder(borderRadius: AppRadius.controlAll);
    const minButtonSize = Size(64, 48); // >= 48dp touch target

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      textTheme: textTheme,
      fontFamily: AppTypography.primaryFamily(locale),
      fontFamilyFallback: AppTypography.fallbackFamilies(locale),
      scaffoldBackgroundColor: scheme.surfaceContainerLow,
      extensions: [semantic],
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      // A clearly visible focus ring for keyboard users on web/desktop.
      focusColor: scheme.secondary.withValues(alpha: 0.35),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge,
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.lgAll,
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLow,
        hoverColor: scheme.onSurface.withValues(alpha: 0.04),
        contentPadding: AppField.padding,
        // The label is always visible: inside the empty field at rest, then
        // small at its top edge once focused or filled. No placeholder text
        // repeating the label, so fields stay quiet.
        floatingLabelBehavior: FloatingLabelBehavior.auto,
        border: fieldBorder,
        enabledBorder: fieldBorder,
        disabledBorder: fieldBorder.copyWith(borderSide: edge(scheme.outlineVariant.withValues(alpha: 0.5))),
        focusedBorder: fieldBorder.copyWith(borderSide: edge(scheme.primary, AppField.focusBorderWidth)),
        errorBorder: fieldBorder.copyWith(borderSide: edge(scheme.error)),
        focusedErrorBorder: fieldBorder.copyWith(borderSide: edge(scheme.error, AppField.focusBorderWidth)),
        labelStyle: fieldLabel.copyWith(color: scheme.onSurfaceVariant),
        floatingLabelStyle: WidgetStateTextStyle.resolveWith(
          (states) => fieldLabel.copyWith(color: fieldAccent(states, scheme.onSurfaceVariant)),
        ),
        hintStyle: textTheme.bodyLarge?.copyWith(color: semantic.mutedText),
        prefixIconColor: WidgetStateColor.resolveWith((states) => fieldAccent(states, scheme.onSurfaceVariant)),
        suffixIconColor: WidgetStateColor.resolveWith((states) => fieldAccent(states, scheme.onSurfaceVariant)),
        errorStyle: textTheme.bodySmall?.copyWith(color: scheme.error),
        errorMaxLines: 3,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: minButtonSize,
          padding: buttonPadding,
          shape: buttonShape,
          textStyle: textTheme.labelLarge,
          // Brand accent: amber icon on navy (6.6:1). The dark theme's light
          // navy button is too pale for amber, so it keeps the default.
          iconColor: scheme.brightness == Brightness.light ? scheme.secondary : null,
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          selectedBackgroundColor: scheme.secondary,
          selectedForegroundColor: scheme.onSecondary,
          textStyle: textTheme.labelLarge,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: minButtonSize,
          padding: buttonPadding,
          shape: buttonShape,
          textStyle: textTheme.labelLarge,
          side: BorderSide(color: scheme.outline),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 48),
          shape: buttonShape,
          textStyle: textTheme.labelLarge,
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.lgAll),
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: scheme.onInverseSurface),
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.mdAll),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: scheme.secondaryContainer,
        labelTextStyle: WidgetStatePropertyAll(textTheme.labelMedium),
      ),
      // Navigation: the active destination sits on a pale-navy pill with a
      // filled navy icon and a bold label (phone dock, rail and sidebar).
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primaryContainer,
        indicatorShape: const StadiumBorder(),
        selectedIconTheme: IconThemeData(color: scheme.onPrimaryContainer, size: AppNav.iconSize),
        unselectedIconTheme: IconThemeData(color: scheme.onSurfaceVariant, size: AppNav.iconSize),
        selectedLabelTextStyle: textTheme.labelLarge?.copyWith(color: scheme.primary, fontWeight: FontWeight.w700),
        unselectedLabelTextStyle: textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant),
      ),
      bottomAppBarTheme: BottomAppBarThemeData(
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 8,
        shadowColor: scheme.shadow,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: scheme.outlineVariant,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl))),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, thickness: 1, space: 1),
      listTileTheme: ListTileThemeData(
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.mdAll),
        titleTextStyle: textTheme.bodyLarge,
        subtitleTextStyle: textTheme.bodySmall?.copyWith(color: semantic.mutedText),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }
}
