import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_formatters.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_adaptive_panel.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_dialog.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../models/project.dart';
import 'project_labels.dart';

/// Opens the WhatsApp progress preview for [project].
Future<void> showWhatsAppPreview(BuildContext context, Project project) => showAppAdaptivePanel<void>(
  context,
  maxWidth: AppSpacing.formMaxWidth + AppSpacing.xxxl,
  builder: (context, isSheet) => WhatsAppPreview(project: project, showClose: !isSheet),
);

/// The progress message for the client's WhatsApp group, in the UI language.
String progressMessage(AppLocalizations l10n, AppFormatters formatters, Project project) {
  final highlights = project.highlights.isEmpty
      ? l10n.whatsappNoHighlights
      : project.highlights.map((h) => '• $h').join('\n');
  return l10n.whatsappMessage(
    project.name,
    project.code,
    formatters.percent(project.progress),
    project.status == ProjectStatus.inProgress ? project.health.label(l10n) : project.status.label(l10n),
    formatters.date(project.handoverDate),
    highlights,
  );
}

/// What the update looks like in the group chat, with a copy action.
/// Nothing is sent: WhatsApp dispatch is not connected yet.
class WhatsAppPreview extends ConsumerWidget {
  const WhatsAppPreview({super.key, required this.project, this.showClose = false});

  final Project project;
  final bool showClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final text = Theme.of(context).textTheme;
    final message = progressMessage(l10n, ref.watch(appFormattersProvider), project);

    Future<void> copy() async {
      final messenger = ScaffoldMessenger.of(context);
      await Clipboard.setData(ClipboardData(text: message));
      if (context.mounted) Navigator.of(context).pop();
      showAppSnackBarOn(messenger, l10n.whatsappCopied);
    }

    return SingleChildScrollView(
      key: const ValueKey('whatsapp-preview'),
      padding: EdgeInsets.fromLTRB(AppSpacing.xl, showClose ? AppSpacing.xl : 0, AppSpacing.xl, AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(l10n.whatsappTitle, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                ),
              ),
              if (showClose)
                IconButton(
                  tooltip: l10n.commonClose,
                  icon: const Icon(AppIcons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          // The chat: group header, then the outgoing bubble.
          DecoratedBox(
            decoration: BoxDecoration(color: colors.surfaceContainer, borderRadius: AppRadius.lgAll),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: AppSizes.iconMd / 2 + AppSpacing.xs,
                        backgroundColor: context.semanticColors.brandNavy,
                        child: Icon(AppIcons.brand, size: AppSizes.iconXs, color: colors.secondary),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          l10n.whatsappGroup(project.code),
                          style: text.labelLarge,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Color.alphaBlend(context.semanticColors.success.withValues(alpha: 0.16), colors.surface),
                        borderRadius: const BorderRadiusDirectional.only(
                          topStart: Radius.circular(AppRadius.lg),
                          bottomStart: Radius.circular(AppRadius.lg),
                          bottomEnd: Radius.circular(AppRadius.lg),
                          topEnd: Radius.circular(AppRadius.sm),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: SelectableText.rich(
                          _whatsAppMarkup(message, text.bodyMedium!),
                          key: const ValueKey('whatsapp-message'),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            key: const ValueKey('whatsapp-copy'),
            label: l10n.whatsappCopy,
            icon: AppIcons.copy,
            onPressed: copy,
            expand: true,
          ),
        ],
      ),
    );
  }
}

/// Renders WhatsApp's `*bold*` markup the way the chat would.
TextSpan _whatsAppMarkup(String message, TextStyle style) {
  final parts = message.split('*');
  return TextSpan(
    style: style,
    children: [
      for (var i = 0; i < parts.length; i++)
        TextSpan(
          text: parts[i],
          style: i.isOdd ? const TextStyle(fontWeight: FontWeight.w700) : null,
        ),
    ],
  );
}
