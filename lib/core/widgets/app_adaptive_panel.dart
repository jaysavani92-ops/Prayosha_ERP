import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import 'responsive.dart';

/// Opens a panel the way each window size expects it: a full-width bottom
/// sheet on compact windows (phones), a centred dialog capped at [maxWidth]
/// elsewhere. [builder] learns which one it is in (`isSheet`), e.g. to show
/// a close button only in the dialog. Content must scroll: both are capped
/// at most of the window's height.
///
/// Both open on the root navigator, above the app shell, so a sheet opened
/// from inside a page is never covered by the phone's navigation dock.
Future<T?> showAppAdaptivePanel<T>(
  BuildContext context, {
  required Widget Function(BuildContext context, bool isSheet) builder,
  double maxWidth = AppSpacing.narrowContentMaxWidth,
}) {
  if (!context.windowSize.isAtLeast(WindowSize.medium)) {
    return showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      useSafeArea: true,
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.9),
      builder: (sheetContext) => builder(sheetContext, true),
    );
  }
  return showDialog<T>(
    context: context,
    useRootNavigator: true,
    builder: (dialogContext) => Dialog(
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: MediaQuery.sizeOf(dialogContext).height * 0.85),
        child: builder(dialogContext, false),
      ),
    ),
  );
}
