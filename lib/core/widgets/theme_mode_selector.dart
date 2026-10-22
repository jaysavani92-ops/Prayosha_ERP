import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_language.dart';
import '../theme/theme_mode_controller.dart';

/// System / light / dark switch, applied immediately and remembered.
class ThemeModeSelector extends ConsumerWidget {
  const ThemeModeSelector({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return SegmentedButton<ThemeMode>(
      // The amber fill marks the choice; a tick would make labels wrap.
      showSelectedIcon: false,
      segments: [
        ButtonSegment(value: ThemeMode.system, label: Text(l10n.themeSystem)),
        ButtonSegment(value: ThemeMode.light, label: Text(l10n.themeLight)),
        ButtonSegment(value: ThemeMode.dark, label: Text(l10n.themeDark)),
      ],
      selected: {ref.watch(themeModeControllerProvider)},
      onSelectionChanged: (selection) => ref.read(themeModeControllerProvider.notifier).select(selection.first),
    );
  }
}
