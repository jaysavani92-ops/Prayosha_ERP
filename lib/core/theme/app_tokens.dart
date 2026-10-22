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

  /// Text fields and buttons, so a field and the button under it match.
  static const double control = 14;
  static const double lg = 16;

  /// Surfaces that float over photography (the sign-in card).
  static const double xl = 24;
  static const double pill = 999;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius controlAll = BorderRadius.all(Radius.circular(control));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius pillAll = BorderRadius.all(Radius.circular(pill));
}

abstract final class AppShadows {
  static const List<BoxShadow> sm = [BoxShadow(color: Color(0x14000000), blurRadius: 4, offset: Offset(0, 1))];
  static const List<BoxShadow> md = [BoxShadow(color: Color(0x1A000000), blurRadius: 12, offset: Offset(0, 4))];
}

/// Liquid glass (surfaces floating over photography, see `GlassSurface`).
abstract final class AppGlass {
  /// Backdrop blur. Strong enough that the photo reads as colour and light,
  /// never as detail competing with the text.
  static const double blurSigma = 8;

  /// Backdrop saturation boost, so the glass carries the photo's warmth
  /// instead of looking grey.
  static const double saturation = 1;

  /// Width of the specular rim.
  static const double rimWidth = 1;

  /// Colour of reflected light (rim and sheen): white in both themes.
  static const Color highlight = Color.fromARGB(255, 255, 255, 255);

  /// Tint opacity, top-left to bottom-right, per theme brightness: low, so
  /// the glass reads as clear. Text inside still keeps 4.5:1 over the
  /// darkest scrimmed photo because secondary text darkens on glass
  /// ([secondaryTextOpacity]); the widget tests check it against plain navy.
  static const (double, double) lightTint = (0.20, 0.12);
  static const (double, double) darkTint = (0.20, 0.12);

  /// Backdrop luminance compression, applied to the blurred photo under the
  /// tint (how system glass materials stay legible with a clear tint). Each
  /// channel becomes `scale * c + lift * 255`:
  ///  - light: black becomes 59 % grey, so navy text keeps about 4.8:1 even
  ///    over the darkest photo at the clearest corner of the tint;
  ///  - dark: white becomes 30 % grey, so light text and the light-navy
  ///    accent keep at least 4.5:1 over the brightest sky.
  /// Shapes and colour still show through; only the range narrows.
  static const (double scale, double lift) lightBackdrop = (0.41, 0.59);
  static const (double scale, double lift) darkBackdrop = (0.3, 0);

  /// Soft shadow outside the sheet only (never under it, where it would
  /// show through), so the card stands out from the photo.
  static const Color shadow = Color(0x4D000000);
  static const double shadowBlur = 32;
  static const double shadowOffsetY = 12;

  /// Secondary text (subtitles, field labels, hints, icons) on glass: the
  /// primary text colour at this opacity, instead of the usual muted grey,
  /// which is too light on a clear tint.
  static const double secondaryTextOpacity = 0.8;

  /// Soft glow just inside the rim, which gives the sheet its thickness.
  static const double edgeGlowWidth = 2;

  /// Text field fill inside glass: nearly opaque, so fields read as crisp,
  /// clean inlays on the clear sheet (a thin fill over glass looks muddy).
  static const double lightFieldFill = 0.3;
  static const double darkFieldFill = 0.1;
}

/// Text field geometry (see `AppFieldBorder` and `AppTheme`).
abstract final class AppField {
  static const double borderWidth = 1;
  static const double focusBorderWidth = 1;

  /// Inner padding: a single-line field is about 60 dp tall, with room for
  /// the label at its top edge once it floats.
  static const EdgeInsets padding = EdgeInsets.fromLTRB(16, 10, 16, 10);
}

/// App navigation (phone dock, rail / sidebar, Hub button).
abstract final class AppNav {
  /// Phone dock: a white rounded bar floating [dockMargin] from the edges.
  static const double dockMargin = 12;
  static const double dockRadius = 26;

  /// Hub on the dock: a navy circle rising [hubRise] above the dock's top
  /// edge, ringed in [hubRingWidth] of dock colour so it reads as one piece.
  static const double hubDiameter = 52;
  static const double hubRingWidth = 4;
  static const double hubRise = 24;

  /// Width kept for the Hub in the middle of the dock.
  static const double hubSlotWidth = 70;

  /// Round Hub button on the compact rail.
  static const double railHubDiameter = 48;

  /// Active tab: a short amber underline below the label.
  static const double underlineWidth = 16;
  static const double underlineHeight = 3;

  static const double iconSize = 22;

  /// Press feedback (scale while pressed) for the Hub.
  static const double pressedScale = 0.94;

  /// Sidebar width on large windows.
  static const double sidebarWidth = 240;
}

abstract final class AppDurations {
  static const fast = Duration(milliseconds: 150);
  static const medium = Duration(milliseconds: 250);
  static const slow = Duration(milliseconds: 400);
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
