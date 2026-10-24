import 'package:flutter/material.dart';

import '../assets/app_assets.dart';
import '../theme/app_colors.dart';
import '../theme/app_tokens.dart';
import 'app_button.dart';
import 'app_top_bar.dart';

/// Loading indicator announced to screen readers.
class AppLoadingIndicator extends StatelessWidget {
  const AppLoadingIndicator({super.key, required this.label, this.showLabel = false});

  final String label;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            if (showLabel) ...[
              const SizedBox(height: AppSpacing.lg),
              ExcludeSemantics(
                child: Text(label, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Shown when a request succeeded but returned nothing.
class AppEmptyState extends StatelessWidget {
  const AppEmptyState({super.key, required this.title, required this.message, this.icon = AppIcons.empty, this.action});

  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return _StateLayout(
      icon: icon,
      iconColor: context.colors.onSurfaceVariant,
      children: [
        Text(title, style: text.titleMedium, textAlign: TextAlign.center),
        const SizedBox(height: AppSpacing.xs),
        Text(
          message,
          style: text.bodyMedium?.copyWith(color: context.semanticColors.mutedText),
          textAlign: TextAlign.center,
        ),
        if (action != null) ...[const SizedBox(height: AppSpacing.lg), action!],
      ],
    );
  }
}

/// Shown when a request failed; offers a retry when possible.
class AppErrorView extends StatelessWidget {
  const AppErrorView({super.key, required this.message, this.onRetry, this.retryLabel});

  final String message;
  final VoidCallback? onRetry;
  final String? retryLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: _StateLayout(
        icon: AppIcons.error,
        iconColor: context.colors.error,
        children: [
          Text(message, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
          if (onRetry != null && retryLabel != null) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton(label: retryLabel!, onPressed: onRetry, variant: AppButtonVariant.secondary),
          ],
        ],
      ),
    );
  }
}

class _StateLayout extends StatelessWidget {
  const _StateLayout({required this.icon, required this.iconColor, required this.children});

  final IconData icon;
  final Color iconColor;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ExcludeSemantics(
              child: Icon(icon, size: AppSizes.iconXl, color: iconColor),
            ),
            const SizedBox(height: AppSpacing.md),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// Inline error banner (e.g. a failed form submission), announced politely.
class AppInlineError extends StatelessWidget {
  const AppInlineError({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(color: colors.errorContainer, borderRadius: AppRadius.mdAll),
        child: Row(
          children: [
            ExcludeSemantics(child: Icon(AppIcons.error, color: colors.onErrorContainer)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                message,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: colors.onErrorContainer),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A whole page for a destination whose feature is not available yet: the
/// usual top bar and an empty state, scrollable so it never overflows on
/// short windows or at large text sizes.
class AppPlaceholderPage extends StatelessWidget {
  const AppPlaceholderPage({
    super.key,
    required this.title,
    required this.icon,
    required this.heading,
    required this.message,
  });

  final String title;
  final IconData icon;
  final String heading;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppTopBar(title: title),
      body: LayoutBuilder(
        builder: (context, constraints) {
          // Clear of any bar drawn over the page (the phone dock), and centred
          // in the space that remains visible.
          final inset = MediaQuery.paddingOf(context).bottom;
          return SingleChildScrollView(
            padding: EdgeInsets.only(bottom: inset),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: (constraints.maxHeight - inset).clamp(0, double.infinity)),
              // Centred in the page while it fits; scrolls when it does not.
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: AppSpacing.narrowContentMaxWidth),
                  child: AppEmptyState(icon: icon, title: heading, message: message),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
