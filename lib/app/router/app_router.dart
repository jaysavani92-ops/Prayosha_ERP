import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/models/user.dart';
import '../../features/auth/viewmodels/auth_controller.dart';
import '../../features/auth/views/login_view.dart';
import '../../features/dashboard/dashboard_view.dart';
import '../../features/settings/settings_view.dart';
import '../../features/splash/splash_view.dart';
import '../shell/app_shell.dart';
import 'app_routes.dart';

/// Pure redirect rules, kept separate so they are unit-testable.
///
/// - restoring the session: stay on (or go to) the splash, remembering the target;
/// - signed out: any private page redirects to `/login?from=<page>`;
/// - signed in: /login and /splash continue to `from` (or the dashboard).
String? authRedirect({required AsyncValue<User?> auth, required Uri location}) {
  final path = location.path;
  final from = location.queryParameters[AppRoutes.fromParam];

  String withFrom(String target) {
    final next = AppRoutes.isPublic(path) ? from : location.toString();
    return next == null || next.isEmpty
        ? target
        : Uri(path: target, queryParameters: {AppRoutes.fromParam: next}).toString();
  }

  if (auth.isLoading && !auth.hasValue) {
    return path == AppRoutes.splash ? null : withFrom(AppRoutes.splash);
  }
  final signedIn = auth.value != null;
  if (!signedIn) {
    return path == AppRoutes.login ? null : withFrom(AppRoutes.login);
  }
  if (AppRoutes.isPublic(path)) {
    // Only follow same-app relative paths (no open redirects).
    return from != null && from.startsWith('/') && !from.startsWith('//') ? from : AppRoutes.home;
  }
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authControllerProvider, (_, _) => refresh.value++);

  final router = GoRouter(
    initialLocation: AppRoutes.home,
    refreshListenable: refresh,
    debugLogDiagnostics: kDebugMode,
    redirect: (context, state) => authRedirect(auth: ref.read(authControllerProvider), location: state.uri),
    routes: [
      GoRoute(path: '/', redirect: (_, _) => AppRoutes.home),
      GoRoute(path: AppRoutes.splash, builder: (_, _) => const SplashView()),
      GoRoute(path: AppRoutes.login, builder: (_, _) => const LoginView()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.dashboard, builder: (_, _) => const DashboardView())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.settings, builder: (_, _) => const SettingsView())],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});
