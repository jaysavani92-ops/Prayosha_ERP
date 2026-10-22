import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_tokens.dart';

/// Liquid-glass sheet for content floating over photography (the sign-in
/// card). Layers, back to front:
///  1. a soft shadow outside the sheet only, so it stands out from the photo;
///  2. the photo behind it, blurred, then compressed into a light (or, in
///     dark mode, dark) range, so text stays readable however dark or bright
///     the photo is (`AppGlass.lightBackdrop` / `darkBackdrop`);
///  3. a clear tint of the theme surface;
///  4. a soft sheen across the top, like light catching a curved edge;
///  5. the content: text fields are crisp, nearly opaque inlays, and
///     secondary text uses the primary text colour at reduced opacity;
///  6. a soft glow just inside the edge and a specular rim.
///
/// Light and dark themes both work: the tint is the theme's surface colour.
class GlassSurface extends StatelessWidget {
  const GlassSurface({super.key, required this.child, this.borderRadius = AppRadius.xlAll, this.tint});

  final Widget child;
  final BorderRadius borderRadius;

  /// Tint opacity (top-left, bottom-right), overriding the theme's
  /// [AppGlass.lightTint] / [AppGlass.darkTint]: e.g. a denser, brighter
  /// frost for navigation chrome over a light page.
  final (double, double)? tint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.colors;
    final light = colors.brightness == Brightness.light;
    final (tintStart, tintEnd) = tint ?? (light ? AppGlass.lightTint : AppGlass.darkTint);
    final secondary = colors.onSurface.withValues(alpha: AppGlass.secondaryTextOpacity);
    final input = theme.inputDecorationTheme;

    final (scale, lift) = light ? AppGlass.lightBackdrop : AppGlass.darkBackdrop;

    // The shadow is painted outside the sheet only; see _GlassShadowPainter.
    return CustomPaint(
      painter: _GlassShadowPainter(borderRadius: borderRadius),
      child: ClipRRect(
        borderRadius: borderRadius,
        child: BackdropFilter(
          filter: ImageFilter.compose(
            outer: ImageFilter.blur(sigmaX: AppGlass.blurSigma, sigmaY: AppGlass.blurSigma, tileMode: TileMode.mirror),
            inner: ColorFilter.matrix(_backdropMatrix(AppGlass.saturation, scale, lift)),
          ),
          child: CustomPaint(
            painter: _GlassBodyPainter(
              borderRadius: borderRadius,
              tint: colors.surface,
              tintStart: tintStart,
              tintEnd: tintEnd,
              sheen: light ? 0.45 : 0.08,
            ),
            foregroundPainter: _GlassRimPainter(borderRadius: borderRadius, strength: light ? 1.0 : 0.5),
            child: Theme(
              data: theme.copyWith(
                colorScheme: colors.copyWith(onSurfaceVariant: secondary),
                extensions: [context.semanticColors.copyWith(mutedText: secondary)],
                inputDecorationTheme: input.copyWith(
                  fillColor: colors.surface.withValues(alpha: light ? AppGlass.lightFieldFill : AppGlass.darkFieldFill),
                  labelStyle: input.labelStyle?.copyWith(color: secondary),
                  hintStyle: input.hintStyle?.copyWith(color: secondary),
                  // Resting colours darken on glass; focus and error keep the
                  // theme's accents.
                  floatingLabelStyle: WidgetStateTextStyle.resolveWith((states) {
                    final themed = WidgetStateProperty.resolveAs<TextStyle?>(input.floatingLabelStyle, states);
                    return _accented(states)
                        ? themed ?? const TextStyle()
                        : (themed ?? const TextStyle()).copyWith(color: secondary);
                  }),
                  prefixIconColor: WidgetStateColor.resolveWith(
                    (states) => _accented(states)
                        ? WidgetStateProperty.resolveAs<Color?>(input.prefixIconColor, states) ?? secondary
                        : secondary,
                  ),
                  suffixIconColor: WidgetStateColor.resolveWith(
                    (states) => _accented(states)
                        ? WidgetStateProperty.resolveAs<Color?>(input.suffixIconColor, states) ?? secondary
                        : secondary,
                  ),
                ),
              ),
              // Ink from buttons inside paints on the glass, not under it.
              child: Material(type: MaterialType.transparency, child: child),
            ),
          ),
        ),
      ),
    );
  }

  static bool _accented(Set<WidgetState> states) =>
      states.contains(WidgetState.focused) || states.contains(WidgetState.error);

  /// Colour matrix for the backdrop: saturation [s] around Rec. 709
  /// luminance, then each channel compressed to `scale * c + lift * 255`.
  static List<double> _backdropMatrix(double s, double scale, double lift) {
    const r = 0.2126, g = 0.7152, b = 0.0722;
    final i = 1 - s;
    final offset = lift * 255;
    return [
      scale * (r * i + s), scale * g * i, scale * b * i, 0, offset, //
      scale * r * i, scale * (g * i + s), scale * b * i, 0, offset, //
      scale * r * i, scale * g * i, scale * (b * i + s), 0, offset, //
      0, 0, 0, 1, 0,
    ];
  }
}

/// Soft drop shadow drawn only outside the sheet: the canvas is clipped to
/// everything except the sheet, so the translucent glass never shows a
/// shadow through itself.
class _GlassShadowPainter extends CustomPainter {
  const _GlassShadowPainter({required this.borderRadius});

  final BorderRadius borderRadius;

  @override
  void paint(Canvas canvas, Size size) {
    final sheet = borderRadius.toRRect(Offset.zero & size);
    const reach = AppGlass.shadowBlur * 2 + AppGlass.shadowOffsetY;
    canvas
      ..save()
      ..clipPath(
        Path.combine(
          PathOperation.difference,
          Path()..addRect((Offset.zero & size).inflate(reach)),
          Path()..addRRect(sheet),
        ),
      )
      ..drawRRect(
        sheet.shift(const Offset(0, AppGlass.shadowOffsetY)),
        Paint()
          ..color = AppGlass.shadow
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, AppGlass.shadowBlur / 2),
      )
      ..restore();
  }

  @override
  bool shouldRepaint(_GlassShadowPainter old) => old.borderRadius != borderRadius;
}

class _GlassBodyPainter extends CustomPainter {
  const _GlassBodyPainter({
    required this.borderRadius,
    required this.tint,
    required this.tintStart,
    required this.tintEnd,
    required this.sheen,
  });

  final BorderRadius borderRadius;
  final Color tint;
  final double tintStart;
  final double tintEnd;
  final double sheen;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final shape = borderRadius.toRRect(rect);
    canvas.drawRRect(
      shape,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            tint.withValues(alpha: tintStart),
            tint.withValues(alpha: tintEnd),
          ],
        ).createShader(rect),
    );
    // Sheen: brightest at the very top, gone by a third of the way down.
    canvas.drawRRect(
      shape,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0, 0.35],
          colors: [
            AppGlass.highlight.withValues(alpha: sheen),
            AppGlass.highlight.withValues(alpha: 0),
          ],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_GlassBodyPainter old) =>
      old.tint != tint ||
      old.tintStart != tintStart ||
      old.tintEnd != tintEnd ||
      old.sheen != sheen ||
      old.borderRadius != borderRadius;
}

class _GlassRimPainter extends CustomPainter {
  const _GlassRimPainter({required this.borderRadius, required this.strength});

  final BorderRadius borderRadius;
  final double strength;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    // Edge glow: a blurred stroke on the edge; the card's clip keeps only
    // its inner half, so light seems to gather inside the glass's edge.
    canvas.drawRRect(
      borderRadius.toRRect(rect),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = AppGlass.edgeGlowWidth
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, AppGlass.edgeGlowWidth / 2)
        ..color = AppGlass.highlight.withValues(alpha: 0.35 * strength),
    );
    const inset = AppGlass.rimWidth / 2;
    final shape = borderRadius.toRRect(rect).deflate(inset);
    canvas.drawRRect(
      shape,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = AppGlass.rimWidth
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0, 0.3, 0.7, 1],
          colors: [
            AppGlass.highlight.withValues(alpha: 0.95 * strength),
            AppGlass.highlight.withValues(alpha: 0.2 * strength),
            AppGlass.highlight.withValues(alpha: 0.1 * strength),
            AppGlass.highlight.withValues(alpha: 0.55 * strength),
          ],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(_GlassRimPainter old) => old.strength != strength || old.borderRadius != borderRadius;
}
