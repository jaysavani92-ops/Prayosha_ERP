import 'package:flutter/material.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_tokens.dart';
import '../../core/widgets/app_adaptive_panel.dart';
import '../../core/widgets/language_selector.dart';
import '../../core/widgets/responsive.dart';
import '../../core/widgets/theme_mode_selector.dart';

/// Opens the Hub: a bottom sheet on phones, a centred panel on larger
/// windows. Actions close it first, then run in the shell's context.
Future<void> showHub(BuildContext context, {required VoidCallback onOpenSettings, required VoidCallback onSignOut}) {
  void closeThen(BuildContext panelContext, VoidCallback action) {
    Navigator.of(panelContext).pop();
    action();
  }

  Widget panel(BuildContext panelContext, {required bool showClose}) => HubPanel(
    showClose: showClose,
    onOpenSettings: () => closeThen(panelContext, onOpenSettings),
    onSignOut: () => closeThen(panelContext, onSignOut),
  );

  return showAppAdaptivePanel<void>(
    context,
    builder: (panelContext, isSheet) => panel(panelContext, showClose: !isSheet),
  );
}

class _Suite {
  const _Suite(this.icon, this.name);

  final IconData icon;
  final String Function(BuildContext) name;
}

/// Hub contents: quick actions that work today (language, appearance, all
/// settings, sign out), then the site suites still to come. Those suites
/// have no screens or API yet, so they are listed, clearly marked, and not
/// tappable; each becomes a link when its feature ships.
class HubPanel extends StatelessWidget {
  const HubPanel({super.key, required this.onOpenSettings, required this.onSignOut, this.showClose = false});

  final VoidCallback onOpenSettings;
  final VoidCallback onSignOut;
  final bool showClose;

  static final _comingSoon = [
    _Suite(AppIcons.inventory, (c) => c.l10n.suiteInventory),
    _Suite(AppIcons.purchase, (c) => c.l10n.suitePurchase),
    _Suite(AppIcons.pettyCash, (c) => c.l10n.suitePettyCash),
    _Suite(AppIcons.drawings, (c) => c.l10n.suiteDrawings),
    _Suite(AppIcons.planChange, (c) => c.l10n.suitePlanChange),
    _Suite(AppIcons.possession, (c) => c.l10n.suitePossession),
    _Suite(AppIcons.siteMap, (c) => c.l10n.suiteSiteMap),
    _Suite(AppIcons.admin, (c) => c.l10n.suiteAdmin),
  ];

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final text = Theme.of(context).textTheme;

    return SingleChildScrollView(
      key: const ValueKey('hub-panel'),
      padding: EdgeInsets.fromLTRB(AppSpacing.xl, showClose ? AppSpacing.xl : 0, AppSpacing.xl, AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(
                child: DecoratedBox(
                  decoration: BoxDecoration(color: colors.secondary, borderRadius: AppRadius.lgAll),
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Icon(AppIcons.hub, color: colors.onSecondary),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(l10n.hubTitle, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(l10n.hubSubtitle, style: text.bodyMedium?.copyWith(color: context.semanticColors.mutedText)),
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
          const SizedBox(height: AppSpacing.xl),
          _SectionTitle(l10n.hubQuickActions),
          const SizedBox(height: AppSpacing.md),
          _Group(
            label: l10n.settingsLanguage,
            child: const LanguageSelector(style: LanguageSelectorStyle.segmented),
          ),
          const SizedBox(height: AppSpacing.sm),
          _Group(label: l10n.settingsAppearance, child: const ThemeModeSelector()),
          const SizedBox(height: AppSpacing.sm),
          AdaptiveGrid(
            minItemWidth: 200,
            maxColumns: 2,
            children: [
              _ActionTile(
                key: const ValueKey('hub-settings'),
                icon: AppIcons.settings,
                label: l10n.hubAllSettings,
                onTap: onOpenSettings,
              ),
              _ActionTile(
                key: const ValueKey('hub-sign-out'),
                icon: AppIcons.signOut,
                label: l10n.signOut,
                onTap: onSignOut,
                destructive: true,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          _SectionTitle(l10n.hubComingSoon),
          const SizedBox(height: AppSpacing.xxs),
          Text(l10n.hubComingSoonHint, style: text.bodySmall?.copyWith(color: context.semanticColors.mutedText)),
          const SizedBox(height: AppSpacing.md),
          AdaptiveGrid(
            minItemWidth: 140,
            maxColumns: 4,
            children: [for (final suite in _comingSoon) _SuiteTile(suite: suite)],
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Semantics(header: true, child: Text(text, style: Theme.of(context).textTheme.titleSmall));
  }
}

/// A labelled control on a soft panel (language, appearance).
class _Group extends StatelessWidget {
  const _Group({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: context.colors.surfaceContainerLow, borderRadius: AppRadius.lgAll),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: AppSpacing.sm),
            child,
          ],
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final accent = destructive ? colors.error : colors.onPrimaryContainer;
    final accentBackground = destructive ? colors.errorContainer : colors.primaryContainer;
    return Material(
      color: colors.surfaceContainerLow,
      shape: const RoundedRectangleBorder(borderRadius: AppRadius.lgAll),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.tileMinHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
            child: Row(
              children: [
                ExcludeSemantics(
                  child: DecoratedBox(
                    decoration: BoxDecoration(color: accentBackground, shape: BoxShape.circle),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      child: Icon(icon, size: AppSizes.iconSm, color: accent),
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    label,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(color: destructive ? colors.error : null),
                  ),
                ),
                ExcludeSemantics(child: Icon(AppIcons.chevron, color: colors.onSurfaceVariant)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A suite that is not available yet: quiet, outlined, not interactive, and
/// announced as "…, coming soon".
class _SuiteTile extends StatelessWidget {
  const _SuiteTile({required this.suite});

  final _Suite suite;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final name = suite.name(context);
    return Semantics(
      label: context.l10n.hubSuiteComingSoon(name),
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: AppRadius.lgAll,
          border: Border.all(color: colors.outlineVariant),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(suite.icon, size: AppSizes.iconSm, color: colors.onSurfaceVariant),
              const SizedBox(height: AppSpacing.sm),
              Text(
                name,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.semanticColors.mutedText),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
