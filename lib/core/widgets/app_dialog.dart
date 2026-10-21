import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

/// Confirmation dialog. Returns true when confirmed. All labels are passed in
/// already localized. Focus starts on the safe (cancel) action.
Future<bool> showAppConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  required String cancelLabel,
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) {
      final colors = Theme.of(context).colorScheme;
      return AlertDialog(
        title: Text(title),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: AppSpacing.formMaxWidth),
          child: Text(message),
        ),
        actions: [
          TextButton(autofocus: true, onPressed: () => Navigator.of(context).pop(false), child: Text(cancelLabel)),
          FilledButton(
            style: destructive
                ? FilledButton.styleFrom(backgroundColor: colors.error, foregroundColor: colors.onError)
                : null,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      );
    },
  );
  return result ?? false;
}

/// Informational dialog with a single close action.
Future<void> showAppInfoDialog(
  BuildContext context, {
  required String title,
  required String message,
  required String closeLabel,
}) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: AppSpacing.formMaxWidth),
        child: Text(message),
      ),
      actions: [FilledButton(autofocus: true, onPressed: () => Navigator.of(context).pop(), child: Text(closeLabel))],
    ),
  );
}

/// Transient notification (snackbar) with consistent styling.
void showAppSnackBar(BuildContext context, String message) => showAppSnackBarOn(ScaffoldMessenger.of(context), message);

/// Variant for use after an `await` that may unmount the calling widget
/// (capture the messenger before awaiting).
void showAppSnackBarOn(ScaffoldMessengerState messenger, String message) {
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
