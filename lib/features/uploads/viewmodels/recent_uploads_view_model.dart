import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/upload.dart';
import '../repositories/uploads_repository.dart';

/// Recent uploads for the dashboard. AsyncValue carries loading/error;
/// an empty list is the "empty" state.
class RecentUploadsViewModel extends AsyncNotifier<List<Upload>> {
  @override
  Future<List<Upload>> build() => ref.read(uploadsRepositoryProvider).recentUploads();

  Future<void> refresh() async {
    state = const AsyncLoading<List<Upload>>();
    state = await AsyncValue.guard(() => ref.read(uploadsRepositoryProvider).recentUploads());
  }
}

final recentUploadsViewModelProvider = AsyncNotifierProvider.autoDispose<RecentUploadsViewModel, List<Upload>>(
  RecentUploadsViewModel.new,
);
