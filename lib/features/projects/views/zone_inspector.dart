import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_formatters.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/l10n/error_messages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_adaptive_panel.dart';
import '../../../core/widgets/app_states.dart';
import '../models/project.dart';
import '../models/zone.dart';
import '../viewmodels/project_directory_view_model.dart';
import 'building_elevation.dart';
import 'project_labels.dart';

/// Opens the Architecture & Zone Inspector for [project].
Future<void> showZoneInspector(BuildContext context, Project project) => showAppAdaptivePanel<void>(
  context,
  maxWidth: AppSpacing.contentMaxWidth * 0.75,
  builder: (context, isSheet) => ZoneInspector(project: project, showClose: !isSheet),
);

/// Towers → floors → flats / shops / offices / amenities → rooms, each level
/// expandable. Collapsed levels are not built, so large towers stay cheap.
class ZoneInspector extends ConsumerWidget {
  const ZoneInspector({super.key, required this.project, this.showClose = false});

  final Project project;
  final bool showClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;
    final zones = ref.watch(projectZonesProvider(project));

    return ListView(
      key: const ValueKey('zone-inspector'),
      shrinkWrap: true,
      padding: EdgeInsets.fromLTRB(0, showClose ? AppSpacing.lg : 0, 0, AppSpacing.xl),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(l10n.inspectorTitle, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      '${project.name}, ${project.code}',
                      style: text.bodyMedium?.copyWith(color: context.semanticColors.mutedText),
                    ),
                  ],
                ),
              ),
              if (showClose)
                IconButton(
                  tooltip: l10n.commonClose,
                  icon: const Icon(AppIcons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
          child: ClipRRect(
            borderRadius: AppRadius.lgAll,
            child: AspectRatio(aspectRatio: 3.2, child: BuildingElevation(project: project)),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        ...switch (zones) {
          AsyncData(:final value) => [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
              child: Text(
                l10n.inspectorSummary(value.length, value.fold(0, (sum, t) => sum + t.unitCount)),
                style: text.labelLarge,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final tower in value) _TowerTile(tower: tower, initiallyExpanded: value.length == 1),
          ],
          AsyncError(:final error) => [
            AppErrorView(
              message: '${l10n.inspectorLoadError} ${localizedFailure(l10n, error)}',
              retryLabel: l10n.commonRetry,
              onRetry: () => ref.invalidate(projectZonesProvider(project)),
            ),
          ],
          _ => [AppLoadingIndicator(label: l10n.commonLoading)],
        },
      ],
    );
  }
}

/// Indent per tree level, so the hierarchy reads without connector lines.
EdgeInsetsGeometry _indent(int depth) =>
    EdgeInsetsDirectional.only(start: AppSpacing.xl + depth * AppSpacing.lg, end: AppSpacing.lg);

class _TowerTile extends StatelessWidget {
  const _TowerTile({required this.tower, required this.initiallyExpanded});

  final Tower tower;
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ExpansionTile(
      key: ValueKey('zone-tower-${tower.name}'),
      initiallyExpanded: initiallyExpanded,
      tilePadding: _indent(0),
      shape: const Border(),
      collapsedShape: const Border(),
      leading: const Icon(AppIcons.tower),
      title: Text(tower.name, style: Theme.of(context).textTheme.titleSmall),
      subtitle: Text('${l10n.floorCount(tower.floors.length)}, ${l10n.unitCount(tower.unitCount)}'),
      children: [for (final floor in tower.floors) _FloorTile(floor: floor)],
    );
  }
}

class _FloorTile extends StatelessWidget {
  const _FloorTile({required this.floor});

  final Floor floor;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ExpansionTile(
      tilePadding: _indent(1),
      shape: const Border(),
      collapsedShape: const Border(),
      leading: const Icon(AppIcons.floor),
      title: Text(floor.level == 0 ? l10n.floorGround : l10n.floorLevel(floor.level)),
      subtitle: Text(l10n.unitCount(floor.units.length)),
      children: [for (final unit in floor.units) _UnitTile(unit: unit)],
    );
  }
}

class _UnitTile extends ConsumerWidget {
  const _UnitTile({required this.unit});

  final Unit unit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final formatters = ref.watch(appFormattersProvider);
    final muted = context.semanticColors.mutedText;
    final layout = unit.layout;
    return ExpansionTile(
      tilePadding: _indent(2),
      childrenPadding: const EdgeInsetsDirectional.only(bottom: AppSpacing.sm),
      shape: const Border(),
      collapsedShape: const Border(),
      leading: Icon(unit.kind.icon),
      title: Text(layout == null ? unit.label : '${unit.label}, $layout'),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xs),
        child: Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(unit.kind.label(l10n)),
            ProjectStatusPill(label: unit.stage.label(l10n), color: unit.stage.color(context)),
          ],
        ),
      ),
      children: [
        for (final room in unit.rooms)
          ListTile(
            dense: true,
            contentPadding: _indent(4),
            title: Text(room.name),
            trailing: room.areaSqFt == null
                ? null
                : Text(
                    formatters.area(l10n, room.areaSqFt!),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: muted),
                  ),
          ),
      ],
    );
  }
}
