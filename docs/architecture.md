# Architecture

Audience: engineers adding features to the Prayosha Flutter app.

## Audit (2026-10-21)

The `frontend` branch was empty: the previous static HTML/JS frontend had just been removed, and it remains on `main`. Carried over from that frontend:
- brand colours (navy `#1E3A5F` / `#13263E`, amber `#FFBF00` / `#E0A800`);
- the existing Gujarati and Hindi wording for the brand, tagline and login screen;
- the role names and upload categories, which now match the API's enums.

The old frontend's Poppins font has no Gujarati glyphs, so it was replaced with Noto Sans families that do.

## Layers (feature-first MVVM)

```
View (widget)  ──watch/read──►  ViewModel (Notifier / AsyncNotifier)
                                   │
                                   ▼
                               Repository  ──►  Service (Dio, JSON → Model)  ──►  API
```

| Layer | Responsibility | Must not |
| --- | --- | --- |
| View | Layout, localization, user input, navigation intents | contain business rules, call Dio, hardcode colours/text/assets |
| ViewModel | Screen state, validation, orchestration | import widgets or `BuildContext` |
| Repository | Domain API for features (session handling, caching decisions) | know about HTTP details |
| Service | One HTTP call per method; maps `DioException` → `ApiFailure`, JSON → models | hold state |
| Model | Typed, immutable data with strict `fromJson` | have side effects |

Failures are typed (`ApiFailure` with the API's `error.code`), and they are localized in exactly one place (`core/l10n/error_messages.dart`). Validation returns codes (`ValidationError`), and views translate them.

## Folder structure

```
lib/
  main.dart                 path URL strategy + bootstrap
  app/
    app.dart                MaterialApp.router (theme, locale, router)
    bootstrap.dart          SharedPreferences, provider overrides, ProviderScope
    router/                 routes (AppRoutes), GoRouter + pure authRedirect()
    shell/app_shell.dart    responsive navigation (phone dock / rail / sidebar) with the Hub
    shell/hub_panel.dart    Hub: quick actions + coming-soon suites (sheet on phones, panel elsewhere)
  core/
    assets/                 AppFonts, AppImages, AppIcons — the only place asset names live
    config/                 AppConfig (dart-define values)
    l10n/                   AppLanguage + LanguageController, AppFormatters, error/validation messages
    network/                createDio, AuthInterceptor, SessionBridge, ApiFailure, JSON helpers
    storage/                preferences, SessionStorage (secure storage / browser cookie)
    theme/                  AppPalette, color schemes, semantic colours, tokens, typography, themes
    validation/             Validators
    widgets/                AppButton, AppTextField, AppCard, dialogs/snackbars, AppTopBar,
                            showAppAdaptivePanel (bottom sheet on phones, dialog elsewhere),
                            loading/empty/error states, LanguageSelector, ResponsiveBuilder,
                            OnPhoto (dark-theme chrome over photography),
                            GlassSurface (liquid-glass card over photography)
  features/
    auth/                   models, services, repositories, viewmodels, views  (example MVVM feature)
    uploads/                recent uploads list (loading / empty / success / error)
    projects/               Project Directory, the home tab (/dashboard): header, KPI cards,
                            active workspace, search and filter (incl. archive), project cards,
                            zone inspector, WhatsApp preview, archive and restore.
                            Runs on SampleProjectsRepository until the projects/zones API
                            exists; swap projectsRepositoryProvider then.
    tasks/  workforce/  pre_development/  settings/  splash/
  l10n/                     app_en.arb, app_gu.arb, app_hi.arb  (gen/ is generated, git-ignored)
test/
  core/                     font coverage, localization, formatters, network, validators
  features/                 services, repositories, ViewModels, router redirects
  widgets/                  app flows, responsive shell, keyboard/a11y, design system components
  helpers/                  fakes (mocktail, fake Dio adapter), pump helpers
```

Dependency direction: `features → core`; `app` wires both. Core never imports a feature. The authenticated Dio needs the session, so core declares a `SessionBridge` interface, and the app layer provides the auth feature's implementation (`appOverrides()` in `bootstrap.dart`).

## Design system

- **Colours.** `AppPalette` holds the raw values and is read only by theme files. Widgets use `context.colors` (the `ColorScheme`) and `context.semanticColors` (success, warning, info, muted text, and `brandNavy`, which stays the same in both themes for scrims over photos and the logo tile). Light and dark schemes are defined explicitly.
- **Typography.** `AppTypography.textTheme(locale)` picks the primary font for the UI language (English → Plus Jakarta Sans, Gujarati → Noto Sans Gujarati, Hindi → Noto Sans Devanagari). Noto Sans is the Latin fallback inside Gujarati/Hindi text, and the Indic families cover language names in English. English gets a fifth of Material's default letter spacing (Jakarta is already open); Indic scripts get 12% more line height. Language names always use their own script's font (`AppTypography.forScript`).
- **Images.** `assets/images/login_background.jpg` is the original frontend's sign-in photo, resized to 1601 × 2844 (512 KB). Chrome drawn over it (language switcher, footer) is wrapped in `OnPhoto`, which applies the dark theme so foregrounds stay light whatever the theme mode. The sign-in card is a `GlassSurface` (blurred, saturated backdrop under a clear tint, with an edge glow and specular rim; values in `AppGlass`). Its tint is low, so secondary text inside it uses the primary text colour at 78 % opacity rather than the muted grey; the contrast test checks this against plain navy, the worst case behind the glass.
- **Tokens.** `AppSpacing` (4-point scale plus content widths), `AppSizes` (icons, touch targets, avatars), `AppRadius`, `AppShadows`, `AppDurations`, `AppTextScale`, and `AppBreakpoints`. The breakpoints are Material 3 window size classes: compact < 600, medium < 840, expanded < 1200, large < 1600, extraLarge ≥ 1600, plus height classes for short windows.
- **Text fields.** Filled, 14 dp corners (`AppRadius.control`, shared with buttons), label inside the top edge, hairline edge at rest; focus turns the edge, label and icons primary, errors the same in the error colour. The shape is `AppFieldBorder` (core/theme), sizes are `AppField` tokens.
- **Components.** Features compose `core/widgets`; they don't style Material widgets directly. Component styling (buttons, inputs, cards, dialogs, navigation, snackbars) lives in `AppTheme`.

## Localization

- gen_l10n with `l10n.yaml`, and `AppLocalizations` via `context.l10n`.
- `LanguageController` persists the choice in SharedPreferences. On first launch it picks the device language if supported, else English. Switching rebuilds `MaterialApp` immediately, and a snackbar confirms the change in the new language.
- `AppFormatters` formats dates (`DateFormat.yMMMd`, month names in the UI language), numbers and rupees (Indian lakh/crore grouping in every language, `en_IN` for English).
- Language names are shown as autonyms (English, ગુજરાતી, हिन्दी) in every UI language, on purpose.

## Auth and sessions (against the `backend` branch API)

- The sign-in form asks for a **password**, not the old frontend's 4-digit PIN: the API requires passwords of at least 8 characters (`users.schema.ts` on the `backend` branch), so a PIN-only field would reject every real account. There is no self-service reset; "Forgot password?" explains that an administrator resets it (`PUT /api/v1/users/:id/password`).
- `POST /api/v1/auth/login` returns a 15-minute access token, which is kept **in memory only**, plus a rotating refresh token.
- **Web:** the refresh token is an httpOnly, SameSite=Strict cookie that the app never sees. Dio sends it with `withCredentials`.
- **Android/iOS:** there is no cookie jar, so the token is read from `Set-Cookie`, stored in the Keychain/Keystore (flutter_secure_storage), and sent back as a `Cookie` header.
- **Startup and browser refresh:** `AuthController.build()` restores the session through `/auth/refresh` and `/auth/me` while the splash screen shows. The router sends signed-out users to `/login?from=<path>` and returns them to that path after sign-in; it only allows relative paths, so it can't become an open redirect.
- **Expired access token:** `AuthInterceptor` refreshes once on a 401, shares a single in-flight refresh between concurrent requests (the API rotates tokens), and retries. A rejected refresh signs the user out; a transient failure keeps the session.

## Sample-data mode (no API yet)

Debug builds (`flutter run`, F5) run on sample data by default (`AppConfig.demoMode`): `bootstrap.dart` swaps in `DemoAuthService` and `DemoUploadsRepository`, no network calls are made, and `LoginViewModel` skips validation, so Secure Login signs in as a sample user and the router opens Overview in the shell. The sign-in card says so. Profile and release builds use the real API and real sign-in unless built with `--dart-define=DEMO_MODE=true` (never for production); `--dart-define=DEMO_MODE=false` runs a debug build against the API. Tests state the mode explicitly (`demoModeProvider`, `pumpFullApp(demoMode:)`).

## Responsive and accessible

Every screen must work on every device. The rules and workflow are in the **`responsive-design` skill** (`.claude/skills/responsive-design/SKILL.md`). In short:

- Layouts branch only on window size classes (`WindowSize`, `WindowHeight`), never on platform or device. Inside pages, `ResponsiveBuilder` measures the space actually available, so split screens and foldables work. `responsiveValue()` is mobile-first, and `AdaptiveGrid`, `ContentWidth`, `pagePadding()` and `gutter()` cover common patterns.
- `AppShell` presents four destinations (Overview `/dashboard`, Task `/tasks`, Work Force `/workforce`, Pre Development `/pre-development`) and the navy **Hub**: a white floating dock on compact windows (two tabs each side of a navy Hub with an amber icon rising from its centre; the active tab gets a filled navy icon, a bold label and an amber underline). Pages run behind the dock (`extendBody`) and add its height to their scroll insets with `pageScrollPadding`; tab changes give a light haptic tick, a rail with a round navy Hub on medium (and short landscape) windows, and a sidebar with the brand and a full-width Hub button on expanded and up. The rail scrolls on short windows and stays clear of landscape notches. `/settings` is a shell branch without a destination; the Hub opens it.
- Task, Work Force and Pre Development show an `AppPlaceholderPage`: the backend has no API for them yet (only auth, users, uploads, health). The Hub lists the old web app's other suites as "Coming soon", not tappable; turn each into a link when its feature ships.
- Text follows the system size, clamped at 200% (WCAG 1.4.4) in `app.dart`.
- Keyboard: logical focus order (Tab from username to password, then Enter submits), focus groups for the rail and content, autofocus on the first field, and dialogs that focus the safe action. Interactive elements are at least 48 dp. Errors and loading states are live regions, page titles are semantic headers, and decorative icons are excluded from semantics.
- **Device matrix test** (`test/widgets/responsive_matrix_test.dart`): every screen and dialog on 13 sizes (320×568 phone → 2560×1440 monitor, including landscape, foldable and a short browser window), in English at 1× and 2× text and Gujarati/Hindi at 2×, rendered with the real bundled fonts; any overflow fails. New screens must be added to it.

## Adding a feature

1. `features/<name>/{models,services,repositories,viewmodels,views}`.
2. Service: real API endpoints only (see the backend's `docs/api-guidelines.md`); typed `fromJson`; `ApiFailure` on errors.
3. ViewModel: `AsyncNotifier` for loaded data (loading/error/empty/data) or `Notifier` for forms. No `BuildContext`.
4. View: `core/widgets`, `context.l10n`, tokens; handle every state.
5. Route: add to `AppRoutes`, plus a shell branch if it's a top-level destination.
6. Strings in all three ARB files; then tests (service, ViewModel, widget).

## Known limitations

- `<html lang>` on web stays `en` after a language switch, so screen readers may use the wrong voice for Gujarati or Hindi. Updating it needs a small `package:web` interop.
- The universal iOS **simulator** build fails with Flutter 3.41 + Xcode 27 (`lipo -verify_arch` no longer accepts multiple architectures). Device builds and `flutter run` on a single simulator architecture are unaffected. Upgrading Flutter should fix it.
- Translations were written for this scaffold and need native-speaker review.
- Release signing (Android keystore, iOS team), app icons and splash artwork are not set up yet.
