import type { ObjectId } from 'mongodb';
import type { AllowedContentType, UploadPurpose, UploadStatus } from './upload-policy.js';

/** Stored shape of an `uploads` document. The binary lives in S3, never here. */
export interface UploadDocument {
  _id: ObjectId;
  ownerId: ObjectId;
  purpose: UploadPurpose;
  status: UploadStatus;
  /** Server-generated; clients can never choose or alter it. */
  objectKey: string;
  declaredContentType: AllowedContentType;
  declaredSize: number;
  checksumSha256: string | null;
  /** Sanitised client filename, for display and Content-Disposition only. */
  originalFilename: string;
  size: number | null;
  etag: string | null;
  rejectionReason: string | null;
  uploadUrlExpiresAt: Date;
  completedAt: Date | null;
  deleteRequestedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadDto {
  id: string;
  ownerId: string;
  purpose: UploadPurpose;
  status: UploadStatus;
  contentType: AllowedContentType;
  size: number;
  filename: string;
  rejectionReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function toUploadDto(upload: UploadDocument): UploadDto {
  return {
    id: upload._id.toHexString(),
    ownerId: upload.ownerId.toHexString(),
    purpose: upload.purpose,
    status: upload.status,
    contentType: upload.declaredContentType,
    size: upload.size ?? upload.declaredSize,
    filename: upload.originalFilename,
    rejectionReason: upload.rejectionReason,
    createdAt: upload.createdAt.toISOString(),
    completedAt: upload.completedAt?.toISOString() ?? null,
  };
}
