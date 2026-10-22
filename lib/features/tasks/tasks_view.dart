import 'package:flutter/material.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/widgets/app_states.dart';

/// Task tracking (active, pending and delayed site tasks). No tasks API exists on the backend yet, so the
/// destination says so instead of showing invented data.
class TasksView extends StatelessWidget {
  const TasksView({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppPlaceholderPage(
      title: l10n.navTasks,
      icon: AppIcons.tasks,
      heading: l10n.tasksPendingTitle,
      message: l10n.tasksPendingMessage,
    );
  }
}
