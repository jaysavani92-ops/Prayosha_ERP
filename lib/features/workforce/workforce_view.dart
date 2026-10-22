import 'package:flutter/material.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/widgets/app_states.dart';

/// The daily labour and equipment diary. No workforce API exists on the backend yet, so the
/// destination says so instead of showing invented data.
class WorkforceView extends StatelessWidget {
  const WorkforceView({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppPlaceholderPage(
      title: l10n.navWorkforce,
      icon: AppIcons.workforce,
      heading: l10n.workforcePendingTitle,
      message: l10n.workforcePendingMessage,
    );
  }
}
