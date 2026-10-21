import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../../config/env.js';
import { Errors } from '../../common/errors/app-error.js';
import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStorage,
  PresignedUpload,
  StoredObjectInfo,
} from './object-storage.js';

/**
 * AWS S3 adapter (AWS SDK v3). Credentials are never configured here: the SDK
 * default provider chain resolves them from the environment, an EC2/ECS role,
 * or ~/.aws. Clients never receive credentials, only short-lived signed URLs.
 */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfig['s3']) {
    const base: S3ClientConfig = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      // Only compute/validate checksums when an operation requires them; we
      // pass explicit SHA-256 checksums ourselves. Avoids SDK-added CRC32
      // parameters leaking into presigned URLs.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
      requestHandler: {
        connectionTimeout: Math.min(config.requestTimeoutMs, 3000),
        requestTimeout: config.requestTimeoutMs,
        httpsAgent: { keepAlive: true, maxSockets: 50 },
        httpAgent: { keepAlive: true, maxSockets: 50 },
      },
    };
    this.client = new S3Client({ ...base, ...(config.endpoint ? { endpoint: config.endpoint } : {}) });
    // Presigned URLs embed the host in the signature. When the API reaches S3
    // through an internal hostname (e.g. MinIO in Docker) the URL handed to
    // browsers must be signed for the public hostname instead.
    const presignEndpoint = config.presignEndpoint ?? config.endpoint;
    this.presignClient = new S3Client({ ...base, ...(presignEndpoint ? { endpoint: presignEndpoint } : {}) });
    this.bucket = config.bucket;
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      // S3 conditional write: the PUT fails with 412 if an object already
      // exists at this key, so a leaked URL cannot overwrite a verified file.
      IfNoneMatch: '*',
      ...(input.checksumSha256 ? { ChecksumSHA256: input.checksumSha256 } : {}),
    });
    const signedHeaders = new Set(['content-type', 'content-length', 'if-none-match']);
    if (input.checksumSha256) signedHeaders.add('x-amz-checksum-sha256');
    const url = await getSignedUrl(this.presignClient, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: signedHeaders,
      unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
    });
    const headers: Record<string, string> = { 'Content-Type': input.contentType, 'If-None-Match': '*' };
    if (input.checksumSha256) headers['x-amz-checksum-sha256'] = input.checksumSha256;
    return { url, method: 'PUT', headers, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000) };
  }

  async headObject(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key, ChecksumMode: 'ENABLED' }),
      );
      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag,
        checksumSha256: result.ChecksumSHA256,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw Errors.dependencyUnavailable('object-storage', error);
    }
  }

  async readPrefix(key: string, length: number): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` }),
      );
      if (!result.Body) return Buffer.alloc(0);
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      throw Errors.dependencyUnavailable('object-storage', error);
    }
  }

  async createDownloadUrl(input: CreateDownloadUrlInput): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: contentDisposition(input.disposition, input.filename),
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: input.expiresInSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) return;
      throw Errors.dependencyUnavailable('object-storage', error);
    }
  }

  destroy(): void {
    this.client.destroy();
    this.presignClient.destroy();
  }
}

function isNotFound(error: unknown): boolean {
  if (error instanceof S3ServiceException) {
    return error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404;
  }
  return false;
}

/** RFC 6266 header with an ASCII fallback and a UTF-8 encoded filename. */
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
