import 'package:flutter/material.dart';

import '../../core/assets/app_assets.dart';
import '../../core/l10n/app_language.dart';
import '../../core/widgets/app_states.dart';

/// Liaisoning approvals and BOQ tracking. No pre-development API exists on the backend yet, so the
/// destination says so instead of showing invented data.
class PreDevelopmentView extends StatelessWidget {
  const PreDevelopmentView({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppPlaceholderPage(
      title: l10n.navPreDevelopment,
      icon: AppIcons.preDevelopment,
      heading: l10n.preDevelopmentPendingTitle,
      message: l10n.preDevelopmentPendingMessage,
    );
  }
}
