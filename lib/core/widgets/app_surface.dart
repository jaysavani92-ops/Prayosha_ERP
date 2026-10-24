import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_tokens.dart';

/// A raised surface: hairline border, soft layered shadow, rounded corners.
/// When [interactive], it lifts a little further on hover (mouse and
/// trackpad) by deepening its shadow only, so nothing around it moves; the
/// change is instant when the system asks for reduced motion.
class AppSurface extends StatefulWidget {
  const AppSurface({
    super.key,
    required this.child,
    this.borderColor,
    this.borderWidth = 1,
    this.borderRadius = AppRadius.lgAll,
    this.interactive = false,
  });

  final Widget child;

  /// Defaults to the theme's hairline (`outlineVariant`).
  final Color? borderColor;
  final double borderWidth;
  final BorderRadius borderRadius;
  final bool interactive;

  @override
  State<AppSurface> createState() => _AppSurfaceState();
}

class _AppSurfaceState extends State<AppSurface> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final surface = AnimatedContainer(
      duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : AppDurations.fast,
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: widget.borderRadius,
        border: Border.all(color: widget.borderColor ?? colors.outlineVariant, width: widget.borderWidth),
        boxShadow: _hovered ? AppShadows.cardHover : AppShadows.card,
      ),
      child: ClipRRect(borderRadius: widget.borderRadius, child: widget.child),
    );
    if (!widget.interactive) return surface;
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: surface,
    );
  }
}
