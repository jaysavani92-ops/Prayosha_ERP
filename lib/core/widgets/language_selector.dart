import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../assets/app_assets.dart';
import '../l10n/app_language.dart';
import 'app_dialog.dart';

enum LanguageSelectorStyle {
  /// Compact icon button with a menu (app bars, login screen).
  menu,

  /// Radio-style list (settings page).
  list,
}

/// Reusable language picker. Switching applies immediately (the app
/// rebuilds with the new locale), is persisted, and is confirmed with a
/// notification written in the newly selected language.
class LanguageSelector extends ConsumerWidget {
  const LanguageSelector({super.key, this.style = LanguageSelectorStyle.menu});

  final LanguageSelectorStyle style;

  Future<void> _select(BuildContext context, WidgetRef ref, AppLanguage language) async {
    if (ref.read(languageControllerProvider) == language) return;
    await ref.read(languageControllerProvider.notifier).select(language);
    if (!context.mounted) return;
    // Rebuilt with the new locale on the next frame; announce in that language.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (context.mounted) showAppSnackBar(context, context.l10n.languageChanged(language.nativeName));
    });
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(languageControllerProvider);
    return switch (style) {
      LanguageSelectorStyle.menu => MenuAnchor(
        menuChildren: [
          for (final language in AppLanguage.values)
            MenuItemButton(
              key: ValueKey('language-${language.code}'),
              leadingIcon: language == current ? const Icon(AppIcons.check) : const SizedBox.square(dimension: 24),
              onPressed: () => _select(context, ref, language),
              child: Text(language.nativeName, locale: language.locale),
            ),
        ],
        builder: (context, controller, _) => IconButton(
          key: const ValueKey('language-selector'),
          tooltip: context.l10n.languageSelectorTooltip,
          icon: const Icon(AppIcons.language),
          onPressed: () => controller.isOpen ? controller.close() : controller.open(),
        ),
      ),
      LanguageSelectorStyle.list => RadioGroup<AppLanguage>(
        groupValue: current,
        onChanged: (language) {
          if (language != null) _select(context, ref, language);
        },
        child: Column(
          children: [
            for (final language in AppLanguage.values)
              RadioListTile<AppLanguage>(
                key: ValueKey('language-${language.code}'),
                value: language,
                title: Text(language.nativeName, locale: language.locale),
              ),
          ],
        ),
      ),
    };
  }
}
