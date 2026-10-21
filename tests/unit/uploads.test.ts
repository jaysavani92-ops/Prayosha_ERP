import { HeadObjectCommand, NotFound, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { ObjectId } from 'mongodb';
import { afterEach, describe, expect, it } from 'vitest';
import { contentDisposition, S3ObjectStorage } from '../../src/infrastructure/storage/s3-storage.js';
import { detectContentType } from '../../src/modules/uploads/file-signature.js';
import { buildObjectKey, sanitizeFilename } from '../../src/modules/uploads/uploads.service.js';
import { SAMPLE_FILES } from '../helpers/fakes.js';
import { testConfig } from '../helpers/test-app.js';

// Static fake credentials for local presigning (no network calls are made).
process.env.AWS_ACCESS_KEY_ID = 'AKIATESTTESTTEST';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

describe('detectContentType', () => {
  it.each([
    [SAMPLE_FILES.png, 'image/png'],
    [SAMPLE_FILES.jpeg, 'image/jpeg'],
    [SAMPLE_FILES.pdf, 'application/pdf'],
    [Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '), 'image/webp'],
    [Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00'), 'image/heic'],
  ])('identifies %#', (bytes, expected) => {
    expect(detectContentType(bytes)).toBe(expected);
  });

  it.each([SAMPLE_FILES.html, Buffer.from('MZ\x90\x00'), Buffer.alloc(0), Buffer.from('<svg xmlns=')])(
    'rejects disallowed content %#',
    (bytes) => {
      expect(detectContentType(bytes)).toBeNull();
    },
  );
});

describe('object keys and filenames', () => {
  it('builds server-controlled keys without client input', () => {
    const id = new ObjectId('65f000000000000000000001');
    expect(buildObjectKey('snag_photo', id, 'jpg', new Date('2026-03-09T00:00:00Z'))).toBe(
      'uploads/snag_photo/2026/03/65f000000000000000000001.jpg',
    );
  });

  it.each([
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\photo.jpg', 'photo.jpg'],
    ['.hidden', 'hidden'],
    ['a\u0000b<c>.pdf', 'a_b_c_.pdf'],
    ['   ', 'file'],
  ])('sanitises %j', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('encodes Content-Disposition safely', () => {
    expect(contentDisposition('attachment', 'bill "final".pdf')).toBe(
      'attachment; filename="bill _final_.pdf"; filename*=UTF-8\'\'bill%20%22final%22.pdf',
    );
    expect(contentDisposition('inline', 'સાઇટ.jpg')).toContain("filename*=UTF-8''%E0%AA%B8");
  });
});

describe('S3ObjectStorage', () => {
  const s3Mock = mockClient(S3Client);
  afterEach(() => s3Mock.reset());
  const storage = new S3ObjectStorage(testConfig().s3);

  it('signs size, type, no-overwrite and checksum headers into the upload URL', async () => {
    const checksum = 'n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=';
    const signed = await storage.createUploadUrl({
      key: 'uploads/snag_photo/2026/10/abc.jpg',
      contentType: 'image/jpeg',
      contentLength: 1234,
      checksumSha256: checksum,
      expiresInSeconds: 300,
    });
    const url = new URL(signed.url);
    expect(url.pathname).toContain('uploads/snag_photo/2026/10/abc.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'if-none-match', 'x-amz-checksum-sha256']),
    );
    expect(signed.headers).toEqual({
      'Content-Type': 'image/jpeg',
      'If-None-Match': '*',
      'x-amz-checksum-sha256': checksum,
    });
    expect(signed.url).not.toContain('X-Amz-Security-Token=undefined');
  });

  it('maps a missing object to null and other failures to 503', async () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejectsOnce(new NotFound({ message: 'nf', $metadata: { httpStatusCode: 404 } }));
    await expect(storage.headObject('missing')).resolves.toBeNull();
    s3Mock.on(HeadObjectCommand).rejectsOnce(
      new S3ServiceException({
        name: 'InternalError',
        $fault: 'server',
        $metadata: { httpStatusCode: 500 },
      }),
    );
    await expect(storage.headObject('x')).rejects.toMatchObject({
      statusCode: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
    });
  });

  it('returns object metadata', async () => {
    s3Mock
      .on(HeadObjectCommand)
      .resolves({ ContentLength: 10, ContentType: 'image/png', ETag: '"e"', ChecksumSHA256: 'c' });
    await expect(storage.headObject('k')).resolves.toEqual({
      contentLength: 10,
      contentType: 'image/png',
      etag: '"e"',
      checksumSha256: 'c',
    });
  });
});
