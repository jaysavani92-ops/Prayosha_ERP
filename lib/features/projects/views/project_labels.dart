import 'package:flutter/material.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_formatters.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../models/project.dart';
import '../models/zone.dart';
import '../viewmodels/project_directory_view_model.dart';

extension ProjectStatusLabel on ProjectStatus {
  String label(AppLocalizations l10n) => switch (this) {
    ProjectStatus.planning => l10n.statusPlanning,
    ProjectStatus.inProgress => l10n.statusInProgress,
    ProjectStatus.onHold => l10n.statusOnHold,
    ProjectStatus.completed => l10n.statusCompleted,
  };

  Color color(BuildContext context) => switch (this) {
    ProjectStatus.planning => context.semanticColors.info,
    ProjectStatus.inProgress => context.colors.primary,
    ProjectStatus.onHold => context.semanticColors.warning,
    ProjectStatus.completed => context.semanticColors.success,
  };
}

extension ScheduleHealthLabel on ScheduleHealth {
  String label(AppLocalizations l10n) => switch (this) {
    ScheduleHealth.onTrack => l10n.healthOnTrack,
    ScheduleHealth.atRisk => l10n.healthAtRisk,
    ScheduleHealth.delayed => l10n.healthDelayed,
  };

  Color color(BuildContext context) => switch (this) {
    ScheduleHealth.onTrack => context.semanticColors.success,
    ScheduleHealth.atRisk => context.semanticColors.warning,
    ScheduleHealth.delayed => context.colors.error,
  };
}

extension ProjectKindLabel on ProjectKind {
  String label(AppLocalizations l10n) => switch (this) {
    ProjectKind.residential => l10n.kindResidential,
    ProjectKind.commercial => l10n.kindCommercial,
    ProjectKind.mixedUse => l10n.kindMixedUse,
  };
}

extension ProjectFilterLabel on ProjectFilter {
  String label(AppLocalizations l10n) => switch (this) {
    ProjectFilter.active => l10n.filterActive,
    ProjectFilter.inProgress => l10n.statusInProgress,
    ProjectFilter.planning => l10n.statusPlanning,
    ProjectFilter.onHold => l10n.statusOnHold,
    ProjectFilter.completed => l10n.statusCompleted,
    ProjectFilter.archived => l10n.filterArchived,
  };
}

/// Icon and colour of each filter in the filter menu: the status colours,
/// navy for every active project, muted for the archive.
extension ProjectFilterStyle on ProjectFilter {
  IconData get icon => switch (this) {
    ProjectFilter.active => AppIcons.filterActive,
    ProjectFilter.inProgress => AppIcons.filterInProgress,
    ProjectFilter.planning => AppIcons.filterPlanning,
    ProjectFilter.onHold => AppIcons.filterOnHold,
    ProjectFilter.completed => AppIcons.filterCompleted,
    ProjectFilter.archived => AppIcons.archive,
  };

  Color color(BuildContext context) => switch (this) {
    ProjectFilter.active => context.colors.primary,
    ProjectFilter.inProgress => ProjectStatus.inProgress.color(context),
    ProjectFilter.planning => ProjectStatus.planning.color(context),
    ProjectFilter.onHold => ProjectStatus.onHold.color(context),
    ProjectFilter.completed => ProjectStatus.completed.color(context),
    ProjectFilter.archived => context.semanticColors.mutedText,
  };
}

extension UnitKindLabel on UnitKind {
  String label(AppLocalizations l10n) => switch (this) {
    UnitKind.flat => l10n.unitFlat,
    UnitKind.shop => l10n.unitShop,
    UnitKind.office => l10n.unitOffice,
    UnitKind.amenity => l10n.unitAmenity,
  };

  IconData get icon => switch (this) {
    UnitKind.flat => AppIcons.flat,
    UnitKind.shop => AppIcons.shop,
    UnitKind.office => AppIcons.office,
    UnitKind.amenity => AppIcons.amenity,
  };
}

extension UnitStageLabel on UnitStage {
  String label(AppLocalizations l10n) => switch (this) {
    UnitStage.structure => l10n.stageStructure,
    UnitStage.finishing => l10n.stageFinishing,
    UnitStage.ready => l10n.stageReady,
  };

  Color color(BuildContext context) => switch (this) {
    UnitStage.structure => context.semanticColors.info,
    UnitStage.finishing => context.semanticColors.warning,
    UnitStage.ready => context.semanticColors.success,
  };
}

/// Amounts and areas as the directory shows them.
extension ProjectFormatting on AppFormatters {
  /// Rupees in crores, e.g. "₹86.5 Cr" / "₹86.5 કરોડ".
  String crores(AppLocalizations l10n, double rupees) => l10n.amountCrore(number(rupees / 10000000, maxDecimals: 2));

  String area(AppLocalizations l10n, int sqFt) => l10n.areaSqFt(number(sqFt, maxDecimals: 0));

  /// Area in short form for headline numbers, e.g. "16.2L sq ft".
  String compactArea(AppLocalizations l10n, int sqFt) => l10n.areaSqFt(compact(sqFt));
}

/// Coloured dot and label, e.g. lifecycle status or schedule health. The dot
/// carries colour; the text alone carries the meaning (never colour only).
class ProjectStatusPill extends StatelessWidget {
  const ProjectStatusPill({super.key, required this.label, required this.color, this.icon, this.filled = false});

  final String label;
  final Color color;

  /// On the surface colour first, so the pill stays legible over a drawing.
  final bool filled;

  /// Replaces the dot (e.g. a warning sign for delays).
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: filled
            ? Color.alphaBlend(color.withValues(alpha: 0.12), context.colors.surface)
            : color.withValues(alpha: 0.1),
        borderRadius: AppRadius.pillAll,
        boxShadow: filled ? AppShadows.sm : null,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null)
              Icon(icon, size: AppSizes.iconXs, color: color)
            else
              DecoratedBox(
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: const SizedBox.square(dimension: AppSpacing.sm),
              ),
            const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: text.labelMedium?.copyWith(color: context.colors.onSurface, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Status pill for a project's lifecycle.
class ProjectStatusBadge extends StatelessWidget {
  const ProjectStatusBadge({super.key, required this.status, this.filled = false});

  final ProjectStatus status;
  final bool filled;

  @override
  Widget build(BuildContext context) => ProjectStatusPill(
    label: status.label(AppLocalizations.of(context)),
    color: status.color(context),
    filled: filled,
  );
}

/// Schedule health of a running project; nothing for planning or completed.
class ScheduleHealthBadge extends StatelessWidget {
  const ScheduleHealthBadge({super.key, required this.project, this.filled = false});

  final Project project;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    if (project.status != ProjectStatus.inProgress && project.status != ProjectStatus.onHold) {
      return const SizedBox.shrink();
    }
    final health = project.health;
    return ProjectStatusPill(
      label: health.label(AppLocalizations.of(context)),
      color: health.color(context),
      icon: health == ScheduleHealth.onTrack ? null : AppIcons.attention,
      filled: filled,
    );
  }
}
