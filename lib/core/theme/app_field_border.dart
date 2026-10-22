import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';

/// Text field border: a rounded rectangle all the way round (not an
/// underline), with an optional halo ring outside it for focus.
///
/// Unlike [OutlineInputBorder] it is not an "outline" border, so the
/// floating label sits inside the field's top edge instead of cutting a gap
/// into the stroke. The theme animates between states with [lerpFrom] /
/// [lerpTo], so focus and error rings fade in rather than snap.
class AppFieldBorder extends InputBorder {
  const AppFieldBorder({
    super.borderSide = const BorderSide(),
    this.borderRadius = BorderRadius.zero,
    this.halo = BorderSide.none,
  });

  final BorderRadius borderRadius;

  /// Ring drawn outside the field (its width is the ring's thickness).
  final BorderSide halo;

  @override
  bool get isOutline => false;

  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.all(borderSide.width);

  @override
  AppFieldBorder copyWith({BorderSide? borderSide, BorderRadius? borderRadius, BorderSide? halo}) => AppFieldBorder(
    borderSide: borderSide ?? this.borderSide,
    borderRadius: borderRadius ?? this.borderRadius,
    halo: halo ?? this.halo,
  );

  @override
  AppFieldBorder scale(double t) =>
      AppFieldBorder(borderSide: borderSide.scale(t), borderRadius: borderRadius * t, halo: halo.scale(t));

  @override
  ShapeBorder? lerpFrom(ShapeBorder? a, double t) {
    if (a is AppFieldBorder) {
      return AppFieldBorder(
        borderSide: BorderSide.lerp(a.borderSide, borderSide, t),
        borderRadius: BorderRadius.lerp(a.borderRadius, borderRadius, t)!,
        halo: _lerpHalo(a.halo, halo, t),
      );
    }
    return super.lerpFrom(a, t);
  }

  @override
  ShapeBorder? lerpTo(ShapeBorder? b, double t) {
    if (b is AppFieldBorder) {
      return AppFieldBorder(
        borderSide: BorderSide.lerp(borderSide, b.borderSide, t),
        borderRadius: BorderRadius.lerp(borderRadius, b.borderRadius, t)!,
        halo: _lerpHalo(halo, b.halo, t),
      );
    }
    return super.lerpTo(b, t);
  }

  /// Fades the ring in and out at full thickness, rather than growing it.
  static BorderSide _lerpHalo(BorderSide a, BorderSide b, double t) {
    final width = a.style == BorderStyle.none
        ? b.width
        : (b.style == BorderStyle.none ? a.width : lerpDouble(a.width, b.width, t)!);
    final from = a.style == BorderStyle.none ? b.color.withValues(alpha: 0) : a.color;
    final to = b.style == BorderStyle.none ? a.color.withValues(alpha: 0) : b.color;
    return BorderSide(color: Color.lerp(from, to, t)!, width: width);
  }

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) =>
      Path()..addRRect(borderRadius.resolve(textDirection).toRRect(rect).deflate(borderSide.width));

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) =>
      Path()..addRRect(borderRadius.resolve(textDirection).toRRect(rect));

  @override
  void paint(
    Canvas canvas,
    Rect rect, {
    double? gapStart,
    double gapExtent = 0,
    double gapPercentage = 0,
    TextDirection? textDirection,
  }) {
    final shape = borderRadius.resolve(textDirection).toRRect(rect);
    if (halo.style != BorderStyle.none && halo.width > 0 && halo.color.a > 0) {
      canvas.drawRRect(shape.inflate(halo.width / 2), halo.toPaint());
    }
    if (borderSide.style != BorderStyle.none && borderSide.width > 0) {
      canvas.drawRRect(shape.deflate(borderSide.width / 2), borderSide.toPaint());
    }
  }

  @override
  bool operator ==(Object other) =>
      other is AppFieldBorder &&
      other.borderSide == borderSide &&
      other.borderRadius == borderRadius &&
      other.halo == halo;

  @override
  int get hashCode => Object.hash(borderSide, borderRadius, halo);
}
