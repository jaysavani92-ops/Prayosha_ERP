import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_dialog.dart';
import '../models/project.dart';
import '../viewmodels/project_directory_view_model.dart';
import 'whatsapp_preview.dart';
import 'zone_inspector.dart';

enum _ProjectAction { inspect, share, setActive, archive, restore }

/// The ⋮ menu on a project card or table row. Offers only what the signed-in
/// role may do; Archive asks for confirmation first.
class ProjectActionsMenu extends ConsumerWidget {
  const ProjectActionsMenu({super.key, required this.project, this.overPanel = false});

  final Project project;

  /// Drawn as a white circle, for use over a dark picture panel.
  final bool overPanel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final permissions = ref.watch(projectPermissionsProvider);
    PopupMenuItem<_ProjectAction> item(_ProjectAction action, IconData icon, String label, {Color? color}) =>
        PopupMenuItem(
          key: ValueKey('project-action-${action.name}'),
          value: action,
          child: Row(
            children: [
              Icon(icon, color: color),
              const SizedBox(width: AppSpacing.md),
              Flexible(
                child: Text(label, style: color == null ? null : TextStyle(color: color)),
              ),
            ],
          ),
        );

    return PopupMenuButton<_ProjectAction>(
      key: ValueKey('project-actions-${project.id}'),
      tooltip: l10n.projectActions(project.name),
      icon: const Icon(AppIcons.moreActions),
      style: overPanel
          ? IconButton.styleFrom(
              backgroundColor: context.colors.surface,
              foregroundColor: context.colors.onSurface,
              shadowColor: context.colors.shadow,
              elevation: 2,
            )
          : null,
      onSelected: (action) => switch (action) {
        _ProjectAction.inspect => showZoneInspector(context, project),
        _ProjectAction.share => showWhatsAppPreview(context, project),
        _ProjectAction.setActive => setActiveWorkspace(context, ref, project),
        _ProjectAction.archive => confirmArchive(context, ref, project),
        _ProjectAction.restore => restoreProject(context, ref, project),
      },
      itemBuilder: (context) => [
        item(_ProjectAction.inspect, AppIcons.inspect, l10n.actionInspect),
        if (permissions.canShareProgress) item(_ProjectAction.share, AppIcons.share, l10n.actionShare),
        if (project.isActive) item(_ProjectAction.setActive, AppIcons.workspaceActive, l10n.actionSetActive),
        if (permissions.canManage && project.archived)
          item(_ProjectAction.restore, AppIcons.restore, l10n.actionRestore),
        if (permissions.canManage && !project.archived)
          item(_ProjectAction.archive, AppIcons.archive, l10n.actionArchive, color: context.colors.error),
      ],
    );
  }
}

void setActiveWorkspace(BuildContext context, WidgetRef ref, Project project) {
  ref.read(projectQueryProvider.notifier).setActive(project.id);
  showAppSnackBar(context, context.l10n.workspaceSet(project.name));
}

/// Archives [project] in this session after confirmation (there is no
/// projects API to save to yet).
Future<void> confirmArchive(BuildContext context, WidgetRef ref, Project project) async {
  final l10n = context.l10n;
  final messenger = ScaffoldMessenger.of(context);
  final confirmed = await showAppConfirmDialog(
    context,
    title: l10n.archiveTitle(project.name),
    message: l10n.archiveMessage,
    confirmLabel: l10n.archiveConfirm,
    cancelLabel: l10n.commonCancel,
    destructive: true,
  );
  if (!confirmed) return;
  ref.read(projectDirectoryViewModelProvider.notifier).archive(project);
  showAppSnackBarOn(messenger, l10n.archived(project.name));
}

/// Brings an archived [project] back into the directory.
void restoreProject(BuildContext context, WidgetRef ref, Project project) {
  ref.read(projectDirectoryViewModelProvider.notifier).restore(project);
  showAppSnackBar(context, context.l10n.restored(project.name));
}
