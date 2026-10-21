import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/core/storage/session_storage.dart';
import 'package:prayosha_erp/features/auth/models/user.dart';
import 'package:prayosha_erp/features/auth/services/auth_service.dart';
import 'package:prayosha_erp/features/uploads/models/upload.dart';
import 'package:prayosha_erp/features/uploads/repositories/uploads_repository.dart';

class MockAuthService extends Mock implements AuthService {}

class MockUploadsRepository extends Mock implements UploadsRepository {}

/// Mobile-style storage kept in memory.
class InMemorySessionStorage implements SessionStorage {
  InMemorySessionStorage({this.token, this.managedByPlatform = false});

  String? token;

  @override
  final bool managedByPlatform;

  @override
  Future<String?> readRefreshToken() async => token;

  @override
  Future<void> writeRefreshToken(String value) async => token = value;

  @override
  Future<void> clear() async => token = null;
}

final testUser = User(
  id: '65f000000000000000000001',
  username: 'ramesh',
  displayName: 'Ramesh Patel',
  role: UserRole.siteEngineer,
  isActive: true,
  lastLoginAt: DateTime.utc(2026, 10, 20, 9, 30),
  createdAt: DateTime.utc(2026, 1, 1),
);

Upload testUpload(int i, {String contentType = 'image/jpeg'}) => Upload(
  id: '65f00000000000000000010$i',
  purpose: UploadPurpose.snagPhoto,
  contentType: contentType,
  sizeBytes: 1536 * 1024,
  filename: 'crack-$i.jpg',
  createdAt: DateTime.utc(2026, 10, 21, 8),
);

/// Programmable Dio transport: each handler returns (status, json body, headers).
typedef FakeRoute = ({int status, Object? body, Map<String, List<String>> headers});

class FakeAdapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  final _queue = <String, List<FakeRoute>>{};

  /// Queue responses for `METHOD /path` (consumed in order; last one repeats).
  void on(String method, String path, List<FakeRoute> responses) => _queue['$method $path'] = responses;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final key = '${options.method} ${options.path}';
    final responses = _queue[key];
    if (responses == null || responses.isEmpty) {
      throw StateError('No fake response for $key');
    }
    final route = responses.length > 1 ? responses.removeAt(0) : responses.first;
    return ResponseBody.fromString(
      route.body == null ? '' : jsonEncode(route.body),
      route.status,
      headers: {
        'content-type': ['application/json'],
        ...route.headers,
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

FakeRoute ok(Object? body, {int status = 200, Map<String, List<String>> headers = const {}}) =>
    (status: status, body: body, headers: headers);

FakeRoute apiError(int status, String code) => (
  status: status,
  body: {
    'error': {'code': code, 'message': 'x', 'requestId': 'req-1'},
  },
  headers: const <String, List<String>>{},
);

Map<String, Object?> userJson() => {
  'id': testUser.id,
  'username': testUser.username,
  'displayName': testUser.displayName,
  'role': 'site_engineer',
  'status': 'active',
  'lastLoginAt': '2026-10-20T09:30:00.000Z',
  'createdAt': '2026-01-01T00:00:00.000Z',
  'updatedAt': '2026-10-20T09:30:00.000Z',
};
