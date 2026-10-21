import 'package:flutter/foundation.dart';

import '../../../core/network/json.dart';

/// Upload purposes defined by the API (`upload-policy.ts` on the backend branch).
enum UploadPurpose {
  projectPhoto('project_photo'),
  floorPlan('floor_plan'),
  drawing('drawing'),
  caseAttachment('case_attachment'),
  inventoryInvoice('inventory_invoice'),
  taskEvidence('task_evidence'),
  snagPhoto('snag_photo'),
  pettyCashReceipt('petty_cash_receipt'),
  unknown('unknown');

  const UploadPurpose(this.apiValue);

  final String apiValue;

  static UploadPurpose fromApi(String value) =>
      values.firstWhere((purpose) => purpose.apiValue == value, orElse: () => unknown);
}

/// Upload metadata (`UploadDto` in the API). File bytes live in S3.
@immutable
class Upload {
  const Upload({
    required this.id,
    required this.purpose,
    required this.contentType,
    required this.sizeBytes,
    required this.filename,
    required this.createdAt,
  });

  factory Upload.fromJson(JsonMap json) => Upload(
    id: json.string('id'),
    purpose: UploadPurpose.fromApi(json.string('purpose')),
    contentType: json.string('contentType'),
    sizeBytes: json.integer('size'),
    filename: json.string('filename'),
    createdAt: json.dateTime('createdAt'),
  );

  final String id;
  final UploadPurpose purpose;
  final String contentType;
  final int sizeBytes;
  final String filename;
  final DateTime createdAt;

  bool get isImage => contentType.startsWith('image/');
}
