import 'package:dio/dio.dart';

/// Coarse failure categories the UI can react to.
enum FailureKind {
  network,
  timeout,
  unauthorized,
  forbidden,
  notFound,
  rateLimited,
  serviceBusy,
  validation,
  server,
  invalidResponse,
  unknown,
}

/// A typed, user-presentable failure. [code] is the API's stable
/// `error.code` (e.g. INVALID_CREDENTIALS) when the server sent one;
/// clients branch on it, never on the message.
class ApiFailure implements Exception {
  const ApiFailure(this.kind, {this.code, this.statusCode, this.requestId});

  final FailureKind kind;
  final String? code;
  final int? statusCode;

  /// Correlates with server logs; useful in support conversations.
  final String? requestId;

  factory ApiFailure.fromDio(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiFailure(FailureKind.timeout);
      case DioExceptionType.connectionError:
        return const ApiFailure(FailureKind.network);
      case DioExceptionType.badCertificate:
        return const ApiFailure(FailureKind.network);
      case DioExceptionType.cancel:
      case DioExceptionType.unknown:
        // On web a CORS or offline failure surfaces as `unknown` with no response.
        if (error.response == null) return const ApiFailure(FailureKind.network);
        return _fromResponse(error.response!);
      case DioExceptionType.badResponse:
        return _fromResponse(error.response!);
    }
  }

  static ApiFailure _fromResponse(Response<dynamic> response) {
    final status = response.statusCode;
    String? code;
    String? requestId;
    final body = response.data;
    if (body is Map && body['error'] is Map) {
      final error = body['error'] as Map;
      code = error['code'] is String ? error['code'] as String : null;
      requestId = error['requestId'] is String ? error['requestId'] as String : null;
    }
    final kind = switch (status) {
      400 || 409 || 413 || 415 || 422 => FailureKind.validation,
      401 => FailureKind.unauthorized,
      403 || 423 => FailureKind.forbidden,
      404 => FailureKind.notFound,
      429 => FailureKind.rateLimited,
      503 => FailureKind.serviceBusy,
      final int s when s >= 500 => FailureKind.server,
      _ => FailureKind.unknown,
    };
    return ApiFailure(kind, code: code, statusCode: status, requestId: requestId);
  }

  @override
  String toString() => 'ApiFailure($kind, code: $code, status: $statusCode, requestId: $requestId)';
}
