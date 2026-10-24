import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/l10n/error_messages.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_states.dart';
import '../../../core/widgets/app_top_bar.dart';
import '../../../core/widgets/responsive.dart';
import '../viewmodels/project_directory_view_model.dart';
import 'create_project_panel.dart';
import 'directory_header.dart';
import 'directory_toolbar.dart';
import 'project_card.dart';

/// The home screen, as in the web app: header (title, active sites,
/// subtitle, Create Project), four KPI cards, the active
/// workspace with its suites, search and filter, then the projects as
/// cards. Pull down to refresh.
class ProjectDirectoryView extends ConsumerWidget {
  const ProjectDirectoryView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final directory = ref.watch(projectDirectoryViewModelProvider);
    final all = directory.value?.projects;
    Future<void> refresh() => ref.read(projectDirectoryViewModelProvider.notifier).refresh();

    return Scaffold(
      appBar: AppTopBar(title: l10n.navOverview),
      body: ResponsiveBuilder(
        builder: (context, size) {
          final section = SizedBox(height: directorySectionGap(size));
          return RefreshIndicator(
            onRefresh: refresh,
            child: SingleChildScrollView(
              key: const ValueKey('project-directory'),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: pageScrollPadding(context, size),
              child: ContentWidth(
                maxWidth: AppSpacing.contentMaxWidthFor(size),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DirectoryHeader(size: size, directory: directory.value),
                    if (all != null) ...[
                      section,
                      KpiCards(size: size, projects: all),
                      section,
                      WorkspaceSection(projects: all),
                    ],
                    section,
                    const DirectoryToolbar(),
                    section,
                    const _Results(),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Loading, error, empty (no projects, or none matching), cards or table.
class _Results extends ConsumerWidget {
  const _Results();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final query = ref.watch(projectQueryProvider);
    return switch (ref.watch(visibleProjectsProvider)) {
      AsyncData(:final value) when value.isEmpty && query.isFiltered => AppEmptyState(
        key: const ValueKey('projects-empty'),
        icon: AppIcons.search,
        title: l10n.projectsEmptyTitle,
        message: l10n.projectsEmptyMessage,
        action: AppButton(
          key: const ValueKey('projects-clear-filters'),
          label: l10n.projectsClearFilters,
          variant: AppButtonVariant.secondary,
          onPressed: ref.read(projectQueryProvider.notifier).clearFilters,
        ),
      ),
      AsyncData(:final value) when value.isEmpty => AppEmptyState(
        key: const ValueKey('projects-none'),
        icon: AppIcons.tower,
        title: l10n.projectsNoneTitle,
        message: l10n.projectsNoneMessage,
        action: ref.watch(projectPermissionsProvider).canManage
            ? AppButton(label: l10n.projectsCreate, icon: AppIcons.add, onPressed: () => showCreateProject(context))
            : null,
      ),
      AsyncData(:final value) => AdaptiveGrid(
        key: const ValueKey('project-grid'),
        minItemWidth: 320,
        maxColumns: 3,
        children: [for (final project in value) ProjectCard(project: project)],
      ),
      AsyncError(:final error) => AppErrorView(
        message: '${l10n.projectsLoadError} ${localizedFailure(l10n, error)}',
        retryLabel: l10n.commonRetry,
        onRetry: () => ref.read(projectDirectoryViewModelProvider.notifier).refresh(),
      ),
      _ => AppLoadingIndicator(label: l10n.commonLoading),
    };
  }
}
