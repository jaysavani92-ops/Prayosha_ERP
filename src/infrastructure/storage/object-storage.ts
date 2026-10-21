/**
 * Storage port used by the uploads module. The S3 adapter implements it for
 * AWS S3 (and S3-compatible MinIO locally); tests use an in-memory fake.
 */
export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** Headers the client MUST send unchanged; they are part of the signature. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObjectInfo {
  contentLength: number;
  contentType: string | undefined;
  etag: string | undefined;
  checksumSha256: string | undefined;
}

export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  contentLength: number;
  checksumSha256: string | undefined;
  expiresInSeconds: number;
}

export interface CreateDownloadUrlInput {
  key: string;
  expiresInSeconds: number;
  contentType: string;
  disposition: 'inline' | 'attachment';
  filename: string;
}

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload>;
  /** Returns null when the object does not exist. */
  headObject(key: string): Promise<StoredObjectInfo | null>;
  /** Reads the first `length` bytes (used for file signature checks). */
  readPrefix(key: string, length: number): Promise<Buffer>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  /** Idempotent: deleting a missing object succeeds. */
  deleteObject(key: string): Promise<void>;
}
