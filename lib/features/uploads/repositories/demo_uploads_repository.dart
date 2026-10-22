import '../models/upload.dart';
import 'uploads_repository.dart';

/// Recent uploads for sample-data mode (`AppConfig.demoMode`): a fixed,
/// realistic list, dated relative to today. No network.
class DemoUploadsRepository implements UploadsRepository {
  @override
  Future<List<Upload>> recentUploads() async {
    final now = DateTime.now();
    Upload upload(int i, UploadPurpose purpose, String contentType, int kb, String filename, Duration ago) => Upload(
      id: 'demo-upload-$i',
      purpose: purpose,
      contentType: contentType,
      sizeBytes: kb * 1024,
      filename: filename,
      createdAt: now.subtract(ago),
    );
    return [
      upload(
        1,
        UploadPurpose.snagPhoto,
        'image/jpeg',
        2150,
        'block-c_floor-12_wall-crack.jpg',
        const Duration(hours: 2),
      ),
      upload(
        2,
        UploadPurpose.taskEvidence,
        'image/jpeg',
        1840,
        'slab-casting_tower-a_level-9.jpg',
        const Duration(hours: 6),
      ),
      upload(
        3,
        UploadPurpose.pettyCashReceipt,
        'application/pdf',
        312,
        'petty-cash_diesel_receipt.pdf',
        const Duration(days: 1),
      ),
      upload(
        4,
        UploadPurpose.drawing,
        'application/pdf',
        4820,
        'structural_drawing_rev-c.pdf',
        const Duration(days: 2),
      ),
      upload(
        5,
        UploadPurpose.inventoryInvoice,
        'application/pdf',
        596,
        'cement_invoice_oct.pdf',
        const Duration(days: 3),
      ),
    ];
  }
}
