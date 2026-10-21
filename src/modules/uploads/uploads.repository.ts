import type { Collection, Db, Filter, ObjectId } from 'mongodb';
import {
  NEWEST_FIRST,
  afterCursorFilter,
  toPage,
  type CursorPosition,
  type Page,
} from '../../common/utils/pagination.js';
import { Collections } from '../../database/collections.js';
import type { UploadStatus } from './upload-policy.js';
import type { UploadDocument } from './uploads.types.js';

export class UploadsRepository {
  private readonly collection: Collection<UploadDocument>;

  constructor(
    db: Db,
    private readonly queryTimeoutMs: number,
  ) {
    this.collection = db.collection<UploadDocument>(Collections.uploads);
  }

  async insert(upload: UploadDocument): Promise<void> {
    await this.collection.insertOne(upload);
  }

  findById(id: ObjectId): Promise<UploadDocument | null> {
    return this.collection.findOne({ _id: id }, { maxTimeMS: this.queryTimeoutMs });
  }

  /** Served by index owner_status_recent (or status_recent when ownerId is omitted). */
  async list(
    filter: { ownerId?: ObjectId | undefined; status: UploadStatus },
    limit: number,
    after: CursorPosition | undefined,
  ): Promise<Page<UploadDocument>> {
    const query: Filter<UploadDocument> = {
      status: filter.status,
      ...afterCursorFilter<UploadDocument>(after),
    };
    if (filter.ownerId) query.ownerId = filter.ownerId;
    const rows = await this.collection
      .find(query, { maxTimeMS: this.queryTimeoutMs })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .toArray();
    return toPage(rows, limit);
  }

  /**
   * Conditional state transition: succeeds only if the upload is still in one
   * of `from`. This is the concurrency control for the whole upload lifecycle;
   * two racing requests cannot both move the same upload.
   */
  transition(
    id: ObjectId,
    from: readonly UploadStatus[],
    set: Partial<UploadDocument> & { status: UploadStatus; updatedAt: Date },
  ): Promise<UploadDocument | null> {
    return this.collection.findOneAndUpdate(
      { _id: id, status: { $in: [...from] } },
      { $set: set },
      { returnDocument: 'after', maxTimeMS: this.queryTimeoutMs },
    );
  }

  /** Pending uploads whose URL expired before `cutoff` (index pending_by_expiry). */
  findAbandonedPending(cutoff: Date, limit: number): Promise<UploadDocument[]> {
    return this.collection
      .find({ status: 'pending', uploadUrlExpiresAt: { $lt: cutoff } })
      .sort({ uploadUrlExpiresAt: 1 })
      .limit(limit)
      .toArray();
  }

  /** Deletions requested before `cutoff` and still unfinished (index deleting_by_request_time). */
  findStuckDeleting(cutoff: Date, limit: number): Promise<Pick<UploadDocument, '_id'>[]> {
    return this.collection
      .find<Pick<UploadDocument, '_id'>>(
        { status: 'deleting', deleteRequestedAt: { $lt: cutoff } },
        { projection: { _id: 1 } },
      )
      .sort({ deleteRequestedAt: 1 })
      .limit(limit)
      .toArray();
  }
}
