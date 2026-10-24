import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_tokens.dart';
import '../../core/widgets/responsive.dart';
import '../../features/auth/views/sign_out.dart';
import 'hub_panel.dart';

class _Destination {
  const _Destination(this.key, this.icon, this.selectedIcon, this.label, [this.shortLabel]);

  final String key;
  final IconData icon;
  final IconData selectedIcon;
  final String Function(BuildContext) label;

  /// For the phone dock, where width is tight (defaults to [label]).
  final String Function(BuildContext)? shortLabel;
}

/// Branch index of Settings in app_router.dart: a branch, so `/settings`
/// keeps the shell, but not a destination (it is opened from the Hub).
const _settingsBranch = 4;

/// One navigation model, three presentations:
///   compact            -> white floating dock with a navy Hub rising from its centre (phones)
///   medium             -> rail with a round navy Hub (tablets, phone landscape)
///   expanded and wider -> sidebar with the brand and a full-width navy Hub
/// Destination order must match the StatefulShellRoute branches.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  static final _destinations = [
    _Destination('overview', AppIcons.overview, AppIcons.overviewSelected, (c) => c.l10n.navOverview),
    _Destination('tasks', AppIcons.tasks, AppIcons.tasksSelected, (c) => c.l10n.navTasks),
    _Destination('workforce', AppIcons.workforce, AppIcons.workforceSelected, (c) => c.l10n.navWorkforce),
    _Destination(
      'pre-development',
      AppIcons.preDevelopment,
      AppIcons.preDevelopmentSelected,
      (c) => c.l10n.navPreDevelopment,
      (c) => c.l10n.navPreDevelopmentShort,
    ),
  ];

  void _go(int index) {
    // A light tick confirms a tab change (not a re-tap of the current one).
    if (index != navigationShell.currentIndex) HapticFeedback.selectionClick();
    // Re-selecting the current tab returns to its root.
    navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
  }

  void _openHub(BuildContext context, WidgetRef ref) {
    HapticFeedback.lightImpact();
    showHub(
      context,
      onOpenSettings: () => navigationShell.goBranch(_settingsBranch),
      onSignOut: () => confirmSignOut(context, ref),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Settings has no destination, so nothing is highlighted there.
    final index = navigationShell.currentIndex;
    final selected = index < _destinations.length ? index : null;
    final height = context.windowHeight;

    return ResponsiveBuilder(
      builder: (context, size) {
        if (!size.isAtLeast(WindowSize.medium)) {
          // Pages run behind the floating dock (seen through its glass); the
          // Scaffold reports the dock's height as bottom padding, which pages
          // add to their scroll insets (pageScrollPadding), so nothing ends
          // up hidden under it.
          return Scaffold(
            extendBody: true,
            body: navigationShell,
            bottomNavigationBar: _Dock(
              destinations: _destinations,
              selected: selected,
              onSelect: _go,
              onHub: () => _openHub(context, ref),
            ),
          );
        }

        // A short window (phone landscape) keeps the compact rail so the
        // content gets the room.
        final sidebar = size.isAtLeast(WindowSize.expanded) && height != WindowHeight.compact;
        final rail = NavigationRail(
          extended: sidebar,
          minExtendedWidth: AppNav.sidebarWidth,
          selectedIndex: selected,
          onDestinationSelected: _go,
          labelType: sidebar ? NavigationRailLabelType.none : NavigationRailLabelType.all,
          groupAlignment: -1,
          leading: _RailHeader(
            sidebar: sidebar,
            showBrand: height != WindowHeight.compact,
            onHub: () => _openHub(context, ref),
          ),
          destinations: [
            for (final d in _destinations)
              NavigationRailDestination(
                icon: Icon(d.icon, key: ValueKey('nav-${d.key}')),
                selectedIcon: Icon(d.selectedIcon, key: ValueKey('nav-${d.key}')),
                // The compact rail is narrow: it shows the short name, while
                // screen readers still hear the full one.
                label: Semantics(
                  label: d.label(context),
                  excludeSemantics: true,
                  child: Text(sidebar ? d.label(context) : (d.shortLabel ?? d.label)(context)),
                ),
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
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

/// Phone dock: a white rounded bar floating above the page, with two tabs on
/// each side of a navy Hub that rises from its centre. The active tab gets a
/// filled navy icon, a bold navy label and a short amber underline (its space
/// is kept on every tab, so nothing shifts). Height follows the text size;
/// labels shrink to fit rather than overflow (screen readers get the full
/// name and position).
class _Dock extends StatelessWidget {
  const _Dock({required this.destinations, required this.selected, required this.onSelect, required this.onHub});

  final List<_Destination> destinations;
  final int? selected;
  final ValueChanged<int> onSelect;
  final VoidCallback onHub;

  /// Space above the icons; the risen Hub clears the labels below it.
  static const _top = AppSpacing.md;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final half = destinations.length ~/ 2;

    Widget item(int i) => Expanded(
      child: _DockItem(
        destination: destinations[i],
        selected: selected == i,
        semanticLabel: context.l10n.navTabPosition(destinations[i].label(context), i + 1, destinations.length),
        onTap: () => onSelect(i),
      ),
    );

    return Semantics(
      key: const ValueKey('app-bottom-nav'),
      label: context.l10n.navMainMenu,
      container: true,
      explicitChildNodes: true,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(AppNav.dockMargin, 0, AppNav.dockMargin, AppNav.dockMargin),
        // The bar takes the height of its tallest item, measured with the real
        // font (Gujarati and Devanagari glyphs are taller than fontSize ×
        // height suggests); the Hub rises into the space kept above it.
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: AppNav.hubRise),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: const BorderRadius.all(Radius.circular(AppNav.dockRadius)),
                  border: Border.all(color: colors.outlineVariant),
                  boxShadow: [
                    BoxShadow(
                      color: colors.primary.withValues(alpha: 0.12),
                      blurRadius: 28,
                      offset: const Offset(0, 12),
                    ),
                    BoxShadow(color: colors.shadow.withValues(alpha: 0.06), blurRadius: 3, offset: const Offset(0, 1)),
                  ],
                ),
                child: IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var i = 0; i < half; i++) item(i),
                      SizedBox(
                        width: AppNav.hubSlotWidth,
                        child: _HubSlot(onTap: onHub, top: _top),
                      ),
                      for (var i = half; i < destinations.length; i++) item(i),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Center(
                child: _HubButton(onPressed: onHub, diameter: AppNav.hubDiameter, ringColor: colors.surface),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The dock's middle slot: the Hub's label, on the same line as the tab
/// labels. Tapping it opens the Hub too; the button above carries the
/// semantics.
class _HubSlot extends StatelessWidget {
  const _HubSlot({required this.onTap, required this.top});

  final VoidCallback onTap;
  final double top;

  @override
  Widget build(BuildContext context) {
    // Excluded as a whole (tap included): screen readers reach the Hub
    // through the labelled button, not a second, unlabelled target.
    return ExcludeSemantics(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.only(top: top + AppNav.iconSize + AppSpacing.xs),
          child: Align(
            alignment: Alignment.topCenter,
            child: _DockLabel(text: context.l10n.navHub, selected: false),
          ),
        ),
      ),
    );
  }
}

class _DockItem extends StatelessWidget {
  const _DockItem({
    required this.destination,
    required this.selected,
    required this.semanticLabel,
    required this.onTap,
  });

  final _Destination destination;
  final bool selected;
  final String semanticLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final duration = MediaQuery.disableAnimationsOf(context) ? Duration.zero : AppDurations.medium;

    return Semantics(
      selected: selected,
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: InkWell(
        key: ValueKey('nav-${destination.key}'),
        onTap: onTap,
        customBorder: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(AppNav.dockRadius))),
        overlayColor: WidgetStatePropertyAll(colors.primary.withValues(alpha: 0.06)),
        child: Padding(
          padding: const EdgeInsets.only(top: _Dock._top, bottom: AppSpacing.sm),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedSwitcher(
                duration: duration,
                transitionBuilder: (child, animation) => ScaleTransition(
                  scale: Tween<double>(begin: 0.85, end: 1).animate(animation),
                  child: FadeTransition(opacity: animation, child: child),
                ),
                child: Icon(
                  selected ? destination.selectedIcon : destination.icon,
                  key: ValueKey(selected),
                  size: AppNav.iconSize,
                  color: selected ? colors.primary : colors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              _DockLabel(text: (destination.shortLabel ?? destination.label)(context), selected: selected),
              const SizedBox(height: AppSpacing.xs),
              AnimatedContainer(
                key: ValueKey('nav-underline-${destination.key}'),
                duration: duration,
                curve: Curves.easeOutCubic,
                width: selected ? AppNav.underlineWidth : 0,
                height: AppNav.underlineHeight,
                decoration: BoxDecoration(color: colors.secondary, borderRadius: AppRadius.pillAll),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DockLabel extends StatelessWidget {
  const _DockLabel({required this.text, required this.selected});

  final String text;
  final bool selected;

  static TextStyle styleOf(BuildContext context, {required bool selected}) {
    final colors = context.colors;
    return Theme.of(context).textTheme.labelSmall!.copyWith(
      letterSpacing: 0,
      color: selected ? colors.primary : colors.onSurfaceVariant,
      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: AnimatedDefaultTextStyle(
        duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : AppDurations.medium,
        style: styleOf(context, selected: selected),
        child: Text(text, maxLines: 1, softWrap: false),
      ),
    );
  }
}

/// The Hub: deep navy with an amber icon. Round on the phone dock (ringed in
/// the dock's colour, rising from its centre) and on the compact rail; a
/// full-width labelled button in the sidebar. It dips slightly while pressed.
class _HubButton extends StatefulWidget {
  const _HubButton({
    required this.onPressed,
    this.diameter = AppNav.railHubDiameter,
    this.extended = false,
    this.ringColor,
  });

  final VoidCallback onPressed;
  final double diameter;
  final bool extended;

  /// Ring around the round button; none when null.
  final Color? ringColor;

  @override
  State<_HubButton> createState() => _HubButtonState();
}

class _HubButtonState extends State<_HubButton> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final navy = context.semanticColors.brandNavy;
    final l10n = context.l10n;
    final extended = widget.extended;
    final shape = extended ? const StadiumBorder() : const CircleBorder();
    final icon = Icon(AppIcons.hub, color: colors.secondary, size: extended ? AppNav.iconSize : widget.diameter * 0.46);

    final Widget content = extended
        ? ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.minTouchTarget),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  icon,
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      l10n.navHub,
                      style: Theme.of(
                        context,
                      ).textTheme.labelLarge?.copyWith(color: AppGlass.highlight, fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          )
        : SizedBox.square(
            dimension: widget.diameter,
            child: Center(child: icon),
          );

    Widget button = DecoratedBox(
      decoration: ShapeDecoration(
        shape: shape,
        color: navy,
        shadows: [BoxShadow(color: navy.withValues(alpha: 0.35), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: Material(
        type: MaterialType.transparency,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: const ValueKey('hub-button'),
          onTap: widget.onPressed,
          onHighlightChanged: _setPressed,
          child: content,
        ),
      ),
    );
    final ring = widget.ringColor;
    if (ring != null && !extended) {
      button = DecoratedBox(
        decoration: BoxDecoration(color: ring, shape: BoxShape.circle),
        child: Padding(padding: const EdgeInsets.all(AppNav.hubRingWidth), child: button),
      );
    }

    return Tooltip(
      message: l10n.navOpenHub,
      child: Semantics(
        button: true,
        label: l10n.navOpenHub,
        excludeSemantics: true,
        child: AnimatedScale(
          scale: _pressed ? AppNav.pressedScale : 1,
          duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : AppDurations.fast,
          curve: Curves.easeOut,
          child: button,
        ),
      ),
    );
  }
}

/// Top of the rail: the brand (mark only on the compact rail, mark and name
/// in the sidebar), then the Hub button.
class _RailHeader extends StatelessWidget {
  const _RailHeader({required this.sidebar, required this.showBrand, required this.onHub});

  final bool sidebar;
  final bool showBrand;
  final VoidCallback onHub;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final mark = DecoratedBox(
      decoration: BoxDecoration(color: context.semanticColors.brandNavy, borderRadius: AppRadius.mdAll),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Icon(AppIcons.brand, size: AppNav.iconSize, color: colors.secondary),
      ),
    );

    if (!sidebar) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Column(
          children: [
            if (showBrand) ...[ExcludeSemantics(child: mark), const SizedBox(height: AppSpacing.lg)],
            _HubButton(onPressed: onHub),
          ],
        ),
      );
    }

    return SizedBox(
      width: AppNav.sidebarWidth,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (showBrand) ...[
              Row(
                children: [
                  ExcludeSemantics(child: mark),
                  const SizedBox(width: AppSpacing.md),
                  Flexible(
                    child: Text(
                      context.l10n.appTitle,
                      style: Theme.of(
                        context,
                      ).textTheme.titleLarge?.copyWith(color: colors.primary, fontWeight: FontWeight.w700),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
            ],
            _HubButton(onPressed: onHub, extended: true),
          ],
        ),
      ),
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
