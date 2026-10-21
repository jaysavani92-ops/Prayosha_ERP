import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/network/authenticated_client.dart';
import '../core/storage/preferences.dart';
import '../features/auth/repositories/auth_session_bridge.dart';
import 'app.dart';

/// Overrides that wire the app layer together. Tests reuse these and add
/// their own fakes on top.
List<Override> appOverrides(SharedPreferences preferences) => [
  sharedPreferencesProvider.overrideWithValue(preferences),
  sessionBridgeProvider.overrideWith(AuthSessionBridge.new),
];

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  final preferences = await SharedPreferences.getInstance();
  runApp(
    ProviderScope(
      overrides: appOverrides(preferences),
      // Failures are shown with an explicit retry action instead of silent
      // background retries (Riverpod 3 retries failed providers by default).
      retry: (_, _) => null,
      child: const PrayoshaApp(),
    ),
  );
}
