/// Route paths (also the web URLs). Use these constants; never inline paths.
abstract final class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';

  /// Overview. The path stays `/dashboard` so existing links keep working.
  static const dashboard = '/dashboard';
  static const tasks = '/tasks';
  static const workforce = '/workforce';
  static const preDevelopment = '/pre-development';

  /// Not a navigation destination: opened from the Hub.
  static const settings = '/settings';

  static const home = dashboard;

  /// Query parameter that carries the page a signed-out user tried to open.
  static const fromParam = 'from';

  static const _public = {splash, login};

  static bool isPublic(String path) => _public.contains(path);
}
