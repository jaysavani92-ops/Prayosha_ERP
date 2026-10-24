import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

enum AppButtonVariant { primary, secondary, text }

/// The only button widget features use. Styling comes from the theme; this
/// adds variants, a loading state (keeps width, announces progress) and
/// full-width layout.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.loadingLabel,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool isLoading;

  /// Spoken by screen readers while loading (defaults to [label]).
  final String? loadingLabel;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final onTap = isLoading ? null : onPressed;
    final child = isLoading
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox.square(dimension: AppSizes.spinner, child: CircularProgressIndicator(strokeWidth: 2)),
              const SizedBox(width: AppSpacing.sm),
              Flexible(child: Text(loadingLabel ?? label, overflow: TextOverflow.ellipsis)),
            ],
          )
        : Text(label, overflow: TextOverflow.ellipsis);

    final Widget button = switch (variant) {
      AppButtonVariant.primary =>
        icon == null || isLoading
            ? FilledButton(onPressed: onTap, child: child)
            : FilledButton.icon(onPressed: onTap, icon: Icon(icon), label: child),
      AppButtonVariant.secondary =>
        icon == null || isLoading
            ? OutlinedButton(onPressed: onTap, child: child)
            : OutlinedButton.icon(onPressed: onTap, icon: Icon(icon), label: child),
      AppButtonVariant.text =>
        icon == null || isLoading
            ? TextButton(onPressed: onTap, child: child)
            : TextButton.icon(onPressed: onTap, icon: Icon(icon), label: child),
    };

    final semantic = Semantics(button: true, enabled: onTap != null, liveRegion: isLoading, child: button);
    return expand ? SizedBox(width: double.infinity, child: semantic) : semantic;
  }
}
