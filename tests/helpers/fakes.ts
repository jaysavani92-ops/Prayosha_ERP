import { createHash } from 'node:crypto';
import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStorage,
  PresignedUpload,
  StoredObjectInfo,
} from '../../src/infrastructure/storage/object-storage.js';
import type { JobDispatcher, QueueCounts } from '../../src/jobs/dispatcher.js';
import type { PasswordHasher } from '../../src/modules/users/password-hasher.js';

interface StoredObject {
  bytes: Buffer;
  contentType: string;
  checksumSha256: string | undefined;
}

/** In-memory S3 stand-in. `put()` simulates the client's direct upload. */
export class InMemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  readonly deleted: string[] = [];
  failNext: Error | null = null;

  put(key: string, bytes: Buffer, contentType: string): void {
    const checksumSha256 = createHash('sha256').update(bytes).digest('base64');
    this.objects.set(key, { bytes, contentType, checksumSha256 });
  }

  createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload> {
    const headers: Record<string, string> = { 'Content-Type': input.contentType, 'If-None-Match': '*' };
    if (input.checksumSha256) headers['x-amz-checksum-sha256'] = input.checksumSha256;
    return Promise.resolve({
      url: `https://bucket.example.test/${input.key}?X-Amz-Signature=fake`,
      method: 'PUT',
      headers,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    });
  }

  headObject(key: string): Promise<StoredObjectInfo | null> {
    this.throwIfFailing();
    const object = this.objects.get(key);
    if (!object) return Promise.resolve(null);
    return Promise.resolve({
      contentLength: object.bytes.length,
      contentType: object.contentType,
      etag: '"etag"',
      checksumSha256: object.checksumSha256,
    });
  }

  readPrefix(key: string, length: number): Promise<Buffer> {
    this.throwIfFailing();
    return Promise.resolve(this.objects.get(key)?.bytes.subarray(0, length) ?? Buffer.alloc(0));
  }

  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
    return Promise.resolve(`https://bucket.example.test/${input.key}?disposition=${input.disposition}`);
  }

  deleteObject(key: string): Promise<void> {
    this.throwIfFailing();
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }

  private throwIfFailing(): void {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
  }
}

export class RecordingDispatcher implements JobDispatcher {
  readonly dispatched: { uploadId: string; delayMs?: number; jobIdSuffix?: string }[] = [];
  fail = false;

  dispatchUploadDeletion(
    uploadId: string,
    options: { delayMs?: number; jobIdSuffix?: string } = {},
  ): Promise<void> {
    if (this.fail) return Promise.reject(new Error('redis down'));
    this.dispatched.push({ uploadId, ...options });
    return Promise.resolve();
  }
  getQueueCounts(): Promise<QueueCounts[]> {
    return Promise.resolve([{ queue: 'uploads', counts: { waiting: this.dispatched.length } }]);
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Fast deterministic hasher so API tests do not spend ~50ms per Argon2 hash.
 * Argon2PasswordHasher itself is covered by its own unit test.
 */
export class FastTestHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`test$${createHash('sha256').update(plain).digest('hex')}`);
  }
  async verify(hash: string, plain: string): Promise<boolean> {
    return hash === (await this.hash(plain));
  }
  verifyAgainstDummy(): Promise<void> {
    return Promise.resolve();
  }
}

export class MutableClock {
  constructor(private current = new Date('2026-10-21T10:00:00.000Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

/** Minimal valid file headers for signature checks. */
export const SAMPLE_FILES = {
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 1)]),
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(120, 2)]),
  pdf: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(120, 3)]),
  html: Buffer.from('<html><script>alert(document.cookie)</script></html>'.padEnd(128, ' ')),
};
