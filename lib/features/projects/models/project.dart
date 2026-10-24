import 'package:flutter/foundation.dart';

import '../../auth/models/user.dart';

/// Where a project is in its life.
enum ProjectStatus { planning, inProgress, onHold, completed }

/// How a running project tracks against its handover date.
enum ScheduleHealth { onTrack, atRisk, delayed }

/// What kind of building a project delivers.
enum ProjectKind { residential, commercial, mixedUse }

/// One tower or block: the unit of the building elevation and the zone tree.
@immutable
class TowerSpec {
  const TowerSpec({required this.name, required this.floors, required this.floorsBuilt});

  final String name;
  final int floors;

  /// Floors with the structure (slab) cast; drives the elevation fill.
  final int floorsBuilt;
}

/// Counts for the Active Workspace shortcuts of one project.
@immutable
class WorkspaceStats {
  const WorkspaceStats({
    required this.openTasks,
    required this.lowStockItems,
    required this.crewOnSite,
    required this.pendingApprovals,
    this.delayedTasks = 0,
  });

  final int openTasks;
  final int lowStockItems;
  final int crewOnSite;
  final int pendingApprovals;

  /// Open tasks past their due date (the "Delayed" badge and the alerts).
  final int delayedTasks;
}

/// A construction project (site). Sample data until the projects API exists.
@immutable
class Project {
  const Project({
    required this.id,
    required this.code,
    required this.name,
    required this.kind,
    required this.address,
    required this.city,
    required this.status,
    required this.health,
    required this.budget,
    required this.spent,
    required this.areaSqFt,
    required this.progress,
    required this.startDate,
    required this.handoverDate,
    required this.towers,
    required this.workspace,
    required this.createdAt,
    this.highlights = const [],
    this.archived = false,
  });

  final String id;

  /// Short site code used on drawings and in WhatsApp groups, e.g. PRSG-004.
  final String code;
  final String name;
  final ProjectKind kind;
  final String address;
  final String city;
  final ProjectStatus status;

  /// Meaningful only while [status] is in progress.
  final ScheduleHealth health;

  /// Sanctioned budget and spend to date, in rupees.
  final double budget;
  final double spent;

  /// Saleable built-up area.
  final int areaSqFt;

  /// Overall completion, 0–1.
  final double progress;
  final DateTime startDate;
  final DateTime handoverDate;
  final List<TowerSpec> towers;
  final WorkspaceStats workspace;

  /// When the project was added to the directory ("Recently created").
  final DateTime createdAt;

  /// This week's site updates (data, as the site team wrote them).
  final List<String> highlights;

  /// Archived projects leave the default list but can be shown and restored.
  final bool archived;

  /// Not completed and not archived: counts as an active site.
  bool get isActive => !archived && status != ProjectStatus.completed;

  /// Running late or at risk of it.
  bool get needsAttention => status == ProjectStatus.inProgress && health != ScheduleHealth.onTrack;

  int get totalFloors => towers.fold(0, (sum, t) => sum + t.floors);

  Project copyWith({bool? archived}) => Project(
    id: id,
    code: code,
    name: name,
    kind: kind,
    address: address,
    city: city,
    status: status,
    health: health,
    budget: budget,
    spent: spent,
    areaSqFt: areaSqFt,
    progress: progress,
    startDate: startDate,
    handoverDate: handoverDate,
    towers: towers,
    workspace: workspace,
    createdAt: createdAt,
    highlights: highlights,
    archived: archived ?? this.archived,
  );
}

/// The four headline numbers above the directory, over the projects that
/// are not archived.
@immutable
class PortfolioSummary {
  const PortfolioSummary({
    required this.portfolioValue,
    required this.activeAreaSqFt,
    required this.ongoing,
    required this.planning,
    required this.delayedTasks,
    required this.activeSites,
  });

  factory PortfolioSummary.of(List<Project> projects) {
    final current = projects.where((p) => !p.archived);
    final active = current.where((p) => p.isActive);
    return PortfolioSummary(
      portfolioValue: current.fold(0, (sum, p) => sum + p.budget),
      activeAreaSqFt: active.fold(0, (sum, p) => sum + p.areaSqFt),
      ongoing: current.where((p) => p.status == ProjectStatus.inProgress).length,
      planning: current.where((p) => p.status == ProjectStatus.planning).length,
      delayedTasks: active.fold(0, (sum, p) => sum + p.workspace.delayedTasks),
      activeSites: active.length,
    );
  }

  /// Sanctioned budgets, in rupees.
  final double portfolioValue;

  /// Built-up area of sites under construction or in planning.
  final int activeAreaSqFt;
  final int ongoing;
  final int planning;

  /// Critical tasks past schedule across active sites ("alerts").
  final int delayedTasks;
  final int activeSites;

  /// Sites under construction or in planning.
  int get sitesInProgress => ongoing + planning;
}

/// Everything the directory page loads at once.
@immutable
class ProjectDirectory {
  const ProjectDirectory({required this.projects});

  final List<Project> projects;

  ProjectDirectory copyWith({List<Project>? projects}) => ProjectDirectory(projects: projects ?? this.projects);
}

/// What a role may do in the directory. Mirrors the backend's role model;
/// the server will enforce the same rules once the projects API exists.
@immutable
class ProjectPermissions {
  const ProjectPermissions({required this.canManage, required this.canSeeFinancials, required this.canShareProgress});

  factory ProjectPermissions.of(UserRole? role) {
    const managers = {UserRole.owner, UserRole.generalManager, UserRole.constructionHead, UserRole.projectManager};
    final manager = managers.contains(role);
    return ProjectPermissions(
      canManage: manager,
      canSeeFinancials: manager || role == UserRole.accountant,
      canShareProgress: manager || role == UserRole.siteEngineer,
    );
  }

  /// Create and archive projects.
  final bool canManage;

  /// Budgets and portfolio value.
  final bool canSeeFinancials;

  /// Send progress updates to the client WhatsApp group.
  final bool canShareProgress;
}
