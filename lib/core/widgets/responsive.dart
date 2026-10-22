import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// Window classes for app-level decisions (navigation style, page layout).
/// Uses the whole window; inside a page prefer [ResponsiveBuilder], which
/// measures the space a widget actually gets.
extension ResponsiveContext on BuildContext {
  WindowSize get windowSize => AppBreakpoints.of(MediaQuery.sizeOf(this).width);
  WindowHeight get windowHeight => AppBreakpoints.heightOf(MediaQuery.sizeOf(this).height);
}

/// Builds per size class from the constraints the widget receives
/// (LayoutBuilder), so it also adapts inside split views, dialogs and panes.
class ResponsiveBuilder extends StatelessWidget {
  const ResponsiveBuilder({super.key, required this.builder});

  final Widget Function(BuildContext context, WindowSize size) builder;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) => builder(context, AppBreakpoints.of(constraints.maxWidth)));
  }
}

/// Picks a value per size class; unspecified classes inherit the nearest
/// smaller one ("mobile-first"), so `compact` is the only required value.
T responsiveValue<T>(WindowSize size, {required T compact, T? medium, T? expanded, T? large, T? extraLarge}) {
  final byClass = [compact, medium, expanded, large, extraLarge];
  for (var i = size.index; i >= 0; i--) {
    final value = byClass[i];
    if (value != null) return value;
  }
  return compact;
}

/// Centers content and caps its width on wide screens.
class ContentWidth extends StatelessWidget {
  const ContentWidth({super.key, required this.child, this.maxWidth = AppSpacing.contentMaxWidth});

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}

/// Standard page padding that grows with the window size.
EdgeInsets pagePadding(WindowSize size) =>
    EdgeInsets.all(responsiveValue(size, compact: AppSpacing.lg, medium: AppSpacing.xl, expanded: AppSpacing.xxl));

/// [pagePadding] plus the space taken by bars drawn over the page, such as
/// the phone's floating navigation dock (the shell extends pages behind it),
/// so the end of a scrolling page is never hidden underneath.
EdgeInsets pageScrollPadding(BuildContext context, WindowSize size) =>
    pagePadding(size) + EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom);

/// Gap between columns/cards for a size class.
double gutter(WindowSize size) => responsiveValue(size, compact: AppSpacing.lg, expanded: AppSpacing.xl);

/// Lays children out in equal-width columns whose count follows the
/// available width (1 on phones up to [maxColumns] on wide screens). Rows
/// size to their content, so no child is clipped at large text scales.
class AdaptiveGrid extends StatelessWidget {
  const AdaptiveGrid({super.key, required this.children, this.minItemWidth = 280, this.maxColumns = 4});

  final List<Widget> children;

  /// Columns are added only while each stays at least this wide.
  final double minItemWidth;
  final int maxColumns;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final space = gutter(AppBreakpoints.of(width));
        final columns = ((width + space) / (minItemWidth + space)).floor().clamp(1, maxColumns);
        final itemWidth = (width - space * (columns - 1)) / columns;
        return Wrap(
          spacing: space,
          runSpacing: space,
          children: [for (final child in children) SizedBox(width: itemWidth, child: child)],
        );
      },
    );
  }
}
