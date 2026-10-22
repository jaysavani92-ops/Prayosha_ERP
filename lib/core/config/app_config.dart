import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Build-time configuration, passed with `--dart-define`. Nothing secret
/// belongs here: every value is compiled into the client and readable by users.
///
///   flutter run --dart-define=API_BASE_URL=https://api.example.com
///
/// The default targets the local Prayosha API (`npm run dev` on the backend
/// branch). It is `localhost`, not `127.0.0.1`, on purpose: the API's refresh
/// cookie is SameSite=Strict and browsers treat those as different sites, so
/// the web app (served from `localhost` by `flutter run`) must use the same
/// host. Android emulators reach the host machine at 10.0.2.2.
abstract final class AppConfig {
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000');

  static const connectTimeout = Duration(seconds: 10);
  static const receiveTimeout = Duration(seconds: 20);

  /// Sample-data mode, for working on the app before the API exists. No
  /// network calls are made: Secure Login opens the app straight away as a
  /// sample user (no validation, any input), and screens show sample data.
  ///
  /// On by default in debug builds (`flutter run`, F5), so the app works
  /// without a server; off in profile and release builds, which always use
  /// the real API and real sign-in. Override either way:
  ///
  ///   flutter run --dart-define=DEMO_MODE=false   # debug against the API
  static const demoMode = bool.fromEnvironment('DEMO_MODE', defaultValue: kDebugMode);
}

/// Whether the app runs on sample data ([AppConfig.demoMode]). A provider so
/// tests can switch it on.
final demoModeProvider = Provider<bool>((ref) => AppConfig.demoMode);
