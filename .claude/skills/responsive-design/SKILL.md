---
name: responsive-design
description: Use when designing or changing any screen, layout, navigation, dialog or reusable widget in the Prayosha Flutter app, so it works on every device class — small phones to ultrawide monitors, portrait and landscape, foldables, tablets, web/desktop windows, 200% text and keyboard/mouse input. Also use when a layout overflows or looks wrong on some device.
---

# Responsive design (every device)

## Purpose
Every screen must work, without overflow or clipped content, on any window from 320 px wide to 2560+ px, in both orientations, at text sizes from 100% to 200%, with touch, mouse and keyboard. One layout codebase adapts by **window size class**. There are no per-device or per-platform screens.

## When to use
- Building a new screen, section, card, list, form, dialog or navigation change.
- Changing shared widgets in `lib/core/widgets/` or the shell in `lib/app/shell/`.
- A bug report like "cut off on my phone", "too wide on desktop", "overlaps in landscape" or "text too big".

## Size classes (the only things layouts may branch on)
Defined in `lib/core/theme/app_tokens.dart`:

| Width class | Range | Typical | Navigation (AppShell) |
| --- | --- | --- | --- |
| `compact` | < 600 | phones portrait, narrow windows | bottom `NavigationBar` |
| `medium` | 600–839 | foldables, small tablets, phone landscape | `NavigationRail` (icons + labels) |
| `expanded` | 840–1199 | tablet landscape, small laptops | extended rail (unless height is compact) |
| `large` | 1200–1599 | laptops, desktop browsers | extended rail |
| `extraLarge` | ≥ 1600 | large monitors | extended rail; content capped by `ContentWidth` |

Height: `WindowHeight.compact` < 480 (phone landscape, split screen) gets no tall headers, a compact rail, and everything scrollable.

## Rules
1. **Measure space, not devices.** Use `ResponsiveBuilder` (LayoutBuilder: the space this widget really gets) inside pages. Use `context.windowSize` / `context.windowHeight` only for app-level choices. Never branch layout on `Platform.isIOS`, `kIsWeb`, device model, or `MediaQuery.size.width > 700`.
2. **Mobile-first values.** Use `responsiveValue(size, compact: …, expanded: …)`; larger classes inherit the nearest smaller value. Compare classes with `size.isAtLeast(WindowSize.expanded)`, never `size == …` (that breaks the larger classes).
3. **No fixed widths or heights for content.** Use `Expanded` / `Flexible`, `Wrap`, `AdaptiveGrid` (column count from available width) and `ContentWidth` (cap line length on wide screens). Fixed sizes are fine only for icons, avatars and touch targets.
4. **Everything scrolls.** Each page body is a scroll view. Assume the content is taller than the window (landscape phone, 200% text, open keyboard). Don't put fixed-height `Column`s on a page; use `ListView.builder` for long or unbounded lists.
5. **Text never forces width.** Long words and filenames must wrap or ellipsize (`overflow: TextOverflow.ellipsis` / `maxLines`). Don't put text in a `Row` without `Expanded`/`Flexible`. Gujarati and Devanagari need more height: never fix a text container's height.
6. **Text scaling.** Respect the system text size. It is clamped app-wide at 200% (`AppTextScale.max`, WCAG 1.4.4) in `app.dart`; never disable it per widget.
7. **Safe areas and insets.** Pages without an `AppBar` wrap their body in `SafeArea`. The shell keeps the rail and content clear of landscape notches. Forms sit in scroll views so the keyboard (`viewInsets`) never covers the focused field.
8. **Touch, mouse, keyboard.** Interactive targets are at least 48×48 dp (the theme already sets button minimums). Every action works by keyboard, with a logical Tab order (`FocusTraversalGroup`, `textInputAction`) and visible focus. Don't rely on hover alone: anything shown on hover must also be reachable by tap and focus.
9. **Navigation adapts, features don't.** One route and one ViewModel per screen. Responsive differences live only in views (layout); business logic, validation and routes are shared by every size class.
10. **Dialogs and sheets.** Use `showAppAdaptivePanel` (`lib/core/widgets/app_adaptive_panel.dart`): a full-width bottom sheet on `compact`, a centred dialog capped at `maxWidth` elsewhere, both on the root navigator so the phone dock never covers them. Panel content scrolls, and forms pad for `MediaQuery.viewInsetsOf` (keyboard). Simple confirmations use `showAppConfirmDialog`. Tables: on `compact`, render rows as stacked cards/list items instead of a sideways-scrolling table.
11. **Foldables and split screen.** Your window may be half a screen. That's why rule 1 measures constraints. For two-pane layouts on `expanded`+, put a pane boundary over a hinge when `MediaQuery.displayFeaturesOf(context)` reports one, and never place interactive content under it.
12. **Tokens only.** Spacing comes from `AppSpacing` / `pagePadding(size)` / `gutter(size)`, widths from `AppSpacing.*MaxWidth`, and fixed component sizes (icons, avatars, spinners, touch targets, tile heights) from `AppSizes`. No literal pixel values in feature views or shared widgets.
13. **Cap width by page type.** Text and forms: `ContentWidth(maxWidth: AppSpacing.narrowContentMaxWidth)` or `formMaxWidth`. Multi-column pages (dashboards, grids): `ContentWidth(maxWidth: AppSpacing.contentMaxWidthFor(size))`, which widens on `large`/`extraLarge` so big monitors aren't mostly empty margin.
14. **Never compute a height from `fontSize × height`.** Real Gujarati/Devanagari glyphs are taller than the style says. Let bars and rows size to their content (`IntrinsicHeight`, `mainAxisSize: min`) instead of measuring text by hand.

## Workflow
1. Sketch the screen for `compact` first (single column), then decide what changes at `medium` and at `expanded`+ (more columns, side-by-side panes, a wider grid). Most screens need only 1–2 variations.
2. Build with `ResponsiveBuilder` + `responsiveValue` / `AdaptiveGrid` / `ContentWidth` + tokens.
3. Run it at a few sizes: `flutter run -d chrome` and resize the window across 600 / 840 / 1200 / 1600. On a phone, check portrait, landscape and the largest system text size.
4. **Add the screen to the device matrix:** visit it in `visitAllScreens` in `test/widgets/responsive_matrix_test.dart`, with realistic long content (long names, many items).
5. `flutter test` must pass. The matrix runs 13 window sizes (320×568 → 2560×1440, including landscape, foldable and a short 1280×600 browser) in English at 1× and 2× text and in Gujarati and Hindi at 2×, with the app's **real fonts** loaded (`test/helpers/app_fonts.dart`), and opens the dialogs; any overflow, or a dialog that doesn't fit the window, fails the test.
6. If the screen adds a new shell destination, check that the rail still fits a 393 px-tall landscape window (it scrolls via `_ScrollableRail`).

## Validation checklist
- [ ] No device/platform checks for layout; only size classes and `isAtLeast`/`isAtMost`.
- [ ] No fixed content widths/heights; long text wraps or ellipsizes; page body scrolls.
- [ ] Works at 320 px wide, 393 px tall (landscape), and 2560 px wide (content capped, not stretched).
- [ ] 200% text: nothing clipped or overlapping (matrix test).
- [ ] Keyboard: Tab order logical, focus visible, Enter/Space activate, dialogs focus the safe action.
- [ ] Targets ≥ 48 dp; `meetsGuideline` a11y checks still pass (`test/widgets/app_flow_test.dart`).
- [ ] Screen added to `visitAllScreens`; `flutter analyze` and `flutter test` green.

## Relevant files
`lib/core/theme/app_tokens.dart` (classes, breakpoints, spacing, text scale) · `lib/core/widgets/responsive.dart` (`ResponsiveBuilder`, `responsiveValue`, `AdaptiveGrid`, `ContentWidth`, `pagePadding`, `gutter`, `context.windowSize`) · `lib/app/shell/app_shell.dart` (adaptive navigation) · `lib/app/app.dart` (text-scale clamp) · `test/widgets/responsive_matrix_test.dart` (device matrix) · `docs/architecture.md` ("Responsive and accessible").
