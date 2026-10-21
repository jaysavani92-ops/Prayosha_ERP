import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_tokens.dart';
import '../../core/widgets/responsive.dart';

class _Destination {
  const _Destination(this.icon, this.selectedIcon, this.label);

  final IconData icon;
  final IconData selectedIcon;
  final String Function(BuildContext) label;
}

/// One navigation model, three presentations:
///   compact  -> bottom NavigationBar (phones)
///   medium   -> NavigationRail (tablets)
///   expanded -> extended NavigationRail with labels (desktop / wide web)
/// Branch order must match the StatefulShellRoute branches in app_router.dart.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static final _destinations = [
    _Destination(AppIcons.dashboard, AppIcons.dashboardSelected, (c) => c.l10n.navDashboard),
    _Destination(AppIcons.settings, AppIcons.settingsSelected, (c) => c.l10n.navSettings),
  ];

  void _go(int index) {
    // Re-selecting the current tab returns to its root.
    navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    final selected = navigationShell.currentIndex;
    final height = context.windowHeight;
    return ResponsiveBuilder(
      builder: (context, size) {
        if (size == WindowSize.compact) {
          return Scaffold(
            body: navigationShell,
            bottomNavigationBar: Semantics(
              label: context.l10n.navMainMenu,
              container: true,
              child: NavigationBar(
                selectedIndex: selected,
                onDestinationSelected: _go,
                destinations: [
                  for (final d in _destinations)
                    NavigationDestination(
                      icon: Icon(d.icon),
                      selectedIcon: Icon(d.selectedIcon),
                      label: d.label(context),
                    ),
                ],
              ),
            ),
          );
        }
        // Labels beside icons need width; a short window (phone landscape)
        // keeps the compact rail so content gets the room.
        final extended = size.isAtLeast(WindowSize.expanded) && height != WindowHeight.compact;
        final rail = NavigationRail(
          extended: extended,
          minExtendedWidth: 220,
          selectedIndex: selected,
          onDestinationSelected: _go,
          labelType: extended ? NavigationRailLabelType.none : NavigationRailLabelType.all,
          leading: height == WindowHeight.compact
              ? null
              : Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
                  child: ExcludeSemantics(child: Icon(AppIcons.brand, size: 32, color: context.colors.primary)),
                ),
          destinations: [
            for (final d in _destinations)
              NavigationRailDestination(
                icon: Icon(d.icon),
                selectedIcon: Icon(d.selectedIcon),
                label: Text(d.label(context)),
              ),
          ],
        );
        return Scaffold(
          body: Row(
            children: [
              // Keeps the rail clear of a landscape notch / camera cut-out.
              SafeArea(
                right: false,
                child: Semantics(
                  label: context.l10n.navMainMenu,
                  container: true,
                  child: FocusTraversalGroup(child: _ScrollableRail(rail: rail)),
                ),
              ),
              const VerticalDivider(),
              Expanded(
                child: SafeArea(
                  left: false,
                  top: false,
                  bottom: false,
                  child: FocusTraversalGroup(child: navigationShell),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// NavigationRail does not scroll; on short windows (or with many
/// destinations / large text) this lets it scroll instead of overflowing.
class _ScrollableRail extends StatelessWidget {
  const _ScrollableRail({required this.rail});

  final NavigationRail rail;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: IntrinsicHeight(child: rail),
        ),
      ),
    );
  }
}
