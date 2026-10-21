import type { DefaultJobOptions } from 'bullmq';
import { z } from 'zod';

/**
 * Queue and job contracts shared by producers (API) and consumers (worker).
 * Payloads are validated on both sides; they carry ids only, never documents,
 * so a job always acts on the current database state.
 */
export const QUEUES = { uploads: 'uploads' } as const;

export const JOBS = {
  deleteUploadObject: 'delete-upload-object',
  cleanupUploads: 'cleanup-uploads',
} as const;

export const deleteUploadObjectPayload = z.object({ uploadId: z.string().regex(/^[a-f0-9]{24}$/) }).strict();
export type DeleteUploadObjectPayload = z.infer<typeof deleteUploadObjectPayload>;

export const cleanupUploadsPayload = z.object({}).strict();

/**
 * Retry policy: 8 attempts with exponential backoff starting at 5s (~21 min of
 * retrying in total). Failed jobs are retained for 14 days for inspection and
 * manual retry; completed jobs are trimmed quickly to bound Redis memory.
 * Every processor is idempotent, so a retry or duplicate delivery is safe.
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 8,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 5000 },
  removeOnFail: { age: 14 * 24 * 3600 },
};

/** BullMQ custom job ids must not contain ':'. */
export function uploadDeletionJobId(uploadId: string, suffix?: string): string {
  return suffix ? `upload-delete-${uploadId}-${suffix}` : `upload-delete-${uploadId}`;
}
