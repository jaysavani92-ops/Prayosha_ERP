import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from '../observability/logger.js';
import { DEFAULT_JOB_OPTIONS, JOBS, QUEUES, uploadDeletionJobId } from './queues/definitions.js';

export interface QueueCounts {
  queue: string;
  counts: Record<string, number>;
}

/**
 * Producer port. The API enqueues through this interface so tests can record
 * dispatches and so a Redis outage surfaces as a typed error the caller can
 * handle (the reconciliation sweep re-dispatches anything that was missed).
 */
export interface JobDispatcher {
  dispatchUploadDeletion(
    uploadId: string,
    options?: { delayMs?: number; jobIdSuffix?: string },
  ): Promise<void>;
  getQueueCounts(): Promise<QueueCounts[]>;
  close(): Promise<void>;
}

export class BullMqDispatcher implements JobDispatcher {
  private readonly uploads: Queue;

  constructor(connection: Redis, prefix: string, logger?: Logger) {
    this.uploads = new Queue(QUEUES.uploads, {
      connection,
      prefix: `${prefix}bull`,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
      skipWaitingForReady: true,
    });
    // Without a listener BullMQ prints connection errors to stderr, outside the structured log.
    this.uploads.on('error', (error) =>
      logger?.warn({ err: error, queue: QUEUES.uploads }, 'Queue connection error'),
    );
  }

  get uploadsQueue(): Queue {
    return this.uploads;
  }

  async dispatchUploadDeletion(uploadId: string, options: { delayMs?: number; jobIdSuffix?: string } = {}) {
    await this.uploads.add(
      JOBS.deleteUploadObject,
      { uploadId },
      {
        // Same id => BullMQ ignores the duplicate while the first job exists.
        jobId: uploadDeletionJobId(uploadId, options.jobIdSuffix),
        ...(options.delayMs && options.delayMs > 0 ? { delay: options.delayMs } : {}),
      },
    );
  }

  async getQueueCounts(): Promise<QueueCounts[]> {
    const counts = await this.uploads.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    return [{ queue: QUEUES.uploads, counts }];
  }

  async close(): Promise<void> {
    await this.uploads.close();
  }
}
