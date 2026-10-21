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
}
