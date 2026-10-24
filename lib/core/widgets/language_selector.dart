import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../assets/app_assets.dart';
import '../l10n/app_language.dart';
import '../theme/app_tokens.dart';
import '../theme/app_typography.dart';
import 'app_dialog.dart';

enum LanguageSelectorStyle {
  /// Compact icon button with a menu (app bars).
  menu,

  /// Radio-style list (settings page).
  list,

  /// All three languages side by side, one tap to switch (login screen).
  segmented,
}

/// Reusable language picker. Switching applies immediately (the app
/// rebuilds with the new locale), is persisted, and is confirmed in the newly
/// selected language: with a snackbar for the menu and list styles, and only
/// to screen readers for [LanguageSelectorStyle.segmented], whose selected
/// segment already shows the change (a snackbar there would cover the form).
class LanguageSelector extends ConsumerWidget {
  const LanguageSelector({super.key, this.style = LanguageSelectorStyle.menu});

  final LanguageSelectorStyle style;

  Future<void> _select(BuildContext context, WidgetRef ref, AppLanguage language) async {
    if (ref.read(languageControllerProvider) == language) return;
    await ref.read(languageControllerProvider.notifier).select(language);
    if (!context.mounted) return;
    // Rebuilt with the new locale on the next frame; announce in that language.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!context.mounted) return;
      final message = context.l10n.languageChanged(language.nativeName);
      if (style == LanguageSelectorStyle.segmented) {
        SemanticsService.sendAnnouncement(View.of(context), message, Directionality.of(context));
      } else {
        showAppSnackBar(context, message);
      }
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
              leadingIcon: language == current
                  ? const Icon(AppIcons.check)
                  : const SizedBox.square(dimension: AppSizes.iconMd),
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
      // Segments share the available width and grow taller when a label
      // wraps, so they never overflow on narrow windows or at 200 % text.
      LanguageSelectorStyle.segmented => Semantics(
        container: true,
        label: context.l10n.languageSelectorTooltip,
        child: SegmentedButton<AppLanguage>(
          showSelectedIcon: false,
          segments: [
            for (final language in AppLanguage.values)
              ButtonSegment(
                value: language,
                // Each name in its own script's font and line height, so the
                // control is the same size in every UI language.
                label: Text(
                  language.nativeName,
                  key: ValueKey('language-${language.code}'),
                  locale: language.locale,
                  style: AppTypography.forScript(
                    Theme.of(context).textTheme.labelLarge!,
                    uiLocale: Localizations.localeOf(context),
                    script: language.locale,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
          ],
          selected: {current},
          onSelectionChanged: (selection) => _select(context, ref, selection.single),
        ),
      ),
    };
  }
}
