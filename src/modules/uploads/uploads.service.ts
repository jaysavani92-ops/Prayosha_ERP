import { ObjectId } from 'mongodb';
import type { AppConfig } from '../../config/env.js';
import { hasPermission } from '../../common/constants/roles.js';
import { AppError, ErrorCode, Errors } from '../../common/errors/app-error.js';
import type { Principal } from '../../common/types/principal.js';
import { addSeconds, type Clock } from '../../common/utils/clock.js';
import { decodeCursor } from '../../common/utils/pagination.js';
import type { ObjectStorage, PresignedUpload } from '../../infrastructure/storage/object-storage.js';
import type { JobDispatcher } from '../../jobs/dispatcher.js';
import type { Logger } from '../../observability/logger.js';
import { SIGNATURE_BYTES, detectContentType } from './file-signature.js';
import { EXTENSION_BY_TYPE, UPLOAD_POLICY, isImage } from './upload-policy.js';
import type { UploadsRepository } from './uploads.repository.js';
import type { CreateUploadInput, ListUploadsQuery } from './uploads.schema.js';
import { toUploadDto, type UploadDocument, type UploadDto } from './uploads.types.js';

/**
 * Upload lifecycle (client never sends file bytes through the API):
 *   1. POST /uploads            -> record (pending) + presigned PUT URL
 *   2. client PUTs bytes to S3   (S3 enforces size, type, checksum, no-overwrite)
 *   3. POST /uploads/:id/complete -> HeadObject + signature sniff -> available
 * Failed verification moves the record to `deleting` and queues object removal.
 */
export class UploadsService {
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

  async createUpload(
    actor: Principal,
    input: CreateUploadInput,
  ): Promise<{ upload: UploadDto; uploadUrl: Omit<PresignedUpload, 'expiresAt'> & { expiresAt: string } }> {
    const policy = UPLOAD_POLICY[input.purpose];
    if (!policy.contentTypes.includes(input.contentType)) {
      throw new AppError(
        415,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        `Content type not allowed for ${input.purpose}`,
        {
          details: { allowed: policy.contentTypes },
        },
      );
    }
    if (input.size > policy.maxBytes) {
      throw new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, `File exceeds the ${input.purpose} size limit`, {
        details: { maxBytes: policy.maxBytes },
      });
    }

    const now = this.deps.clock.now();
    const id = new ObjectId();
    const ttl = this.deps.config.uploadUrlTtlSeconds;
    const upload: UploadDocument = {
      _id: id,
      ownerId: actor.userId,
      purpose: input.purpose,
      status: 'pending',
      objectKey: buildObjectKey(input.purpose, id, EXTENSION_BY_TYPE[input.contentType], now),
      declaredContentType: input.contentType,
      declaredSize: input.size,
      checksumSha256: input.checksumSha256 ?? null,
      originalFilename: sanitizeFilename(input.filename),
      size: null,
      etag: null,
      rejectionReason: null,
      uploadUrlExpiresAt: addSeconds(now, ttl),
      completedAt: null,
      deleteRequestedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    // Record first: if signing or the response fails, the cleanup job still
    // knows the key and can remove anything the client manages to upload.
    await this.deps.uploads.insert(upload);
    const signed = await this.deps.storage.createUploadUrl({
      key: upload.objectKey,
      contentType: upload.declaredContentType,
      contentLength: upload.declaredSize,
      checksumSha256: input.checksumSha256,
      expiresInSeconds: ttl,
    });
    return {
      upload: toUploadDto(upload),
      uploadUrl: { ...signed, expiresAt: upload.uploadUrlExpiresAt.toISOString() },
    };
  }

  /** Idempotent: completing an already-available upload returns it unchanged. */
  async completeUpload(actor: Principal, id: ObjectId): Promise<UploadDto> {
    const upload = await this.deps.uploads.findById(id);
    if (!upload || !upload.ownerId.equals(actor.userId)) throw Errors.notFound('Upload');
    if (upload.status === 'available') return toUploadDto(upload);
    if (upload.status !== 'pending') {
      throw Errors.invalidState(`Upload is ${upload.status} and cannot be completed`, {
        status: upload.status,
      });
    }

    const stored = await this.deps.storage.headObject(upload.objectKey);
    if (!stored) {
      throw new AppError(
        409,
        ErrorCode.UPLOAD_VERIFICATION_FAILED,
        'The file has not been uploaded to storage yet',
        {
          details: { reason: 'object_missing' },
        },
      );
    }

    let failure: string | null = null;
    if (stored.contentLength !== upload.declaredSize) failure = 'size_mismatch';
    else if (normaliseType(stored.contentType) !== upload.declaredContentType)
      failure = 'content_type_mismatch';
    else if (
      upload.checksumSha256 &&
      stored.checksumSha256 &&
      stored.checksumSha256 !== upload.checksumSha256
    )
      failure = 'checksum_mismatch';
    else {
      const head = await this.deps.storage.readPrefix(upload.objectKey, SIGNATURE_BYTES);
      if (detectContentType(head) !== upload.declaredContentType) failure = 'file_signature_mismatch';
    }

    const now = this.deps.clock.now();
    if (failure) {
      const rejected = await this.deps.uploads.transition(id, ['pending'], {
        status: 'deleting',
        rejectionReason: failure,
        deleteRequestedAt: now,
        updatedAt: now,
      });
      if (rejected) await this.dispatchDeletion(rejected);
      this.deps.logger.warn({ uploadId: id.toHexString(), reason: failure }, 'Upload verification failed');
      throw new AppError(422, ErrorCode.UPLOAD_VERIFICATION_FAILED, 'The uploaded file failed verification', {
        details: { reason: failure },
      });
    }

    const completed = await this.deps.uploads.transition(id, ['pending'], {
      status: 'available',
      size: stored.contentLength,
      etag: stored.etag ?? null,
      completedAt: now,
      updatedAt: now,
    });
    if (completed) return toUploadDto(completed);
    // Lost a race with a concurrent completion (or deletion); report what won.
    const current = await this.deps.uploads.findById(id);
    if (current?.status === 'available') return toUploadDto(current);
    throw Errors.invalidState('Upload state changed during completion');
  }

  async getUpload(actor: Principal, id: ObjectId): Promise<UploadDto> {
    return toUploadDto(await this.loadReadable(actor, id));
  }

  async listUploads(
    actor: Principal,
    query: ListUploadsQuery,
  ): Promise<{ items: UploadDto[]; nextCursor: string | null }> {
    const canReadAny = hasPermission(actor.role, 'uploads:read:any');
    if (query.ownerId && !canReadAny && !query.ownerId.equals(actor.userId)) throw Errors.forbidden();
    const ownerId = canReadAny ? query.ownerId : actor.userId;
    const after = query.cursor ? decodeCursor(query.cursor) : undefined;
    const page = await this.deps.uploads.list({ ownerId, status: query.status }, query.limit, after);
    return { items: page.items.map(toUploadDto), nextCursor: page.nextCursor };
  }

  async createDownloadUrl(actor: Principal, id: ObjectId): Promise<{ url: string; expiresAt: string }> {
    const upload = await this.loadReadable(actor, id);
    if (upload.status !== 'available') throw Errors.invalidState(`Upload is ${upload.status}`);
    const ttl = this.deps.config.downloadUrlTtlSeconds;
    const url = await this.deps.storage.createDownloadUrl({
      key: upload.objectKey,
      expiresInSeconds: ttl,
      contentType: upload.declaredContentType,
      // Images render inline; documents download, so a crafted PDF never
      // renders in the application's context.
      disposition: isImage(upload.declaredContentType) ? 'inline' : 'attachment',
      filename: upload.originalFilename,
    });
    return { url, expiresAt: addSeconds(this.deps.clock.now(), ttl).toISOString() };
  }

  /**
   * Soft-deletes the record and queues object removal (202 semantics). If the
   * enqueue fails the record stays `deleting` and the cleanup sweep retries.
   */
  async deleteUpload(actor: Principal, id: ObjectId): Promise<UploadDto> {
    const upload = await this.deps.uploads.findById(id);
    const isOwner = upload?.ownerId.equals(actor.userId) ?? false;
    const canDelete = isOwner
      ? hasPermission(actor.role, 'uploads:delete:own')
      : hasPermission(actor.role, 'uploads:delete:any');
    if (!upload || (!isOwner && !hasPermission(actor.role, 'uploads:read:any')))
      throw Errors.notFound('Upload');
    if (!canDelete) throw Errors.forbidden();
    if (upload.status === 'deleting' || upload.status === 'deleted' || upload.status === 'expired') {
      return toUploadDto(upload);
    }

    const now = this.deps.clock.now();
    const updated = await this.deps.uploads.transition(id, ['pending', 'available'], {
      status: 'deleting',
      deleteRequestedAt: now,
      updatedAt: now,
    });
    if (!updated) {
      const current = await this.deps.uploads.findById(id);
      if (!current) throw Errors.notFound('Upload');
      return toUploadDto(current);
    }
    await this.dispatchDeletion(updated);
    return toUploadDto(updated);
  }

  private async dispatchDeletion(upload: UploadDocument): Promise<void> {
    // A pending upload's URL may still be used; delete only after it expires
    // so a late PUT cannot leave an orphaned object behind.
    const delayMs = Math.max(0, upload.uploadUrlExpiresAt.getTime() - this.deps.clock.now().getTime() + 5000);
    try {
      await this.deps.dispatcher.dispatchUploadDeletion(upload._id.toHexString(), { delayMs });
    } catch (error) {
      this.deps.logger.error(
        { err: error, uploadId: upload._id.toHexString() },
        'Failed to enqueue upload deletion; cleanup sweep will retry',
      );
    }
  }

  private async loadReadable(actor: Principal, id: ObjectId): Promise<UploadDocument> {
    const upload = await this.deps.uploads.findById(id);
    if (!upload) throw Errors.notFound('Upload');
    const allowed = upload.ownerId.equals(actor.userId)
      ? hasPermission(actor.role, 'uploads:read:own')
      : hasPermission(actor.role, 'uploads:read:any');
    // 404 rather than 403: do not confirm that another user's upload exists.
    if (!allowed) throw Errors.notFound('Upload');
    return upload;
  }
}

/** uploads/<purpose>/<yyyy>/<mm>/<uploadId>.<ext> — fully server-controlled. */
export function buildObjectKey(purpose: string, id: ObjectId, extension: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${purpose}/${year}/${month}/${id.toHexString()}.${extension}`;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'file';
}

function normaliseType(contentType: string | undefined): string | undefined {
  return contentType?.split(';')[0]?.trim().toLowerCase();
}
