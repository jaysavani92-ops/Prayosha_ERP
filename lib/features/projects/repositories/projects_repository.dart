import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/project.dart';
import '../models/zone.dart';
import 'sample_projects_repository.dart';

/// Source of projects and their zone trees.
abstract interface class ProjectsRepository {
  Future<ProjectDirectory> directory();

  /// Towers → floors → units → rooms for one project.
  Future<List<Tower>> zones(Project project);
}

/// The backend has no projects, tasks or zones API yet, so every build uses
/// [SampleProjectsRepository]. Override this provider with an API-backed
/// repository once those endpoints exist.
final projectsRepositoryProvider = Provider<ProjectsRepository>((ref) => SampleProjectsRepository());
