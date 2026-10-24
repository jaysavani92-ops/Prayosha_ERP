import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_formatters.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_dialog.dart';
import '../../../core/widgets/app_surface.dart';
import '../../../core/widgets/responsive.dart';
import '../models/project.dart';
import '../viewmodels/project_directory_view_model.dart';
import 'create_project_panel.dart';
import 'project_labels.dart';

/// Space between the page's sections: one rhythm for the whole page.
double directorySectionGap(WindowSize size) => responsiveValue(size, compact: AppSpacing.lg, medium: AppSpacing.xl);

/// Small spaced-out caption used for card labels ("TOTAL PORTFOLIO VALUE").
/// Upper-casing only changes Latin text; Gujarati and Hindi read as written.
TextStyle? directoryCaptionStyle(BuildContext context) => Theme.of(context).textTheme.labelSmall?.copyWith(
  color: context.semanticColors.mutedText,
  fontWeight: FontWeight.w700,
  letterSpacing: 0.6,
);

/// A raised surface with a slim accent bar along its start edge (KPI and
/// workspace cards). The colour lives in the bar and the icon tile only;
/// the outline stays a neutral hairline, so the page reads calm.
class DirectoryAccentCard extends StatelessWidget {
  const DirectoryAccentCard({super.key, required this.accent, required this.child, this.padding});

  final Color accent;
  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return AppSurface(
      child: Stack(
        children: [
          PositionedDirectional(
            start: 0,
            top: 0,
            bottom: 0,
            width: AppSpacing.xs - 1,
            child: ColoredBox(color: accent),
          ),
          Padding(padding: padding ?? const EdgeInsets.all(AppSpacing.lg), child: child),
        ],
      ),
    );
  }
}

/// Title with the active-site count, the one-line subtitle, and Create
/// Project (managers only) at the end of the row.
class DirectoryHeader extends ConsumerWidget {
  const DirectoryHeader({super.key, required this.size, required this.directory});

  final WindowSize size;
  final ProjectDirectory? directory;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;
    final canManage = ref.watch(projectPermissionsProvider).canManage;
    final directory = this.directory;

    final title = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Semantics(
              header: true,
              child: Text(
                l10n.projectsTitle,
                style: responsiveValue(
                  size,
                  compact: text.headlineSmall,
                  expanded: text.headlineMedium,
                )?.copyWith(fontWeight: FontWeight.w800, color: context.colors.primary, letterSpacing: -0.5),
              ),
            ),
            if (directory != null)
              _Pill(label: l10n.projectsActiveSites(PortfolioSummary.of(directory.projects).activeSites)),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(l10n.projectsSubtitle, style: text.bodyMedium?.copyWith(color: context.semanticColors.mutedText)),
      ],
    );

    final create = !canManage
        ? null
        : size.isAtLeast(WindowSize.medium)
        ? AppButton(
            key: const ValueKey('projects-create'),
            label: l10n.projectsCreate,
            icon: AppIcons.add,
            onPressed: () => showCreateProject(context),
          )
        : IconButton.filled(
            key: const ValueKey('projects-create'),
            tooltip: l10n.projectsCreate,
            icon: const Icon(AppIcons.add),
            onPressed: () => showCreateProject(context),
          );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: title),
        if (create != null) ...[const SizedBox(width: AppSpacing.md), create],
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: context.colors.surfaceContainerHighest, borderRadius: AppRadius.pillAll),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
        child: Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700, color: context.colors.onSurface),
        ),
      ),
    );
  }
}

/// Total portfolio value, active footprint, sites in progress and alerts
/// (wording and number format as in the web app),
/// each on its own accent card: 2 × 2 on phones, one row of four on wide
/// windows.
class KpiCards extends ConsumerWidget {
  const KpiCards({super.key, required this.projects});

  final List<Project> projects;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final formatters = ref.watch(appFormattersProvider);
    final summary = PortfolioSummary.of(projects);
    final semantic = context.semanticColors;
    final alerts = summary.delayedTasks;

    return _EqualHeightGrid(
      key: const ValueKey('kpi-strip'),
      minItemWidth: 150,
      children: [
        _KpiCard(
          accent: semantic.success,
          icon: AppIcons.portfolio,
          label: l10n.kpiPortfolioValue,
          value: formatters.crores(l10n, summary.portfolioValue, fixedDecimals: true),
          detail: l10n.kpiPortfolioValueHint,
        ),
        _KpiCard(
          accent: semantic.info,
          icon: AppIcons.area,
          label: l10n.kpiActiveFootprint,
          value: formatters.area(l10n, summary.activeAreaSqFt),
          detail: l10n.kpiActiveFootprintHint,
        ),
        _KpiCard(
          accent: context.colors.secondary,
          icon: AppIcons.sites,
          label: l10n.kpiInProgress,
          value: l10n.kpiSitesValue(summary.sitesInProgress),
          detail: l10n.kpiSitesBreakdown(summary.ongoing, summary.planning),
          detailColor: semantic.warning,
        ),
        _KpiCard(
          accent: context.colors.error,
          icon: AppIcons.attention,
          label: l10n.kpiAttention,
          value: l10n.kpiAlertsValue(alerts),
          valueColor: alerts > 0 ? context.colors.error : semantic.success,
          detail: alerts > 0 ? l10n.kpiAlertsDetail(alerts) : l10n.kpiAttentionNone,
        ),
      ],
    );
  }
}

/// Cards in rows of equal height: four across when each gets [minItemWidth],
/// otherwise two (phones). Every card in a row matches the tallest, so a
/// label that wraps never leaves its neighbours short.
class _EqualHeightGrid extends StatelessWidget {
  const _EqualHeightGrid({super.key, required this.minItemWidth, required this.children});

  final double minItemWidth;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final gap = gutter(AppBreakpoints.of(constraints.maxWidth));
        final perRow = constraints.maxWidth >= children.length * minItemWidth + (children.length - 1) * gap
            ? children.length
            : 2;
        return Column(
          children: [
            for (var start = 0; start < children.length; start += perRow) ...[
              if (start > 0) SizedBox(height: gap),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = start; i < start + perRow && i < children.length; i++) ...[
                      if (i > start) SizedBox(width: gap),
                      Expanded(child: children[i]),
                    ],
                  ],
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.accent,
    required this.icon,
    required this.label,
    required this.value,
    required this.detail,
    this.valueColor,
    this.detailColor,
  });

  final Color accent;
  final IconData icon;
  final String label;
  final String value;
  final String detail;
  final Color? valueColor;
  final Color? detailColor;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Semantics(
      container: true,
      child: DirectoryAccentCard(
        accent: accent,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(label.toUpperCase(), style: directoryCaptionStyle(context))),
                const SizedBox(width: AppSpacing.sm),
                ExcludeSemantics(
                  child: DecoratedBox(
                    decoration: BoxDecoration(color: accent.withValues(alpha: 0.12), borderRadius: AppRadius.smAll),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.xs + AppSpacing.xxs),
                      child: Icon(icon, size: AppSizes.iconSm, color: accent),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              value,
              style: text.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: valueColor,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: AppSpacing.xxs),
            Text(
              detail,
              style: text.bodySmall?.copyWith(
                color: detailColor ?? context.semanticColors.mutedText,
                fontWeight: detailColor == null ? null : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The active site project and shortcuts into its operational suites, kept
/// compact: one header line ("ACTIVE WORKSPACE" and the project picker),
/// then a single row of suite tiles.
class WorkspaceSection extends ConsumerWidget {
  const WorkspaceSection({super.key, required this.projects});

  final List<Project> projects;

  /// Narrowest card that keeps the caption and the picker on one line.
  static const _inlineHeaderMinWidth = 300.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final semantic = context.semanticColors;
    final active = ref.watch(activeProjectProvider);
    final choices = projects.where((p) => p.isActive).toList();

    return DirectoryAccentCard(
      key: const ValueKey('workspace-section'),
      accent: colors.secondary,
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.sm, AppSpacing.md, AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Caption at the start, picker at the end (shortened if need be).
          // At large text sizes or on very narrow windows the picker moves
          // under the caption instead of being squeezed.
          LayoutBuilder(
            builder: (context, constraints) {
              final caption = Semantics(
                header: true,
                child: Text(l10n.workspaceTitle.toUpperCase(), style: directoryCaptionStyle(context)),
              );
              final picker = active == null ? null : _WorkspacePicker(active: active, choices: choices);
              final stacked =
                  constraints.maxWidth < WorkspaceSection._inlineHeaderMinWidth ||
                  MediaQuery.textScalerOf(context).scale(1) > 1.3;
              if (stacked) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: caption,
                    ),
                    ?picker,
                  ],
                );
              }
              return Row(
                children: [
                  caption,
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: picker ?? const SizedBox(height: AppSizes.minTouchTarget),
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: AppSpacing.xs),
          if (active == null)
            Text(l10n.workspaceEmpty, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: semantic.mutedText))
          else
            _ShortcutRow(
              children: [
                _Shortcut(
                  key: const ValueKey('workspace-tasks'),
                  icon: AppIcons.tasks,
                  tint: semantic.info,
                  title: l10n.workspaceTasks,
                  hint: l10n.workspaceTasksHint,
                  onTap: () => context.go(AppRoutes.tasks),
                ),
                _Shortcut(
                  key: const ValueKey('workspace-inventory'),
                  icon: AppIcons.inventory,
                  tint: semantic.success,
                  title: l10n.workspaceInventory,
                  hint: l10n.workspaceInventoryHint,
                  onTap: () => showAppSnackBar(context, l10n.workspaceInventoryUnavailable),
                ),
                _Shortcut(
                  key: const ValueKey('workspace-workforce'),
                  icon: AppIcons.workforce,
                  tint: semantic.warning,
                  title: l10n.workspaceWorkforce,
                  hint: l10n.workspaceWorkforceHint,
                  onTap: () => context.go(AppRoutes.workforce),
                ),
                _Shortcut(
                  key: const ValueKey('workspace-pre-development'),
                  icon: AppIcons.preDevelopment,
                  tint: colors.primary,
                  title: l10n.workspacePreDevelopment,
                  hint: l10n.workspacePreDevelopmentHint,
                  onTap: () => context.go(AppRoutes.preDevelopment),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// The "[PRSG-006] Shivalay Heights ▾" pill: a slim amber tag inside a full
/// 48 dp tap target; opens the list of active projects.
class _WorkspacePicker extends ConsumerWidget {
  const _WorkspacePicker({required this.active, required this.choices});

  final Project active;
  final List<Project> choices;

  /// Menu width, so names and codes line up.
  static const _menuWidth = 300.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final label = Theme.of(context).textTheme.labelMedium;
    final text = Theme.of(context).textTheme;
    return MenuAnchor(
      // Opens under the pill with its end edge lined up with the pill's.
      style: const MenuStyle(
        alignment: AlignmentDirectional.bottomEnd,
        minimumSize: WidgetStatePropertyAll(Size(_menuWidth, 0)),
        maximumSize: WidgetStatePropertyAll(Size(_menuWidth, double.infinity)),
      ),
      alignmentOffset: const Offset(-_menuWidth, -AppSpacing.sm),
      menuChildren: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.xs),
          child: Text(l10n.workspaceChoose.toUpperCase(), style: directoryCaptionStyle(context)),
        ),
        for (final project in choices)
          MenuItemButton(
            key: ValueKey('workspace-choice-${project.id}'),
            style: MenuItemButton.styleFrom(
              backgroundColor: project.id == active.id ? colors.secondaryContainer.withValues(alpha: 0.6) : null,
              minimumSize: const Size(0, AppSizes.tileMinHeight),
            ),
            // Status at a glance: the lifecycle colour as a dot.
            leadingIcon: DecoratedBox(
              decoration: BoxDecoration(color: project.status.color(context), shape: BoxShape.circle),
              child: const SizedBox.square(dimension: AppSpacing.sm + AppSpacing.xxs),
            ),
            trailingIcon: SizedBox.square(
              dimension: AppSizes.iconSm,
              child: project.id == active.id
                  ? Icon(AppIcons.check, size: AppSizes.iconSm, color: colors.primary)
                  : null,
            ),
            onPressed: () => ref.read(projectQueryProvider.notifier).setActive(project.id),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    project.name,
                    style: text.labelLarge?.copyWith(
                      fontWeight: project.id == active.id ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                  Text(
                    '${project.code}, ${project.city}',
                    style: text.labelSmall?.copyWith(
                      color: context.semanticColors.mutedText,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
      builder: (context, menu, _) => Tooltip(
        message: l10n.workspaceChoose,
        child: InkWell(
          key: const ValueKey('workspace-project'),
          customBorder: const StadiumBorder(),
          onTap: () => menu.isOpen ? menu.close() : menu.open(),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.minTouchTarget),
            child: Align(
              alignment: AlignmentDirectional.centerEnd,
              widthFactor: 1,
              child: DecoratedBox(
                decoration: ShapeDecoration(color: colors.secondaryContainer, shape: const StadiumBorder()),
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(
                    AppSpacing.md,
                    AppSpacing.xs,
                    AppSpacing.sm,
                    AppSpacing.xs,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(AppIcons.workspaceActive, size: AppSizes.iconXs, color: colors.onSecondaryContainer),
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          '[${active.code}] ${active.name}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: label?.copyWith(color: colors.onSecondaryContainer, fontWeight: FontWeight.w700),
                        ),
                      ),
                      Icon(AppIcons.expand, size: AppSizes.iconXs, color: colors.onSecondaryContainer),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The four suite tiles in one row of equal-height tiles: sharing the width
/// when each gets at least [minTileWidth], otherwise scrolling sideways at
/// that width (phones), so the card stays one row tall.
class _ShortcutRow extends StatelessWidget {
  const _ShortcutRow({required this.children});

  final List<Widget> children;

  static const minTileWidth = 176.0;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const gap = AppSpacing.sm;
        final fits = constraints.maxWidth >= children.length * minTileWidth + (children.length - 1) * gap;
        final row = IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, child) in children.indexed) ...[
                if (index > 0) const SizedBox(width: gap),
                if (fits) Expanded(child: child) else SizedBox(width: minTileWidth, child: child),
              ],
            ],
          ),
        );
        return fits ? row : SingleChildScrollView(scrollDirection: Axis.horizontal, child: row);
      },
    );
  }
}

/// A soft tinted tile: small icon square, suite name and what it covers,
/// each on one line.
class _Shortcut extends StatelessWidget {
  const _Shortcut({
    super.key,
    required this.icon,
    required this.tint,
    required this.title,
    required this.hint,
    required this.onTap,
  });

  final IconData icon;
  final Color tint;
  final String title;
  final String hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final text = Theme.of(context).textTheme;
    return Material(
      color: colors.surfaceContainerLow,
      shape: const RoundedRectangleBorder(borderRadius: AppRadius.mdAll),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.tileMinHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm + AppSpacing.xxs, vertical: AppSpacing.sm),
            child: Row(
              children: [
                ExcludeSemantics(
                  child: DecoratedBox(
                    decoration: BoxDecoration(color: tint.withValues(alpha: 0.14), borderRadius: AppRadius.smAll),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.xs + AppSpacing.xxs),
                      child: Icon(icon, size: AppSizes.iconSm, color: tint),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm + AppSpacing.xxs),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        hint,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: text.labelSmall?.copyWith(color: context.semanticColors.mutedText),
                      ),
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
