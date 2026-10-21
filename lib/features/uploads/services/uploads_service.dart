import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_failure.dart';
import '../../../core/network/authenticated_client.dart';
import '../../../core/network/json.dart';
import '../models/upload.dart';

/// `GET /api/v1/uploads` — the caller's uploads, newest first (cursor paginated).
class UploadsService {
  UploadsService(this._dio);

  final Dio _dio;

  Future<List<Upload>> listMine({int limit = 10, String status = 'available'}) async {
    try {
      final response = await _dio.get<dynamic>('/api/v1/uploads', queryParameters: {'limit': limit, 'status': status});
      return asJsonMap(response.data).objectList('data').map(Upload.fromJson).toList();
    } on DioException catch (error) {
      throw ApiFailure.fromDio(error);
    } on FormatException {
      throw const ApiFailure(FailureKind.invalidResponse);
    }
  }
}

final uploadsServiceProvider = Provider<UploadsService>((ref) => UploadsService(ref.watch(authenticatedDioProvider)));
