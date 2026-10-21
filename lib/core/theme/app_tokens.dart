import 'package:flutter/material.dart';

/// Spacing scale (4-point grid). Use these instead of literal paddings.
abstract final class AppSpacing {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;

  /// Maximum width for readable content columns on wide screens.
  static const double contentMaxWidth = 960;

  /// Maximum width for settings-style single-column pages.
  static const double narrowContentMaxWidth = 640;

  /// Maximum width for single forms (login, dialogs).
  static const double formMaxWidth = 420;
}

abstract final class AppRadius {
  static const double sm = 6;
  static const double md = 10;
  static const double lg = 16;
  static const double pill = 999;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
}

abstract final class AppShadows {
  static const List<BoxShadow> sm = [BoxShadow(color: Color(0x14000000), blurRadius: 4, offset: Offset(0, 1))];
  static const List<BoxShadow> md = [BoxShadow(color: Color(0x1A000000), blurRadius: 12, offset: Offset(0, 4))];
}

abstract final class AppDurations {
  static const fast = Duration(milliseconds: 150);
  static const medium = Duration(milliseconds: 250);
}

/// Window width classes (Material 3 window size classes). Layouts branch on
/// these — never on device type, platform or a raw pixel width.
///
/// | class      | width        | typical devices                                         |
/// | ---------- | ------------ | ------------------------------------------------------- |
/// | compact    | < 600        | phones (portrait), narrow browser windows               |
/// | medium     | 600 – 839    | foldables (open), small tablets portrait, phone landscape |
/// | expanded   | 840 – 1199   | tablets landscape, iPad portrait 12.9", small laptops   |
/// | large      | 1200 – 1599  | laptops, desktop browsers                               |
/// | extraLarge | ≥ 1600       | large desktop monitors, ultrawide                       |
enum WindowSize {
  compact,
  medium,
  expanded,
  large,
  extraLarge;

  bool isAtLeast(WindowSize other) => index >= other.index;
  bool isAtMost(WindowSize other) => index <= other.index;
}

/// Window height classes. A short window (phone in landscape, split screen)
/// must not stack tall headers or fixed panels.
enum WindowHeight { compact, medium, expanded }

abstract final class AppBreakpoints {
  static const double medium = 600;
  static const double expanded = 840;
  static const double large = 1200;
  static const double extraLarge = 1600;

  static const double heightMedium = 480;
  static const double heightExpanded = 900;

  /// Smallest width the app is designed and tested for (iPhone SE 1st gen,
  /// small Android phones). Narrower windows still work but may scroll.
  static const double minSupportedWidth = 320;

  static WindowSize of(double width) {
    if (width >= extraLarge) return WindowSize.extraLarge;
    if (width >= large) return WindowSize.large;
    if (width >= expanded) return WindowSize.expanded;
    if (width >= medium) return WindowSize.medium;
    return WindowSize.compact;
  }

  static WindowHeight heightOf(double height) {
    if (height >= heightExpanded) return WindowHeight.expanded;
    if (height >= heightMedium) return WindowHeight.medium;
    return WindowHeight.compact;
  }
}

/// Text scaling bounds. 200 % is the WCAG 1.4.4 requirement; beyond it
/// layouts become unusable, so larger system settings are clamped.
abstract final class AppTextScale {
  static const double max = 2.0;
}
