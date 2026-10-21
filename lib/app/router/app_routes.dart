/// Route paths (also the web URLs). Use these constants; never inline paths.
abstract final class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';
  static const dashboard = '/dashboard';
  static const settings = '/settings';

  static const home = dashboard;

  /// Query parameter that carries the page a signed-out user tried to open.
  static const fromParam = 'from';

  static const _public = {splash, login};

  static bool isPublic(String path) => _public.contains(path);
}
