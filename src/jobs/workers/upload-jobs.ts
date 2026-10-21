import { ObjectId } from 'mongodb';
import type { AppConfig } from '../../config/env.js';
import { addSeconds, type Clock } from '../../common/utils/clock.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import type { UploadsRepository } from '../../modules/uploads/uploads.repository.js';
import type { Logger } from '../../observability/logger.js';
import type { JobDispatcher } from '../dispatcher.js';
import type { DeleteUploadObjectPayload } from '../queues/definitions.js';

const SWEEP_BATCH = 200;
/** A deletion still unfinished after this long is re-dispatched by the sweep. */
const STUCK_DELETION_SECONDS = 10 * 60;

export class RetryLaterError extends Error {}

/**
 * Upload job processors. Every processor is idempotent and re-reads the
 * current database state, so duplicate delivery, retries after a crash and
 * re-dispatch by the sweep are all safe.
 */
export class UploadJobs {
  constructor(
    private readonly deps: {
      config: AppConfig['s3'];
      uploads: UploadsRepository;
      storage: ObjectStorage;
      dispatcher: JobDispatcher;
      clock: Clock;
      logger: Logger;
    },
  ) {}

  async deleteObject(payload: DeleteUploadObjectPayload): Promise<'deleted' | 'skipped'> {
    const { uploads, storage, clock, logger } = this.deps;
    const id = new ObjectId(payload.uploadId);
    const upload = await uploads.findById(id);
    if (!upload || upload.status !== 'deleting') {
      // Already finished (duplicate delivery) or never meant to be deleted:
      // never remove an object whose record is not in `deleting`.
      if (upload && upload.status !== 'deleted' && upload.status !== 'expired') {
        logger.warn(
          { uploadId: payload.uploadId, status: upload.status },
          'Skipping deletion of non-deleting upload',
        );
      }
      return 'skipped';
    }
    if (upload.uploadUrlExpiresAt > clock.now()) {
      // The presigned PUT is still usable; deleting now could race a late upload.
      throw new RetryLaterError('Upload URL still valid; retrying after expiry');
    }
    await storage.deleteObject(upload.objectKey);
    const now = clock.now();
    await uploads.transition(id, ['deleting'], { status: 'deleted', deletedAt: now, updatedAt: now });
    return 'deleted';
  }

  /**
   * Periodic reconciliation (job scheduler, every 15 minutes by default):
   *  1. pending uploads never completed: claim (pending -> deleting), remove
   *     any stray object, then mark expired;
   *  2. deletions stuck in `deleting` (enqueue failed, job exhausted retries):
   *     re-dispatch, so no deletion is lost silently.
   */
  async cleanup(): Promise<{ expired: number; redispatched: number }> {
    const { uploads, storage, dispatcher, clock, logger, config } = this.deps;
    const now = clock.now();

    let expired = 0;
    const abandoned = await uploads.findAbandonedPending(
      addSeconds(now, -config.pendingGraceSeconds),
      SWEEP_BATCH,
    );
    for (const upload of abandoned) {
      // Claim first so a concurrent /complete cannot succeed after the delete.
      const claimed = await uploads.transition(upload._id, ['pending'], {
        status: 'deleting',
        rejectionReason: 'not_completed',
        deleteRequestedAt: now,
        updatedAt: now,
      });
      if (!claimed) continue;
      try {
        await storage.deleteObject(upload.objectKey);
        await uploads.transition(upload._id, ['deleting'], {
          status: 'expired',
          deletedAt: now,
          updatedAt: now,
        });
        expired++;
      } catch (error) {
        // Left in `deleting`; step 2 of a later sweep retries it.
        logger.warn({ err: error, uploadId: upload._id.toHexString() }, 'Failed to remove abandoned upload');
      }
    }

    let redispatched = 0;
    const stuck = await uploads.findStuckDeleting(addSeconds(now, -STUCK_DELETION_SECONDS), SWEEP_BATCH);
    for (const { _id } of stuck) {
      try {
        await dispatcher.dispatchUploadDeletion(_id.toHexString(), { jobIdSuffix: `sweep-${now.getTime()}` });
        redispatched++;
      } catch (error) {
        logger.error({ err: error, uploadId: _id.toHexString() }, 'Failed to re-dispatch stuck deletion');
      }
    }

    if (expired > 0 || redispatched > 0)
      logger.info({ expired, redispatched }, 'Upload cleanup sweep finished');
    return { expired, redispatched };
  }
}
