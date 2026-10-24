import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_surface.dart';
import '../viewmodels/project_directory_view_model.dart';
import 'directory_header.dart';
import 'project_labels.dart';

/// One slim search bar: the search field, then (after a hairline) which
/// projects to show. The bar's outline turns to the primary colour while
/// search has focus. Below [_DirectoryToolbarState._minInlineWidth] the
/// search field spans the full width and the filter drops below it.
class DirectoryToolbar extends ConsumerStatefulWidget {
  const DirectoryToolbar({super.key});

  @override
  ConsumerState<DirectoryToolbar> createState() => _DirectoryToolbarState();
}

class _DirectoryToolbarState extends ConsumerState<DirectoryToolbar> {
  late final _search = TextEditingController(text: ref.read(projectQueryProvider).search);
  final _focus = FocusNode();

  /// Narrowest bar that puts the filter beside search while search keeps
  /// room for its full hint. Narrower (phones, small tablets), search takes
  /// the full width and the filter sits on its own line underneath.
  static const _minInlineWidth = 600.0;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _search.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final query = ref.watch(projectQueryProvider);
    final controller = ref.read(projectQueryProvider.notifier);

    // Clearing filters elsewhere (the empty state) clears the field too.
    ref.listen(projectQueryProvider.select((q) => q.search), (_, next) {
      if (next != _search.text) _search.text = next;
    });

    final search = TextField(
      key: const ValueKey('projects-search'),
      controller: _search,
      focusNode: _focus,
      textInputAction: TextInputAction.search,
      onChanged: controller.setSearch,
      style: Theme.of(context).textTheme.bodyMedium,
      decoration: InputDecoration(
        // The bar draws the outline; the field itself is bare.
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        filled: false,
        isDense: true,
        hintText: l10n.projectsSearchLabel,
        prefixIcon: Icon(AppIcons.search, size: AppSizes.iconSm, color: context.semanticColors.mutedText),
        prefixIconConstraints: const BoxConstraints(minWidth: AppSizes.minTouchTarget),
        suffixIcon: query.search.isEmpty
            ? null
            : IconButton(
                tooltip: l10n.projectsClearSearch,
                icon: const Icon(AppIcons.clear, size: AppSizes.iconSm),
                onPressed: () => controller.setSearch(''),
              ),
        contentPadding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      ),
    );
    final projects = ref.watch(projectDirectoryViewModelProvider).value?.projects ?? const [];
    Widget filter({required bool atEnd}) => _FilterButton(
      value: query.filter,
      counts: {for (final f in ProjectFilter.values) f: applyProjectQuery(projects, ProjectQuery(filter: f)).length},
      onChanged: controller.setFilter,
      atEnd: atEnd,
    );

    return AppSurface(
      key: const ValueKey('directory-toolbar'),
      borderRadius: AppRadius.controlAll,
      borderColor: _focus.hasFocus ? colors.primary : null,
      borderWidth: _focus.hasFocus ? 1.5 : 1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth >= _minInlineWidth) {
            return Row(
              children: [
                Expanded(child: search),
                SizedBox(
                  height: AppSpacing.xl,
                  child: VerticalDivider(width: 1, color: colors.outlineVariant),
                ),
                filter(atEnd: true),
              ],
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              search,
              Divider(height: 1, color: colors.outlineVariant),
              Align(alignment: AlignmentDirectional.centerStart, child: filter(atEnd: false)),
            ],
          );
        },
      ),
    );
  }
}

/// "Active projects ▾" inside the search bar. Its menu lists every filter
/// with an icon in its colour and how many projects it would show; the
/// chosen one is highlighted and ticked, and the archive sits apart below a
/// divider.
class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.value, required this.counts, required this.onChanged, required this.atEnd});

  final ProjectFilter value;

  /// Projects each filter would show (empty while loading).
  final Map<ProjectFilter, int> counts;
  final ValueChanged<ProjectFilter> onChanged;

  /// The button sits at the end of the bar (wide windows), so the menu lines
  /// up with its end edge; otherwise with its start edge.
  final bool atEnd;

  /// Menu width, so labels and counts line up whatever is chosen.
  static const _menuWidth = 280.0;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final text = Theme.of(context).textTheme;

    Widget option(ProjectFilter option) {
      final selected = option == value;
      final tint = option.color(context);
      final count = counts[option];
      return MenuItemButton(
        key: ValueKey('option-$option'),
        style: MenuItemButton.styleFrom(
          backgroundColor: selected ? colors.primaryContainer.withValues(alpha: 0.6) : null,
        ),
        leadingIcon: DecoratedBox(
          decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: AppRadius.smAll),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xs + AppSpacing.xxs),
            child: Icon(option.icon, size: AppSizes.iconXs, color: tint),
          ),
        ),
        trailingIcon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (count != null)
              DecoratedBox(
                decoration: BoxDecoration(color: colors.surfaceContainerHighest, borderRadius: AppRadius.pillAll),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs),
                  child: Text(
                    '$count',
                    style: text.labelSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ),
            const SizedBox(width: AppSpacing.sm),
            // Space kept for the tick, so counts align on every row.
            SizedBox.square(
              dimension: AppSizes.iconSm,
              child: selected ? Icon(AppIcons.check, size: AppSizes.iconSm, color: colors.primary) : null,
            ),
          ],
        ),
        onPressed: () => onChanged(option),
        child: Text(
          option.label(l10n),
          style: text.labelLarge?.copyWith(fontWeight: selected ? FontWeight.w700 : FontWeight.w500),
        ),
      );
    }

    return MenuAnchor(
      // Opens under the button, lined up with the edge it sits on.
      style: MenuStyle(
        alignment: atEnd ? AlignmentDirectional.bottomEnd : AlignmentDirectional.bottomStart,
        minimumSize: const WidgetStatePropertyAll(Size(_menuWidth, 0)),
        maximumSize: const WidgetStatePropertyAll(Size(_menuWidth, double.infinity)),
      ),
      alignmentOffset: Offset(atEnd ? -_menuWidth : 0, AppSpacing.xs),
      menuChildren: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.xs),
          child: Text(l10n.projectsFilterLabel.toUpperCase(), style: directoryCaptionStyle(context)),
        ),
        for (final f in ProjectFilter.values)
          if (f != ProjectFilter.archived) option(f),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Divider(height: 1),
        ),
        option(ProjectFilter.archived),
      ],
      builder: (context, menu, _) => Semantics(
        button: true,
        label: '${l10n.projectsFilterLabel}: ${value.label(l10n)}',
        excludeSemantics: true,
        child: InkWell(
          key: const ValueKey('projects-filter'),
          onTap: () => menu.isOpen ? menu.close() : menu.open(),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.minTouchTarget),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(AppIcons.filter, size: AppSizes.iconSm, color: colors.primary),
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      value.label(l10n),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Icon(AppIcons.expand, size: AppSizes.iconSm, color: colors.onSurfaceVariant),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
