import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:prayosha_erp/core/l10n/app_formatters.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';
import 'package:prayosha_erp/features/auth/models/user.dart';
import 'package:prayosha_erp/features/projects/models/project.dart';
import 'package:prayosha_erp/features/projects/models/zone.dart';
import 'package:prayosha_erp/features/projects/repositories/projects_repository.dart';
import 'package:prayosha_erp/features/projects/repositories/sample_projects_repository.dart';
import 'package:prayosha_erp/features/projects/viewmodels/project_directory_view_model.dart';
import 'package:prayosha_erp/features/projects/views/whatsapp_preview.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations.dart';

void main() {
  final repository = SampleProjectsRepository(latency: Duration.zero);
  late List<Project> projects;

  setUpAll(() async {
    await initializeDateFormatting('en_IN');
    projects = (await repository.directory()).projects;
  });

  group('sample portfolio', () {
    test('has at least five realistic projects covering every status and health', () {
      expect(projects.length, greaterThanOrEqualTo(5));
      expect(projects.map((p) => p.status).toSet(), ProjectStatus.values.toSet());
      expect(projects.map((p) => p.health).toSet(), ScheduleHealth.values.toSet());
      expect(projects.map((p) => p.code).toSet(), hasLength(projects.length));
      for (final p in projects) {
        expect(p.progress, inInclusiveRange(0, 1));
        expect(p.spent, lessThanOrEqualTo(p.budget));
        for (final t in p.towers) {
          expect(t.floorsBuilt, inInclusiveRange(0, t.floors));
        }
      }
    });

    test('zones follow towers → floors → units → rooms', () async {
      final shivalay = projects.firstWhere((p) => p.code == 'PRSG-006');
      final zones = await repository.zones(shivalay);
      expect(zones.map((t) => t.name), ['Tower A', 'Tower B', 'Tower C']);
      expect(zones.first.floors, hasLength(14));
      // Ground floor: lobby and the clubhouse amenity; upper floors: flats.
      expect(zones.first.floors.first.units.map((u) => u.kind), everyElement(UnitKind.amenity));
      final flat = zones.first.floors[12].units[1];
      expect(flat.label, 'A-1202');
      expect(flat.layout, '3 BHK');
      expect(flat.rooms, isNotEmpty);

      final hub = await repository.zones(projects.firstWhere((p) => p.kind == ProjectKind.commercial));
      expect(hub.first.floors.first.units.map((u) => u.kind), everyElement(UnitKind.shop));
      expect(hub.first.floors[1].units.map((u) => u.kind), everyElement(UnitKind.office));
    });
  });

  group('applyProjectQuery', () {
    test('searches name, code, city and address, ignoring case', () {
      List<String> codes(String search) =>
          applyProjectQuery(projects, ProjectQuery(search: search)).map((p) => p.code).toList();
      expect(codes('shivalay'), ['PRSG-006']);
      expect(codes('prsg-003'), ['PRSG-003']);
      expect(codes('AHMEDABAD'), unorderedEquals(['PRSG-006', 'PRSG-001']));
      expect(codes('gotri'), ['PRSG-005']);
      expect(codes('nowhere'), isEmpty);
    });

    test('filters: active (not archived) by default, one status, or the archive', () {
      final withArchived = [projects.first.copyWith(archived: true), ...projects.skip(1)];
      List<Project> shown(ProjectFilter filter) => applyProjectQuery(withArchived, ProjectQuery(filter: filter));
      expect(shown(ProjectFilter.active), hasLength(projects.length - 1));
      expect(shown(ProjectFilter.archived).single.id, projects.first.id);
      final planning = shown(ProjectFilter.planning);
      expect(planning, isNotEmpty);
      expect(planning.map((p) => p.status), everyElement(ProjectStatus.planning));
      expect(planning.map((p) => p.archived), everyElement(isFalse));
    });

    test('sorts by recently created (default), name, progress, budget and handover', () {
      List<Project> sorted(ProjectSort sort) => applyProjectQuery(projects, ProjectQuery(sort: sort));
      expect(const ProjectQuery().sort, ProjectSort.recent);
      final created = sorted(ProjectSort.recent).map((p) => p.createdAt).toList();
      expect(created, [...created]..sort((a, b) => b.compareTo(a)));
      final names = sorted(ProjectSort.name).map((p) => p.name.toLowerCase()).toList();
      expect(names, [...names]..sort());
      final progress = sorted(ProjectSort.progress).map((p) => p.progress).toList();
      expect(progress, [...progress]..sort((a, b) => b.compareTo(a)));
      final budgets = sorted(ProjectSort.budget).map((p) => p.budget).toList();
      expect(budgets, [...budgets]..sort((a, b) => b.compareTo(a)));
      final handover = sorted(ProjectSort.handover);
      expect(handover.last.status, ProjectStatus.completed);
      final active = handover.where((p) => p.isActive).map((p) => p.handoverDate).toList();
      expect(active, [...active]..sort());
    });
  });

  test('PortfolioSummary adds up the KPI cards', () {
    final summary = PortfolioSummary.of(projects);
    expect(summary.portfolioValue, projects.fold<double>(0, (s, p) => s + p.budget));
    expect(summary.activeSites, projects.where((p) => p.status != ProjectStatus.completed).length);
    expect(summary.activeAreaSqFt, projects.where((p) => p.isActive).fold<int>(0, (s, p) => s + p.areaSqFt));
    expect(summary.ongoing, 3);
    expect(summary.planning, 1);
    expect(summary.sitesInProgress, 4);
    // Delayed tasks on active sites: 1 + 5 + 3 + 2 (planning and completed have none).
    expect(summary.delayedTasks, 11);
    // Archived projects leave every figure.
    final archived = PortfolioSummary.of([projects.first.copyWith(archived: true), ...projects.skip(1)]);
    expect(archived.portfolioValue, summary.portfolioValue - projects.first.budget);
    expect(archived.activeSites, summary.activeSites - 1);
  });

  test('ProjectPermissions follow the role', () {
    final manager = ProjectPermissions.of(UserRole.projectManager);
    expect((manager.canManage, manager.canSeeFinancials, manager.canShareProgress), (true, true, true));
    final accountant = ProjectPermissions.of(UserRole.accountant);
    expect((accountant.canManage, accountant.canSeeFinancials, accountant.canShareProgress), (false, true, false));
    final engineer = ProjectPermissions.of(UserRole.siteEngineer);
    expect((engineer.canManage, engineer.canSeeFinancials, engineer.canShareProgress), (false, false, true));
    final storeKeeper = ProjectPermissions.of(UserRole.storeKeeper);
    expect((storeKeeper.canManage, storeKeeper.canSeeFinancials, storeKeeper.canShareProgress), (false, false, false));
    expect(ProjectPermissions.of(null).canManage, isFalse);
  });

  group('ProjectDirectoryViewModel', () {
    ProviderContainer container() {
      final c = ProviderContainer(
        overrides: [projectsRepositoryProvider.overrideWithValue(SampleProjectsRepository(latency: Duration.zero))],
      );
      addTearDown(c.dispose);
      // Keep the auto-dispose providers alive for the test.
      c.listen(projectDirectoryViewModelProvider, (_, _) {});
      c.listen(projectQueryProvider, (_, _) {});
      return c;
    }

    test('archive marks the project (resetting the workspace if it was active); restore brings it back', () async {
      final c = container();
      final directory = await c.read(projectDirectoryViewModelProvider.future);
      final target = directory.projects.first;
      Project current() =>
          c.read(projectDirectoryViewModelProvider).value!.projects.firstWhere((p) => p.id == target.id);
      c.read(projectQueryProvider.notifier).setActive(target.id);
      c.read(projectDirectoryViewModelProvider.notifier).archive(target);
      expect(current().archived, isTrue);
      expect(c.read(projectQueryProvider).activeProjectId, isNull);
      c.read(projectDirectoryViewModelProvider.notifier).restore(current());
      expect(current().archived, isFalse);
    });

    test('create adds a planning project at the top', () async {
      final c = container();
      await c.read(projectDirectoryViewModelProvider.future);
      final project = c
          .read(projectDirectoryViewModelProvider.notifier)
          .create(name: '  Ambaji Villas ', city: 'Palanpur', kind: ProjectKind.residential);
      expect(project.name, 'Ambaji Villas');
      expect(project.status, ProjectStatus.planning);
      // Next number in the PRSG series (the sample data goes up to PRSG-007).
      expect(project.code, 'PRSG-008');
      expect(c.read(projectDirectoryViewModelProvider).value!.projects.first, project);
    });

    test('the active workspace defaults to the first active project', () async {
      final c = container();
      c.listen(activeProjectProvider, (_, _) {});
      await c.read(projectDirectoryViewModelProvider.future);
      expect(c.read(activeProjectProvider)?.isActive, isTrue);
      final other = c.read(projectDirectoryViewModelProvider).value!.projects.firstWhere((p) => p.code == 'PRSG-005');
      c.read(projectQueryProvider.notifier).setActive(other.id);
      expect(c.read(activeProjectProvider), other);
    });
  });

  test('WhatsApp message carries name, code, progress, health, handover and highlights', () {
    final l10n = lookupAppLocalizations(const Locale('en'));
    final project = projects.firstWhere((p) => p.code == 'PRSG-006');
    final message = progressMessage(l10n, AppFormatters(AppLanguage.english), project);
    expect(message, startsWith('*Shivalay Heights* (PRSG-006)'));
    expect(message, contains('62%'));
    expect(message, contains(l10n.healthOnTrack));
    for (final highlight in project.highlights) {
      expect(message, contains('• $highlight'));
    }
  });
}
