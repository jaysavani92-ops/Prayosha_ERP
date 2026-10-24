import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_formatters.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_surface.dart';
import '../models/project.dart';
import '../viewmodels/project_directory_view_model.dart';
import 'building_elevation.dart';
import 'project_actions.dart';
import 'project_labels.dart';
import 'zone_inspector.dart';

/// A project in the card grid. A dark navy panel carries its elevation
/// drawing, the site code, delayed tasks, status and the ⋮ menu; under it
/// come the building type, name and place, budget and handover,
/// and progress. The active workspace project is outlined in amber. Tapping
/// opens the zone inspector.
class ProjectCard extends ConsumerWidget {
  const ProjectCard({super.key, required this.project});

  final Project project;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;
    final colors = context.colors;
    final muted = context.semanticColors.mutedText;
    final formatters = ref.watch(appFormattersProvider);
    final activeWorkspace = ref.watch(activeProjectProvider)?.id == project.id;

    return AppSurface(
      key: ValueKey('project-card-${project.id}'),
      interactive: true,
      borderColor: activeWorkspace ? colors.secondary : null,
      borderWidth: activeWorkspace ? 2 : 1,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: () => showZoneInspector(context, project),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _PicturePanel(project: project),
                Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.xs, AppSpacing.md, AppSpacing.xs, AppSpacing.xs),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          ExcludeSemantics(
                            child: Icon(AppIcons.tower, size: AppSizes.iconXs, color: colors.secondary),
                          ),
                          const SizedBox(width: AppSpacing.xs),
                          Expanded(
                            child: Text(
                              project.kind.label(l10n).toUpperCase(),
                              style: directoryKindStyle(context),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (project.archived) ProjectStatusPill(label: l10n.archivedBadge, color: muted),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        project.name,
                        style: text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: AppSpacing.xxs),
                      Row(
                        children: [
                          ExcludeSemantics(
                            child: Icon(AppIcons.location, size: AppSizes.iconXs, color: muted),
                          ),
                          const SizedBox(width: AppSpacing.xs),
                          Expanded(
                            child: Text(
                              '${project.address}, ${project.city}',
                              style: text.bodySmall?.copyWith(color: muted),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: _Fact(label: l10n.projectBudget, value: formatters.crores(l10n, project.budget)),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: _Fact(label: l10n.projectHandover, value: formatters.date(project.handoverDate)),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      ProjectProgressBar(project: project),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Caption for the building type on a card ("RESIDENTIAL").
TextStyle? directoryKindStyle(BuildContext context) => Theme.of(context).textTheme.labelSmall?.copyWith(
  color: context.semanticColors.mutedText,
  fontWeight: FontWeight.w800,
  letterSpacing: 0.8,
);

/// The navy panel: elevation drawing, code badge at the top-start, delayed
/// tasks and status at the top-end beside the ⋮ menu.
class _PicturePanel extends StatelessWidget {
  const _PicturePanel({required this.project});

  final Project project;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final delayed = project.workspace.delayedTasks;
    final badge = Theme.of(context).textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: 0.4);
    return ClipRRect(
      borderRadius: AppRadius.mdAll,
      child: ColoredBox(
        color: context.semanticColors.brandNavy,
        child: Stack(
          children: [
            AspectRatio(
              aspectRatio: 2.4,
              child: BuildingElevation(project: project, onDark: true, topInset: AppSpacing.xxxl + AppSpacing.sm),
            ),
            PositionedDirectional(
              top: AppSpacing.md,
              start: AppSpacing.md,
              child: _Badge(
                text: project.code,
                color: AppGlass.highlight.withValues(alpha: 0.14),
                style: badge?.copyWith(
                  color: AppGlass.highlight,
                  letterSpacing: 1,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            PositionedDirectional(
              top: AppSpacing.xs,
              end: AppSpacing.xs,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (delayed > 0) ...[
                    _Badge(
                      text: l10n.delayedCount(delayed),
                      color: colors.error,
                      style: badge?.copyWith(color: colors.onError),
                    ),
                    const SizedBox(width: AppSpacing.xs),
                  ],
                  _Badge(
                    text: project.status.label(l10n).toUpperCase(),
                    color: colors.surface,
                    style: badge?.copyWith(color: colors.onSurface),
                  ),
                  ProjectActionsMenu(project: project, overPanel: true),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color, required this.style});

  final String text;
  final Color color;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: color, borderRadius: AppRadius.smAll),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs + 1),
        child: Text(text, style: style, maxLines: 1),
      ),
    );
  }
}

/// "Progress … 62%" over a bar. The bar is navy (amber on white would fail
/// non-text contrast); the percentage carries the value as text.
class ProjectProgressBar extends ConsumerWidget {
  const ProjectProgressBar({super.key, required this.project});

  final Project project;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;
    final percent = ref.watch(appFormattersProvider).percent(project.progress);
    return Semantics(
      label: '${l10n.projectProgress} $percent',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  l10n.projectProgress,
                  style: text.labelMedium?.copyWith(color: context.semanticColors.mutedText),
                ),
              ),
              Text(
                percent,
                style: text.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          LinearProgressIndicator(
            value: project.progress,
            minHeight: AppSpacing.xs + AppSpacing.xxs,
            borderRadius: AppRadius.pillAll,
            backgroundColor: context.colors.surfaceContainerHighest,
          ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = context.semanticColors.mutedText;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: text.labelSmall?.copyWith(color: muted)),
        const SizedBox(height: AppSpacing.xxs),
        Text(value, style: text.titleSmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
      ],
    );
  }
}
