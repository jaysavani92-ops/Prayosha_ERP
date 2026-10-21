import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// Surface container with the theme's card style and standard padding.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(AppSpacing.lg), this.title});

  final Widget child;
  final EdgeInsetsGeometry padding;

  /// Optional heading, exposed to assistive technology as a header.
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: padding,
        child: title == null
            ? child
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(header: true, child: Text(title!, style: Theme.of(context).textTheme.titleMedium)),
                  const SizedBox(height: AppSpacing.md),
                  child,
                ],
              ),
      ),
    );
  }
}
