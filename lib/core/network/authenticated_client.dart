import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';

/// What the network layer needs from the session, without depending on the
/// auth feature (the app layer provides the implementation).
abstract interface class SessionBridge {
  String? get accessToken;
  Future<String?> refreshAccessToken();
  void onSessionExpired();
}

final sessionBridgeProvider = Provider<SessionBridge>(
  (ref) => throw UnimplementedError('sessionBridgeProvider is provided by the app layer'),
);

/// Dio for authenticated API calls: bearer token + one transparent refresh.
final authenticatedDioProvider = Provider<Dio>((ref) {
  final session = ref.watch(sessionBridgeProvider);
  final dio = createDio();
  dio.interceptors.add(
    AuthInterceptor(
      dio: dio,
      accessToken: () => session.accessToken,
      refreshAccessToken: session.refreshAccessToken,
      onSessionExpired: session.onSessionExpired,
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});
