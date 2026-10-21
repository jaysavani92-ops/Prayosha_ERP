import { ObjectId, type Db, type MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addSeconds } from '../../src/common/utils/clock.js';
import { Collections } from '../../src/database/collections.js';
import { RetryLaterError, UploadJobs } from '../../src/jobs/workers/upload-jobs.js';
import { UploadsRepository } from '../../src/modules/uploads/uploads.repository.js';
import type { UploadDocument } from '../../src/modules/uploads/uploads.types.js';
import { createLogger } from '../../src/observability/logger.js';
import { InMemoryStorage, MutableClock, RecordingDispatcher, SAMPLE_FILES } from '../helpers/fakes.js';
import { createTestDb, testConfig } from '../helpers/test-app.js';

let client: MongoClient;
let db: Db;
let storage: InMemoryStorage;
let dispatcher: RecordingDispatcher;
let clock: MutableClock;
let jobs: UploadJobs;
const config = testConfig();

beforeAll(async () => {
  ({ client, db } = await createTestDb());
});
afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});
beforeEach(async () => {
  await db.collection(Collections.uploads).deleteMany({});
  storage = new InMemoryStorage();
  dispatcher = new RecordingDispatcher();
  clock = new MutableClock();
  jobs = new UploadJobs({
    config: config.s3,
    uploads: new UploadsRepository(db, 5000),
    storage,
    dispatcher,
    clock,
    logger: createLogger(config),
  });
});

async function insertUpload(overrides: Partial<UploadDocument>): Promise<UploadDocument> {
  const now = clock.now();
  const id = new ObjectId();
  const upload: UploadDocument = {
    _id: id,
    ownerId: new ObjectId(),
    purpose: 'snag_photo',
    status: 'available',
    objectKey: `uploads/snag_photo/2026/10/${id.toHexString()}.png`,
    declaredContentType: 'image/png',
    declaredSize: SAMPLE_FILES.png.length,
    checksumSha256: null,
    originalFilename: 'x.png',
    size: null,
    etag: null,
    rejectionReason: null,
    uploadUrlExpiresAt: addSeconds(now, -60),
    completedAt: null,
    deleteRequestedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.collection<UploadDocument>(Collections.uploads).insertOne(upload);
  storage.put(upload.objectKey, SAMPLE_FILES.png, 'image/png');
  return upload;
}

const statusOf = async (id: ObjectId) =>
  (await db.collection<UploadDocument>(Collections.uploads).findOne({ _id: id }))?.status;

describe('deleteObject job', () => {
  it('removes the object and is safe under duplicate delivery', async () => {
    const upload = await insertUpload({ status: 'deleting', deleteRequestedAt: clock.now() });
    await expect(jobs.deleteObject({ uploadId: upload._id.toHexString() })).resolves.toBe('deleted');
    await expect(jobs.deleteObject({ uploadId: upload._id.toHexString() })).resolves.toBe('skipped');
    expect(storage.objects.has(upload.objectKey)).toBe(false);
    expect(await statusOf(upload._id)).toBe('deleted');
  });

  it('never deletes an object whose record is not in deleting', async () => {
    const upload = await insertUpload({ status: 'available' });
    await expect(jobs.deleteObject({ uploadId: upload._id.toHexString() })).resolves.toBe('skipped');
    expect(storage.objects.has(upload.objectKey)).toBe(true);
  });

  it('waits until the presigned URL has expired', async () => {
    const upload = await insertUpload({
      status: 'deleting',
      uploadUrlExpiresAt: addSeconds(clock.now(), 120),
    });
    await expect(jobs.deleteObject({ uploadId: upload._id.toHexString() })).rejects.toBeInstanceOf(
      RetryLaterError,
    );
    clock.advance(121);
    await expect(jobs.deleteObject({ uploadId: upload._id.toHexString() })).resolves.toBe('deleted');
  });

  it('leaves the record retryable when storage fails', async () => {
    const upload = await insertUpload({ status: 'deleting' });
    storage.failNext = new Error('S3 timeout');
    await expect(jobs.deleteObject({ uploadId: upload._id.toHexString() })).rejects.toThrow('S3 timeout');
    expect(await statusOf(upload._id)).toBe('deleting');
    await expect(jobs.deleteObject({ uploadId: upload._id.toHexString() })).resolves.toBe('deleted');
  });
});

describe('cleanup sweep', () => {
  it('expires abandoned pending uploads and removes stray objects, but not recent ones', async () => {
    const graceSeconds = config.s3.pendingGraceSeconds;
    const abandoned = await insertUpload({
      status: 'pending',
      uploadUrlExpiresAt: addSeconds(clock.now(), -graceSeconds - 60),
    });
    const recent = await insertUpload({
      status: 'pending',
      uploadUrlExpiresAt: addSeconds(clock.now(), -10),
    });
    const result = await jobs.cleanup();
    expect(result.expired).toBe(1);
    expect(await statusOf(abandoned._id)).toBe('expired');
    expect(storage.objects.has(abandoned.objectKey)).toBe(false);
    expect(await statusOf(recent._id)).toBe('pending');
  });

  it('re-dispatches deletions stuck in deleting', async () => {
    const stuck = await insertUpload({
      status: 'deleting',
      deleteRequestedAt: addSeconds(clock.now(), -3600),
    });
    const fresh = await insertUpload({ status: 'deleting', deleteRequestedAt: clock.now() });
    const result = await jobs.cleanup();
    expect(result.redispatched).toBe(1);
    expect(dispatcher.dispatched.map((d) => d.uploadId)).toEqual([stuck._id.toHexString()]);
    expect(dispatcher.dispatched.map((d) => d.uploadId)).not.toContain(fresh._id.toHexString());
  });

  it('keeps an abandoned upload in deleting when storage fails, so a later sweep retries', async () => {
    const abandoned = await insertUpload({
      status: 'pending',
      uploadUrlExpiresAt: addSeconds(clock.now(), -99_999),
    });
    storage.failNext = new Error('S3 down');
    expect((await jobs.cleanup()).expired).toBe(0);
    expect(await statusOf(abandoned._id)).toBe('deleting');
  });
});
