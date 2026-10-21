# Prayosha ERP — Flutter app (Android, iOS, Web)

One Flutter codebase for the Prayosha construction management app. It talks to the Prayosha API on the `backend` branch. Architecture and conventions are in [docs/architecture.md](docs/architecture.md).

| | |
| --- | --- |
| Flutter / Dart | 3.41.0 / 3.11 (stable) |
| State & DI | Riverpod 3 (`Notifier`, `AsyncNotifier`, no code generation) |
| Navigation | go_router 17 (path URLs on web, auth redirects, deep links) |
| HTTP | Dio 5 with a token-refresh interceptor |
| Languages | English, ગુજરાતી (Gujarati), हिन्दी (Hindi) via gen_l10n |
| Fonts | Bundled Noto Sans, Noto Sans Gujarati, Noto Sans Devanagari (SIL OFL 1.1) |

## Run it

The API must be running (backend branch: `npm run dev`, port 3000), and its `CORS_ORIGINS` must include the web origin you use.

```bash
flutter pub get                       # also generates lib/l10n/gen/
flutter run -d chrome --web-port 5173 # web; add http://localhost:5173 to the API's CORS_ORIGINS
flutter run -d ios                    # iOS simulator or device
flutter run -d android --dart-define=API_BASE_URL=http://10.0.2.2:3000   # Android emulator
```

`API_BASE_URL` (default `http://localhost:3000`) is the only build-time setting. Pass a production URL with `--dart-define=API_BASE_URL=https://api.example.com`. Nothing secret goes into the app: every `--dart-define` value can be read by anyone who has the binary.

Use `localhost`, not `127.0.0.1`, for local web development. The API's refresh cookie is `SameSite=Strict`, and browsers treat the two hosts as different sites, so the session would not survive a page refresh.

## Checks

```bash
dart format lib test        # page width 120 (analysis_options.yaml)
flutter gen-l10n            # build/untranslated_messages.json must be {}
flutter analyze
flutter test                # unit, ViewModel, widget, localization and font-coverage tests
flutter build web --release
flutter build apk --debug
flutter build ios --debug --no-codesign
```

CI runs all of these (`.github/workflows/flutter-ci.yml`).

## Web hosting

The app uses path URLs (`/dashboard`, not `/#/dashboard`). The web server must serve `index.html` for any path that isn't a file, or a browser refresh and shared links will return 404:

```
# Caddy
try_files {path} /index.html
# nginx
location / { try_files $uri $uri/ /index.html; }
```

Host the app on the same site as the API (for example `app.example.com` and `api.example.com`) so the browser sends the refresh cookie.

## Adding translations

1. Add the key to `lib/l10n/app_en.arb` (with `@key` metadata for any placeholders).
2. Add the same key to `app_gu.arb` and `app_hi.arb`.
3. Run `flutter gen-l10n`, then use `context.l10n.key` in views.

`test/core/localization_test.dart` fails on missing keys, placeholder mismatches, or text left untranslated. `test/core/font_coverage_test.dart` fails if any character lacks a glyph in the bundled fonts. **Have a native speaker review the Gujarati and Hindi strings before release.**
