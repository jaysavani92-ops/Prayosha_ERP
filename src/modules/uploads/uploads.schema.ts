import { z } from 'zod';
import { objectIdParam, paginationQuery } from '../../common/http/schemas.js';
import { ALLOWED_CONTENT_TYPES, UPLOAD_POLICY, UPLOAD_PURPOSES, UPLOAD_STATUSES } from './upload-policy.js';

const MAX_DECLARED_BYTES = Math.max(...Object.values(UPLOAD_POLICY).map((policy) => policy.maxBytes));

export const createUploadBody = z
  .object({
    purpose: z.enum(UPLOAD_PURPOSES),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
    size: z.number().int().min(1).max(MAX_DECLARED_BYTES).describe('Exact file size in bytes'),
    filename: z.string().min(1).max(255).describe('Original filename; used for display only'),
    checksumSha256: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/, 'Base64-encoded SHA-256 digest')
      .optional()
      .describe('Optional. When given, S3 rejects the upload unless the bytes match.'),
  })
  .strict();

export const listUploadsQuery = paginationQuery
  .extend({
    status: z.enum(UPLOAD_STATUSES).default('available'),
    ownerId: objectIdParam.optional().describe('Administrators only; defaults to your own uploads'),
  })
  .strict();

export const uploadDto = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    purpose: z.enum(UPLOAD_PURPOSES),
    status: z.enum(UPLOAD_STATUSES),
    contentType: z.enum(ALLOWED_CONTENT_TYPES),
    size: z.number().int(),
    filename: z.string(),
    rejectionReason: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .meta({ id: 'Upload' });

export const presignedUpload = z.object({
  url: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()).describe('Send exactly these headers with the PUT'),
  expiresAt: z.string(),
});

export const createUploadResponse = z.object({
  data: z.object({ upload: uploadDto, uploadUrl: presignedUpload }),
});

export const downloadUrlResponse = z.object({
  data: z.object({ url: z.string(), expiresAt: z.string() }),
});

export type CreateUploadInput = z.infer<typeof createUploadBody>;
export type ListUploadsQuery = z.infer<typeof listUploadsQuery>;
