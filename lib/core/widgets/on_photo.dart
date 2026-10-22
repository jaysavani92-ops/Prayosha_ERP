import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Applies the dark theme to chrome drawn directly over brand photography
/// (status pills, language switcher, footer), whatever the app's theme mode:
/// the photo is dark behind its scrim, so text and controls need the dark
/// palette's light foregrounds. Unselected segmented buttons get a scrim of
/// their own, so they stay legible over bright parts of the photo.
class OnPhoto extends StatelessWidget {
  const OnPhoto({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final base = AppTheme.dark(Localizations.localeOf(context));
    final scrim = base.extension<AppSemanticColors>()!.brandNavy.withValues(alpha: 0.72);
    final scheme = base.colorScheme;
    final segmented = SegmentedButton.styleFrom(
      backgroundColor: scrim,
      foregroundColor: scheme.onSurface,
      selectedBackgroundColor: scheme.secondary,
      selectedForegroundColor: scheme.onSecondary,
      side: BorderSide(color: scheme.onSurface.withValues(alpha: 0.4)),
    ).merge(base.segmentedButtonTheme.style);

    return Theme(
      data: base.copyWith(segmentedButtonTheme: SegmentedButtonThemeData(style: segmented)),
      child: child,
    );
  }
}
