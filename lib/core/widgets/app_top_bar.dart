import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import 'language_selector.dart';

/// App bar used by every page: title as a semantic header and the language
/// selector always reachable.
class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AppTopBar({super.key, required this.title, this.actions = const [], this.showLanguageSelector = true});

  final String title;
  final List<Widget> actions;
  final bool showLanguageSelector;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title: Semantics(header: true, child: Text(title)),
      actions: [
        ...actions,
        if (showLanguageSelector) const LanguageSelector(),
        const SizedBox(width: AppSpacing.sm),
      ],
    );
  }
}
