import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_tokens.dart';
import '../../core/theme/theme_mode_controller.dart';
import '../../core/widgets/app_button.dart';
import '../../core/widgets/app_card.dart';
import '../../core/widgets/app_dialog.dart';
import '../../core/widgets/app_top_bar.dart';
import '../../core/widgets/language_selector.dart';
import '../../core/widgets/responsive.dart';
import '../auth/viewmodels/auth_controller.dart';

class SettingsView extends ConsumerWidget {
  const SettingsView({super.key});

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showAppConfirmDialog(
      context,
      title: l10n.signOutConfirmTitle,
      message: l10n.signOutConfirmMessage,
      confirmLabel: l10n.signOut,
      cancelLabel: l10n.commonCancel,
      destructive: true,
    );
    if (!confirmed) return;
    await ref.read(authControllerProvider.notifier).signOut();
    showAppSnackBarOn(messenger, l10n.signedOutMessage);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final themeMode = ref.watch(themeModeControllerProvider);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppTopBar(title: l10n.settingsTitle, showLanguageSelector: false),
      body: ResponsiveBuilder(
        builder: (context, size) => SingleChildScrollView(
          padding: pagePadding(size),
          child: ContentWidth(
            maxWidth: AppSpacing.narrowContentMaxWidth,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppCard(
                  title: l10n.settingsLanguage,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        l10n.settingsLanguageHint,
                        style: text.bodySmall?.copyWith(color: context.semanticColors.mutedText),
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      const LanguageSelector(style: LanguageSelectorStyle.list),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppCard(
                  title: l10n.settingsAppearance,
                  child: SegmentedButton<ThemeMode>(
                    segments: [
                      ButtonSegment(value: ThemeMode.system, label: Text(l10n.themeSystem)),
                      ButtonSegment(value: ThemeMode.light, label: Text(l10n.themeLight)),
                      ButtonSegment(value: ThemeMode.dark, label: Text(l10n.themeDark)),
                    ],
                    selected: {themeMode},
                    onSelectionChanged: (selection) =>
                        ref.read(themeModeControllerProvider.notifier).select(selection.first),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppCard(
                  title: l10n.settingsAccount,
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: AppButton(
                      key: const ValueKey('sign-out'),
                      label: l10n.signOut,
                      icon: AppIcons.signOut,
                      variant: AppButtonVariant.secondary,
                      onPressed: () => _confirmSignOut(context, ref),
                    ),
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
