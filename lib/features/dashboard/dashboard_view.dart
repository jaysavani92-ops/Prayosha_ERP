import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_formatters.dart';
import '../../core/l10n/app_language.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_tokens.dart';
import '../../core/widgets/app_card.dart';
import '../../core/widgets/app_top_bar.dart';
import '../../core/widgets/responsive.dart';
import '../auth/models/user.dart';
import '../auth/viewmodels/auth_controller.dart';
import '../auth/views/role_label.dart';
import '../uploads/views/recent_uploads_section.dart';

class DashboardView extends ConsumerWidget {
  const DashboardView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).value;
    return Scaffold(
      appBar: AppTopBar(title: context.l10n.navOverview),
      body: ResponsiveBuilder(
        builder: (context, size) => SingleChildScrollView(
          padding: pageScrollPadding(context, size),
          child: ContentWidth(
            child: size.isAtLeast(WindowSize.expanded)
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _ProfileCard(user: user)),
                      SizedBox(width: gutter(size)),
                      const Expanded(flex: 2, child: RecentUploadsSection()),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _ProfileCard(user: user),
                      SizedBox(height: gutter(size)),
                      const RecentUploadsSection(),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

class _ProfileCard extends ConsumerWidget {
  const _ProfileCard({required this.user});

  final User? user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final formatters = ref.watch(appFormattersProvider);
    final text = Theme.of(context).textTheme;
    final user = this.user;
    if (user == null) return const SizedBox.shrink();
    final lastLogin = user.lastLoginAt;

    return AppCard(
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: context.colors.primaryContainer,
            foregroundColor: context.colors.onPrimaryContainer,
            child: const ExcludeSemantics(child: Icon(AppIcons.user)),
          ),
          const SizedBox(width: AppSpacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text(l10n.dashboardGreeting(user.displayName), style: text.titleLarge)),
                const SizedBox(height: AppSpacing.xxs),
                Text(l10n.dashboardRole(user.role.label(l10n)), style: text.bodyMedium),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  lastLogin == null
                      ? l10n.dashboardFirstSignIn
                      : l10n.dashboardLastSignIn(formatters.dateTime(lastLogin)),
                  style: text.bodySmall?.copyWith(color: context.semanticColors.mutedText),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
