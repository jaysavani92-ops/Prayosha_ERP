import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/l10n/app_language.dart';
import '../../../core/widgets/app_dialog.dart';
import '../viewmodels/auth_controller.dart';

/// Asks for confirmation, signs out, then confirms with a snackbar. The
/// router returns to sign-in on its own once the session is gone.
Future<void> confirmSignOut(BuildContext context, WidgetRef ref) async {
  final l10n = context.l10n;
  final messenger = ScaffoldMessenger.of(context);
  final confirmed = await showAppConfirmDialog(
    context,
    title: l10n.signOutConfirmTitle,
    message: l10n.signOutConfirmMessage,
    confirmLabel: l10n.signOut,
    cancelLabel: l10n.commonCancel,
    destructive: true,
  );
  if (!confirmed) return;
  await ref.read(authControllerProvider.notifier).signOut();
  showAppSnackBarOn(messenger, l10n.signedOutMessage);
}
