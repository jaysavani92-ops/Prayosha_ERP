import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/viewmodels/auth_controller.dart';
import '../models/project.dart';
import '../models/zone.dart';
import '../repositories/projects_repository.dart';

/// The loaded portfolio. Archive, restore and create change only this
/// session's copy (there is no projects API to save to yet).
class ProjectDirectoryViewModel extends AsyncNotifier<ProjectDirectory> {
  int _created = 0;

  @override
  Future<ProjectDirectory> build() => ref.read(projectsRepositoryProvider).directory();

  Future<void> refresh() async {
    state = const AsyncLoading<ProjectDirectory>();
    state = await AsyncValue.guard(() => ref.read(projectsRepositoryProvider).directory());
  }

  /// Moves [project] to the archive (out of the default list).
  void archive(Project project) {
    _setArchived(project, true);
    final query = ref.read(projectQueryProvider);
    if (query.activeProjectId == project.id) ref.read(projectQueryProvider.notifier).setActive(null);
  }

  /// Brings an archived [project] back into the directory.
  void restore(Project project) => _setArchived(project, false);

  void _setArchived(Project project, bool archived) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        projects: [for (final p in current.projects) p.id == project.id ? p.copyWith(archived: archived) : p],
      ),
    );
  }

  /// Adds a project in planning to this session's list and returns it.
  Project create({required String name, required String city, required ProjectKind kind}) {
    _created++;
    final now = DateTime.now();
    final existing = state.value?.projects ?? const <Project>[];
    // Next number in the PRSG-### series.
    final next =
        existing.map((p) => int.tryParse(p.code.replaceFirst('PRSG-', '')) ?? 0).fold(0, (a, b) => a > b ? a : b) + 1;
    final project = Project(
      id: 'new-$_created',
      code: 'PRSG-${next.toString().padLeft(3, '0')}',
      name: name.trim(),
      kind: kind,
      address: city.trim(),
      city: city.trim(),
      status: ProjectStatus.planning,
      health: ScheduleHealth.onTrack,
      budget: 0,
      spent: 0,
      areaSqFt: 0,
      progress: 0,
      startDate: now,
      handoverDate: DateTime(now.year + 3, now.month, now.day),
      towers: const [TowerSpec(name: 'Tower A', floors: 1, floorsBuilt: 0)],
      workspace: const WorkspaceStats(openTasks: 0, lowStockItems: 0, crewOnSite: 0, pendingApprovals: 0),
      createdAt: now,
    );
    final current = state.value;
    if (current != null) state = AsyncData(current.copyWith(projects: [project, ...current.projects]));
    return project;
  }
}

final projectDirectoryViewModelProvider =
    AsyncNotifierProvider.autoDispose<ProjectDirectoryViewModel, ProjectDirectory>(ProjectDirectoryViewModel.new);

enum ProjectSort { recent, name, progress, handover, budget }

/// Which projects the list shows: every project not archived (default), one
/// status (not archived), or the archive.
enum ProjectFilter { active, inProgress, planning, onHold, completed, archived }

/// Search, filter, order and the active workspace project. The list is
/// shown most recently created first; [sort] keeps the other orders
/// available to code (and tests) without a control on the page.
@immutable
class ProjectQuery {
  const ProjectQuery({
    this.search = '',
    this.filter = ProjectFilter.active,
    this.sort = ProjectSort.recent,
    this.activeProjectId,
  });

  final String search;

  final ProjectFilter filter;
  final ProjectSort sort;

  /// Null means the first active project.
  final String? activeProjectId;

  bool get isFiltered => search.trim().isNotEmpty || filter != ProjectFilter.active;

  ProjectQuery copyWith({
    String? search,
    ProjectFilter? filter,
    ProjectSort? sort,
    String? Function()? activeProjectId,
  }) => ProjectQuery(
    search: search ?? this.search,
    filter: filter ?? this.filter,
    sort: sort ?? this.sort,
    activeProjectId: activeProjectId == null ? this.activeProjectId : activeProjectId(),
  );
}

class ProjectQueryController extends Notifier<ProjectQuery> {
  @override
  ProjectQuery build() => const ProjectQuery();

  void setSearch(String value) => state = state.copyWith(search: value);
  void setFilter(ProjectFilter value) => state = state.copyWith(filter: value);
  void setActive(String? projectId) => state = state.copyWith(activeProjectId: () => projectId);
  void clearFilters() => state = state.copyWith(search: '', filter: ProjectFilter.active);
}

final projectQueryProvider = NotifierProvider.autoDispose<ProjectQueryController, ProjectQuery>(
  ProjectQueryController.new,
);

/// What the signed-in role may do here.
final projectPermissionsProvider = Provider.autoDispose<ProjectPermissions>(
  (ref) => ProjectPermissions.of(ref.watch(authControllerProvider).value?.role),
);

/// Projects after filter, search and sort.
List<Project> applyProjectQuery(List<Project> projects, ProjectQuery query) {
  final needle = query.search.trim().toLowerCase();
  bool shown(Project p) => switch (query.filter) {
    ProjectFilter.active => !p.archived,
    ProjectFilter.inProgress => !p.archived && p.status == ProjectStatus.inProgress,
    ProjectFilter.planning => !p.archived && p.status == ProjectStatus.planning,
    ProjectFilter.onHold => !p.archived && p.status == ProjectStatus.onHold,
    ProjectFilter.completed => !p.archived && p.status == ProjectStatus.completed,
    ProjectFilter.archived => p.archived,
  };
  final matches = projects.where((p) {
    if (!shown(p)) return false;
    if (needle.isEmpty) return true;
    return [p.name, p.code, p.city, p.address].any((field) => field.toLowerCase().contains(needle));
  }).toList();
  int compare(Project a, Project b) => switch (query.sort) {
    ProjectSort.recent => b.createdAt.compareTo(a.createdAt),
    ProjectSort.name => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
    ProjectSort.progress => b.progress.compareTo(a.progress),
    // Upcoming handovers first; finished projects after every active one.
    ProjectSort.handover => a.isActive != b.isActive ? (a.isActive ? -1 : 1) : a.handoverDate.compareTo(b.handoverDate),
    ProjectSort.budget => b.budget.compareTo(a.budget),
  };
  return matches..sort(compare);
}

final visibleProjectsProvider = Provider.autoDispose<AsyncValue<List<Project>>>((ref) {
  final query = ref.watch(projectQueryProvider);
  return ref.watch(projectDirectoryViewModelProvider).whenData((d) => applyProjectQuery(d.projects, query));
});

/// The project the Active Workspace shortcuts open: the chosen one, else the
/// first active project.
final activeProjectProvider = Provider.autoDispose<Project?>((ref) {
  final projects = ref.watch(projectDirectoryViewModelProvider).value?.projects ?? const [];
  final id = ref.watch(projectQueryProvider.select((q) => q.activeProjectId));
  final active = projects.where((p) => p.isActive);
  return active.where((p) => p.id == id).firstOrNull ?? active.firstOrNull;
});

/// Zone tree for the inspector, loaded when it opens.
final projectZonesProvider = FutureProvider.autoDispose.family<List<Tower>, Project>(
  (ref, project) => ref.read(projectsRepositoryProvider).zones(project),
);
