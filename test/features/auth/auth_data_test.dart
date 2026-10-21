import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/core/network/api_client.dart';
import 'package:prayosha_erp/core/network/api_failure.dart';
import 'package:prayosha_erp/features/auth/models/auth_tokens.dart';
import 'package:prayosha_erp/features/auth/models/user.dart';
import 'package:prayosha_erp/features/auth/repositories/auth_repository.dart';
import 'package:prayosha_erp/features/auth/services/auth_service.dart';

import '../../helpers/fakes.dart';

Map<String, Object?> _tokens(String token) => {
  'data': {'accessToken': token, 'tokenType': 'Bearer', 'expiresAt': '2026-10-21T10:15:00.000Z'},
};

void main() {
  group('User.fromJson', () {
    test('parses the API user and tolerates unknown roles', () {
      expect(User.fromJson(userJson()), testUser);
      expect(User.fromJson({...userJson(), 'role': 'brand_new_role'}).role, UserRole.unknown);
    });

    test('rejects contract changes loudly', () {
      expect(() => User.fromJson({...userJson(), 'createdAt': 42}), throwsFormatException);
    });
  });

  group('AuthService', () {
    late FakeAdapter adapter;

    AuthService build({required bool isWeb}) {
      adapter = FakeAdapter();
      return AuthService(createDio(baseUrl: 'https://api.test')..httpClientAdapter = adapter, isWeb: isWeb);
    }

    test('mobile: login reads the refresh token from Set-Cookie', () async {
      final service = build(isWeb: false);
      adapter.on('POST', '/api/v1/auth/login', [
        ok(
          {
            'data': {..._tokens('access-1')['data']! as Map<String, Object?>, 'user': userJson()},
          },
          headers: {
            'set-cookie': ['prayosha_rt=refresh-1; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict'],
          },
        ),
      ]);
      final result = await service.login(username: 'ramesh', password: 'secret-password');
      expect(result.tokens.accessToken, 'access-1');
      expect(result.tokens.refreshToken, 'refresh-1');
      expect(result.user.username, 'ramesh');
      expect(adapter.requests.single.data, {'username': 'ramesh', 'password': 'secret-password'});
    });

    test('mobile: refresh sends the token as a cookie', () async {
      final service = build(isWeb: false);
      adapter.on('POST', '/api/v1/auth/refresh', [ok(_tokens('access-2'))]);
      await service.refresh(refreshToken: 'refresh-1');
      expect(adapter.requests.single.headers['cookie'], 'prayosha_rt=refresh-1');
    });

    test('web: never touches cookies (the browser owns the httpOnly cookie)', () async {
      final service = build(isWeb: true);
      adapter.on('POST', '/api/v1/auth/refresh', [
        ok(
          _tokens('access-2'),
          headers: {
            'set-cookie': ['prayosha_rt=leak'],
          },
        ),
      ]);
      final tokens = await service.refresh(refreshToken: 'ignored');
      expect(adapter.requests.single.headers.containsKey('cookie'), isFalse);
      expect(adapter.requests.single.extra['withCredentials'], isTrue);
      expect(tokens.refreshToken, isNull);
    });

    test('translates errors and malformed responses into ApiFailure', () async {
      final service = build(isWeb: false);
      adapter.on('POST', '/api/v1/auth/login', [apiError(401, 'INVALID_CREDENTIALS')]);
      await expectLater(
        service.login(username: 'x', password: 'y'),
        throwsA(isA<ApiFailure>().having((f) => f.code, 'code', 'INVALID_CREDENTIALS')),
      );
      adapter.on('GET', '/api/v1/auth/me', [
        ok({'data': 'not-an-object'}),
      ]);
      await expectLater(
        service.me('t'),
        throwsA(isA<ApiFailure>().having((f) => f.kind, 'kind', FailureKind.invalidResponse)),
      );
    });
  });

  group('AuthRepository', () {
    late MockAuthService service;
    late InMemorySessionStorage storage;
    late AuthRepository repository;

    setUp(() {
      service = MockAuthService();
      storage = InMemorySessionStorage();
      repository = AuthRepository(service, storage);
    });

    test('signIn keeps the access token in memory and persists the refresh token', () async {
      when(() => service.login(username: 'ramesh', password: 'pw')).thenAnswer(
        (_) async => LoginResult(
          tokens: AuthTokens(accessToken: 'a1', expiresAt: DateTime(2026), refreshToken: 'r1'),
          user: testUser,
        ),
      );
      expect(await repository.signIn(username: 'ramesh', password: 'pw'), testUser);
      expect(repository.accessToken, 'a1');
      expect(storage.token, 'r1');
    });

    test('restoreSession without a stored token makes no network call (mobile)', () async {
      expect(await repository.restoreSession(), isNull);
      verifyZeroInteractions(service);
    });

    test('restoreSession refreshes, rotates the token and loads the user', () async {
      storage.token = 'r1';
      when(
        () => service.refresh(refreshToken: 'r1'),
      ).thenAnswer((_) async => AuthTokens(accessToken: 'a2', expiresAt: DateTime(2026), refreshToken: 'r2'));
      when(() => service.me('a2')).thenAnswer((_) async => testUser);
      expect(await repository.restoreSession(), testUser);
      expect(storage.token, 'r2');
    });

    test('a rejected refresh token is cleared; a network failure keeps it', () async {
      storage.token = 'r1';
      when(() => service.refresh(refreshToken: 'r1')).thenThrow(const ApiFailure(FailureKind.network));
      expect(await repository.restoreSession(), isNull);
      expect(storage.token, 'r1');

      when(
        () => service.refresh(refreshToken: 'r1'),
      ).thenThrow(const ApiFailure(FailureKind.unauthorized, code: 'SESSION_INVALID'));
      expect(await repository.restoreSession(), isNull);
      expect(storage.token, isNull);
    });

    test('concurrent refreshes share one request (rotating tokens)', () async {
      storage.token = 'r1';
      when(() => service.refresh(refreshToken: 'r1')).thenAnswer((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 10));
        return AuthTokens(accessToken: 'a2', expiresAt: DateTime(2026), refreshToken: 'r2');
      });
      final results = await Future.wait([repository.refreshAccessToken(), repository.refreshAccessToken()]);
      expect(results, ['a2', 'a2']);
      verify(() => service.refresh(refreshToken: 'r1')).called(1);
    });

    test('signOut clears local state even when the server call fails', () async {
      storage.token = 'r1';
      when(() => service.logout(refreshToken: 'r1')).thenThrow(const ApiFailure(FailureKind.network));
      await repository.signOut();
      expect(storage.token, isNull);
      expect(repository.accessToken, isNull);
    });

    test('web: refresh relies on the browser cookie even with nothing stored', () async {
      final web = AuthRepository(service, InMemorySessionStorage(managedByPlatform: true));
      when(() => service.refresh()).thenAnswer((_) async => AuthTokens(accessToken: 'a3', expiresAt: DateTime(2026)));
      expect(await web.refreshAccessToken(), 'a3');
    });
  });

  test('DioException is not leaked from the service layer', () {
    expect(ApiFailure.fromDio(DioException(requestOptions: RequestOptions())), isA<ApiFailure>());
  });
}
