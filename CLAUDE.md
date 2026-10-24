# CLAUDE.md — Prayosha Flutter app (`frontend` branch)

Flutter 3.41 / Dart 3.11 app for Android, iOS and Web. The API lives on the `backend` branch. Architecture: `docs/architecture.md`.

## Commands
```bash
flutter pub get && flutter gen-l10n
dart format lib test && flutter analyze && flutter test     # must all pass before committing
flutter build web --release | flutter build apk --debug | flutter build ios --debug --no-codesign
```

## Rules
- **Feature-first MVVM:** View → ViewModel (Riverpod `Notifier`/`AsyncNotifier`) → Repository → Service (Dio) → Model. Widgets contain no business logic or Dio calls; ViewModels never import widgets or take a `BuildContext`.
- **Design system only:** colours from `context.colors` / `context.semanticColors`, text from `Theme.of(context).textTheme`, spacing and sizes from `app_tokens.dart`, icons and fonts from `app_assets.dart`, components from `lib/core/widgets/`. No hardcoded colours, font styles, asset paths or duplicate widgets.
- **Every user-facing string** goes in all three ARB files (`lib/l10n/app_{en,gu,hi}.arb`) and is read with `context.l10n`. That includes errors (`localizedFailure`), validation (`ValidationError.message`), dialogs and snackbars.
- **Every screen works on every device** (320 px phone → 2560 px monitor, both orientations, 200 % text, en/gu/hi). Follow the `responsive-design` skill (`.claude/skills/responsive-design/SKILL.md`) for every new or changed screen, widget, dialog or form:
  - Branch only on size classes (`ResponsiveBuilder`, `responsiveValue`, `isAtLeast`), never on platform, device or raw pixel widths.
  - No fixed content widths/heights: `Expanded`/`Flexible`, `Wrap`, `AdaptiveGrid`, `ContentWidth`; page bodies scroll; text in a `Row` is `Expanded`/`Flexible` with `maxLines`/`overflow` where it must stay on one line.
  - Sizes from tokens only (`AppSpacing`, `AppSizes`, `AppRadius`, `AppSpacing.contentMaxWidthFor`); text from the theme's `textTheme`, never scaled by screen size; system text scaling is respected (clamped at 200 % in `app.dart`).
  - Add each new screen and dialog to `test/widgets/responsive_matrix_test.dart` (runs with the real fonts).
- Handle loading, empty, success and error states (`AppLoadingIndicator`, `AppEmptyState`, `AppErrorView`).
- Only real API endpoints (see the backend's `docs/api-guidelines.md`); never invent endpoints or asset paths. No secrets in client code; `--dart-define` values are public.
- Tests for every service, ViewModel and screen (`test/helpers/` has fakes and pump helpers).
