import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prayosha_erp/core/l10n/error_messages.dart';
import 'package:prayosha_erp/core/network/api_client.dart';
import 'package:prayosha_erp/core/network/api_failure.dart';
import 'package:prayosha_erp/core/validation/validators.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations_en.dart';

import '../helpers/fakes.dart';

DioException _dioError(DioExceptionType type, {int? status, Object? body}) {
  final request = RequestOptions(path: '/x');
  return DioException(
    requestOptions: request,
    type: type,
    response: status == null ? null : Response<dynamic>(requestOptions: request, statusCode: status, data: body),
  );
}

void main() {
  group('ApiFailure.fromDio', () {
    test('maps transport errors', () {
      expect(ApiFailure.fromDio(_dioError(DioExceptionType.receiveTimeout)).kind, FailureKind.timeout);
      expect(ApiFailure.fromDio(_dioError(DioExceptionType.connectionError)).kind, FailureKind.network);
      // Browsers report CORS/offline failures as `unknown` without a response.
      expect(ApiFailure.fromDio(_dioError(DioExceptionType.unknown)).kind, FailureKind.network);
    });

    test('keeps the API error code and request id', () {
      final failure = ApiFailure.fromDio(
        _dioError(
          DioExceptionType.badResponse,
          status: 401,
          body: {
            'error': {'code': 'INVALID_CREDENTIALS', 'message': 'x', 'requestId': 'req-9'},
          },
        ),
      );
      expect(failure.kind, FailureKind.unauthorized);
      expect(failure.code, 'INVALID_CREDENTIALS');
      expect(failure.requestId, 'req-9');
    });

    test('maps status codes without a body', () {
      expect(ApiFailure.fromDio(_dioError(DioExceptionType.badResponse, status: 429)).kind, FailureKind.rateLimited);
      expect(ApiFailure.fromDio(_dioError(DioExceptionType.badResponse, status: 503)).kind, FailureKind.serviceBusy);
      expect(ApiFailure.fromDio(_dioError(DioExceptionType.badResponse, status: 500)).kind, FailureKind.server);
    });
  });

  group('localizedFailure', () {
    final l10n = AppLocalizationsEn();

    test('prefers the specific API code', () {
      expect(
        localizedFailure(l10n, const ApiFailure(FailureKind.unauthorized, code: 'INVALID_CREDENTIALS')),
        l10n.errorInvalidCredentials,
      );
      expect(
        localizedFailure(l10n, const ApiFailure(FailureKind.forbidden, code: 'ACCOUNT_LOCKED')),
        l10n.errorAccountLocked,
      );
    });

    test('falls back to the category, and to a generic message for anything else', () {
      expect(localizedFailure(l10n, const ApiFailure(FailureKind.network)), l10n.errorNetwork);
      expect(localizedFailure(l10n, StateError('boom')), l10n.errorUnknown);
    });
  });

  group('Validators', () {
    test('username mirrors the API rule after normalising', () {
      expect(Validators.username(''), ValidationError.required);
      expect(Validators.username('  Ramesh.P '), isNull);
      expect(Validators.username('ab'), ValidationError.usernameFormat);
      expect(Validators.username('ramesh patel'), ValidationError.usernameFormat);
      expect(Validators.normalizeUsername('  Ramesh.P '), 'ramesh.p');
    });
  });

  group('AuthInterceptor', () {
    late Dio dio;
    late FakeAdapter adapter;
    late int refreshCalls;
    late bool expired;

    Dio build({required Future<String?> Function() refresh, String? token = 'old-token'}) {
      adapter = FakeAdapter();
      refreshCalls = 0;
      expired = false;
      dio = createDio(baseUrl: 'https://api.test')..httpClientAdapter = adapter;
      var current = token;
      dio.interceptors.add(
        AuthInterceptor(
          dio: dio,
          accessToken: () => current,
          refreshAccessToken: () async {
            refreshCalls++;
            final next = await refresh();
            if (next != null) current = next;
            return next;
          },
          onSessionExpired: () => expired = true,
        ),
      );
      return dio;
    }

    test('attaches the bearer token', () async {
      build(refresh: () async => null);
      adapter.on('GET', '/api/v1/uploads', [
        ok({'data': <Object?>[]}),
      ]);
      await dio.get<dynamic>('/api/v1/uploads');
      expect(adapter.requests.single.headers['authorization'], 'Bearer old-token');
    });

    test('refreshes once on 401 and retries with the new token', () async {
      build(refresh: () async => 'new-token');
      adapter.on('GET', '/api/v1/uploads', [
        apiError(401, 'UNAUTHENTICATED'),
        ok({'data': <Object?>[]}),
      ]);
      final response = await dio.get<dynamic>('/api/v1/uploads');
      expect(response.statusCode, 200);
      expect(refreshCalls, 1);
      expect(adapter.requests.last.headers['authorization'], 'Bearer new-token');
      expect(expired, isFalse);
    });

    test('ends the session when the refresh token is rejected', () async {
      build(refresh: () async => null);
      adapter.on('GET', '/api/v1/uploads', [apiError(401, 'UNAUTHENTICATED')]);
      await expectLater(dio.get<dynamic>('/api/v1/uploads'), throwsA(isA<DioException>()));
      expect(expired, isTrue);
    });

    test('keeps the session when the refresh fails transiently', () async {
      build(refresh: () async => throw const ApiFailure(FailureKind.network));
      adapter.on('GET', '/api/v1/uploads', [apiError(401, 'UNAUTHENTICATED')]);
      await expectLater(dio.get<dynamic>('/api/v1/uploads'), throwsA(isA<DioException>()));
      expect(expired, isFalse);
    });

    test('does not loop when the retried request is also rejected', () async {
      build(refresh: () async => 'new-token');
      adapter.on('GET', '/api/v1/uploads', [apiError(401, 'UNAUTHENTICATED')]);
      await expectLater(dio.get<dynamic>('/api/v1/uploads'), throwsA(isA<DioException>()));
      expect(refreshCalls, 1);
      expect(adapter.requests, hasLength(2));
    });
  });
}
