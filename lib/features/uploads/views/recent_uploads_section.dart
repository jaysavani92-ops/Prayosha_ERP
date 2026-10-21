import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_formatters.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/l10n/error_messages.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_states.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../models/upload.dart';
import '../viewmodels/recent_uploads_view_model.dart';

class RecentUploadsSection extends ConsumerWidget {
  const RecentUploadsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final uploads = ref.watch(recentUploadsViewModelProvider);
    final formatters = ref.watch(appFormattersProvider);

    return AppCard(
      title: l10n.recentUploadsTitle,
      child: switch (uploads) {
        AsyncData(:final value) when value.isEmpty => AppEmptyState(
          title: l10n.recentUploadsEmptyTitle,
          message: l10n.recentUploadsEmptyMessage,
        ),
        AsyncData(:final value) => Column(
          children: [
            for (final upload in value)
              ListTile(
                key: ValueKey('upload-${upload.id}'),
                leading: Icon(upload.isImage ? AppIcons.image : AppIcons.document),
                title: Text(upload.filename, overflow: TextOverflow.ellipsis),
                subtitle: Text(
                  '${upload.purpose.label(l10n)} · '
                  '${l10n.uploadDetails(_fileSize(l10n, formatters, upload.sizeBytes), formatters.date(upload.createdAt))}',
                ),
              ),
          ],
        ),
        AsyncError(:final error) => AppErrorView(
          message: '${l10n.recentUploadsLoadError} ${localizedFailure(l10n, error)}',
          retryLabel: l10n.commonRetry,
          onRetry: () => ref.read(recentUploadsViewModelProvider.notifier).refresh(),
        ),
        _ => AppLoadingIndicator(label: l10n.commonLoading),
      },
    );
  }

  static String _fileSize(AppLocalizations l10n, AppFormatters formatters, int bytes) {
    const kb = 1024;
    const mb = 1024 * 1024;
    return bytes >= mb
        ? l10n.fileSizeMb(formatters.number(bytes / mb, maxDecimals: 1))
        : l10n.fileSizeKb(formatters.number((bytes / kb).ceil(), maxDecimals: 0));
  }
}

extension UploadPurposeLabel on UploadPurpose {
  String label(AppLocalizations l10n) => switch (this) {
    UploadPurpose.projectPhoto => l10n.purposeProjectPhoto,
    UploadPurpose.floorPlan => l10n.purposeFloorPlan,
    UploadPurpose.drawing => l10n.purposeDrawing,
    UploadPurpose.caseAttachment => l10n.purposeCaseAttachment,
    UploadPurpose.inventoryInvoice => l10n.purposeInventoryInvoice,
    UploadPurpose.taskEvidence => l10n.purposeTaskEvidence,
    UploadPurpose.snagPhoto => l10n.purposeSnagPhoto,
    UploadPurpose.pettyCashReceipt => l10n.purposePettyCashReceipt,
    UploadPurpose.unknown => '—',
  };
}
