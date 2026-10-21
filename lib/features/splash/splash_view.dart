import 'package:flutter/material.dart';

import '../../core/l10n/app_language.dart';
import '../../core/widgets/app_states.dart';

/// Shown while the session is being restored (startup, browser refresh).
class SplashView extends StatelessWidget {
  const SplashView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(child: AppLoadingIndicator(label: context.l10n.splashMessage, showLabel: true)),
    );
  }
}
