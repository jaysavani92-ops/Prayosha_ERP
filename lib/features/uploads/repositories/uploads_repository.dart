import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/upload.dart';
import '../services/uploads_service.dart';

class UploadsRepository {
  UploadsRepository(this._service);

  final UploadsService _service;

  static const recentLimit = 10;

  Future<List<Upload>> recentUploads() => _service.listMine(limit: recentLimit);
}

final uploadsRepositoryProvider = Provider<UploadsRepository>(
  (ref) => UploadsRepository(ref.watch(uploadsServiceProvider)),
);
