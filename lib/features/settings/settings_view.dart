import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_tokens.dart';
import '../../core/widgets/app_button.dart';
import '../../core/widgets/app_card.dart';
import '../../core/widgets/app_top_bar.dart';
import '../../core/widgets/language_selector.dart';
import '../../core/widgets/responsive.dart';
import '../../core/widgets/theme_mode_selector.dart';
import '../auth/views/sign_out.dart';

class SettingsView extends ConsumerWidget {
  const SettingsView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppTopBar(title: l10n.settingsTitle, showLanguageSelector: false),
      body: ResponsiveBuilder(
        builder: (context, size) => SingleChildScrollView(
          padding: pageScrollPadding(context, size),
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
                AppCard(title: l10n.settingsAppearance, child: const ThemeModeSelector()),
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
                      onPressed: () => confirmSignOut(context, ref),
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
