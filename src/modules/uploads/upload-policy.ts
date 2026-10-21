/**
 * What may be uploaded, per purpose. Purposes mirror the folders the current
 * frontend writes to (project-photos, drawing-vault, possession-snags, ...).
 * The server owns this policy; clients only declare which purpose they need.
 */
export const UPLOAD_PURPOSES = [
  'project_photo',
  'floor_plan',
  'drawing',
  'case_attachment',
  'inventory_invoice',
  'task_evidence',
  'snag_photo',
  'petty_cash_receipt',
] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/**
 * pending   - record created, presigned URL issued, waiting for the client
 * available - object verified (size, type, checksum, file signature)
 * deleting  - deletion requested (or verification failed); object removal queued
 * deleted   - object removed from S3; record kept for audit
 * expired   - client never completed; any stray object was removed
 */
export const UPLOAD_STATUSES = ['pending', 'available', 'deleting', 'deleted', 'expired'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/** Extension is derived from the verified content type, never from the client filename. */
export const EXTENSION_BY_TYPE: Record<AllowedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const MB = 1024 * 1024;
const IMAGES: AllowedContentType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const IMAGES_AND_PDF: AllowedContentType[] = [...IMAGES, 'application/pdf'];

export interface PurposePolicy {
  contentTypes: readonly AllowedContentType[];
  maxBytes: number;
}

export const UPLOAD_POLICY: Record<UploadPurpose, PurposePolicy> = {
  project_photo: { contentTypes: IMAGES, maxBytes: 15 * MB },
  floor_plan: { contentTypes: IMAGES_AND_PDF, maxBytes: 25 * MB },
  drawing: { contentTypes: IMAGES_AND_PDF, maxBytes: 25 * MB },
  case_attachment: { contentTypes: IMAGES_AND_PDF, maxBytes: 15 * MB },
  inventory_invoice: { contentTypes: IMAGES_AND_PDF, maxBytes: 10 * MB },
  task_evidence: { contentTypes: IMAGES, maxBytes: 15 * MB },
  snag_photo: { contentTypes: IMAGES, maxBytes: 15 * MB },
  petty_cash_receipt: { contentTypes: IMAGES_AND_PDF, maxBytes: 10 * MB },
};

export function isImage(contentType: string): boolean {
  return contentType.startsWith('image/');
}
