import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Collections } from '../../src/database/collections.js';
import { SAMPLE_FILES } from '../helpers/fakes.js';
import { createTestApp, login, seedUser, type LoggedIn, type TestContext } from '../helpers/test-app.js';

let ctx: TestContext;
let alice: LoggedIn;
let bob: LoggedIn;
let manager: LoggedIn;

beforeAll(async () => {
  ctx = await createTestApp();
  await seedUser(ctx, { username: 'alice', role: 'site_engineer' });
  await seedUser(ctx, { username: 'bob', role: 'site_engineer' });
  await seedUser(ctx, { username: 'manager', role: 'general_manager' });
  [alice, bob, manager] = await Promise.all([
    login(ctx.app, 'alice'),
    login(ctx.app, 'bob'),
    login(ctx.app, 'manager'),
  ]);
});
afterAll(() => ctx.close());
beforeEach(() => {
  ctx.dispatcher.dispatched.length = 0;
  ctx.dispatcher.fail = false;
});

interface Created {
  upload: { id: string; status: string };
  uploadUrl: { url: string; headers: Record<string, string> };
}

async function requestUpload(session: LoggedIn, overrides: Record<string, unknown> = {}, headers = {}) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/uploads',
    headers: { ...session.auth, ...headers },
    payload: {
      purpose: 'snag_photo',
      contentType: 'image/png',
      size: SAMPLE_FILES.png.length,
      filename: 'crack.png',
      ...overrides,
    },
  });
}

async function objectKeyOf(id: string): Promise<string> {
  const doc = await ctx.db.collection(Collections.uploads).findOne({ _id: new ObjectId(id) });
  return doc!.objectKey as string;
}

const complete = (session: LoggedIn, id: string) =>
  ctx.app.inject({ method: 'POST', url: `/api/v1/uploads/${id}/complete`, headers: session.auth });

/** request -> simulated direct PUT to S3 -> complete */
async function uploadFile(session: LoggedIn, bytes = SAMPLE_FILES.png, contentType = 'image/png') {
  const created = (await requestUpload(session, { contentType, size: bytes.length })).json<{
    data: Created;
  }>().data;
  ctx.storage.put(await objectKeyOf(created.upload.id), bytes, contentType);
  const done = await complete(session, created.upload.id);
  return { id: created.upload.id, response: done };
}

describe('POST /api/v1/uploads', () => {
  it('creates a pending upload with a server-controlled key and signed headers', async () => {
    const response = await requestUpload(alice, { filename: '../../../etc/passwd.png' });
    expect(response.statusCode).toBe(201);
    const { upload, uploadUrl } = response.json<{ data: Created }>().data;
    expect(upload.status).toBe('pending');
    expect(uploadUrl.headers).toMatchObject({ 'Content-Type': 'image/png', 'If-None-Match': '*' });
    const key = await objectKeyOf(upload.id);
    expect(key).toMatch(new RegExp(`^uploads/snag_photo/\\d{4}/\\d{2}/${upload.id}\\.png$`));
    expect(key).not.toContain('passwd');
  });

  it.each([
    [{ contentType: 'application/pdf' }, 415, 'UNSUPPORTED_MEDIA_TYPE'], // snag photos are images only
    [{ contentType: 'text/html' }, 400, 'VALIDATION_FAILED'],
    [{ size: 16 * 1024 * 1024 }, 413, 'PAYLOAD_TOO_LARGE'],
    [{ size: 0 }, 400, 'VALIDATION_FAILED'],
    [{ purpose: 'avatar' }, 400, 'VALIDATION_FAILED'],
    [{ objectKey: 'uploads/other-user/file.png' }, 400, 'VALIDATION_FAILED'],
    [{ checksumSha256: 'not-base64' }, 400, 'VALIDATION_FAILED'],
  ])('rejects %o', async (overrides, status, code) => {
    const response = await requestUpload(alice, overrides);
    expect(response.statusCode).toBe(status);
    expect(response.json().error.code).toBe(code);
  });

  it('requires authentication', async () => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/v1/uploads', payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it('honours Idempotency-Key', async () => {
    const headers = { 'idempotency-key': 'upload-retry-key-1' };
    const first = await requestUpload(alice, {}, headers);
    const retry = await requestUpload(alice, {}, headers);
    expect(retry.json().data.upload.id).toBe(first.json().data.upload.id);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    // Same key from a different user is a different scope.
    const other = await requestUpload(bob, {}, headers);
    expect(other.json().data.upload.id).not.toBe(first.json().data.upload.id);
  });
});

describe('POST /api/v1/uploads/:id/complete', () => {
  it('verifies the stored object and marks it available (idempotently)', async () => {
    const { id, response } = await uploadFile(alice);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id, status: 'available', size: SAMPLE_FILES.png.length });
    expect((await complete(alice, id)).statusCode).toBe(200);
  });

  it('returns 409 when the client has not uploaded yet, and allows a later retry', async () => {
    const created = (await requestUpload(alice)).json<{ data: Created }>().data;
    const early = await complete(alice, created.upload.id);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.details.reason).toBe('object_missing');
    ctx.storage.put(await objectKeyOf(created.upload.id), SAMPLE_FILES.png, 'image/png');
    expect((await complete(alice, created.upload.id)).statusCode).toBe(200);
  });

  it.each([
    ['file_signature_mismatch', SAMPLE_FILES.html.subarray(0, SAMPLE_FILES.png.length), 'image/png'],
    ['content_type_mismatch', SAMPLE_FILES.png, 'image/jpeg'],
  ])('rejects %s, schedules deletion and blocks downloads', async (reason, bytes, storedType) => {
    const created = (await requestUpload(alice)).json<{ data: Created }>().data;
    ctx.storage.put(await objectKeyOf(created.upload.id), bytes, storedType);
    const response = await complete(alice, created.upload.id);
    expect(response.statusCode).toBe(422);
    expect(response.json().error.details.reason).toBe(reason);
    expect(ctx.dispatcher.dispatched.map((d) => d.uploadId)).toContain(created.upload.id);
    const get = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/uploads/${created.upload.id}`,
      headers: alice.auth,
    });
    expect(get.json().data).toMatchObject({ status: 'deleting', rejectionReason: reason });
    const download = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/uploads/${created.upload.id}/download-url`,
      headers: alice.auth,
    });
    expect(download.statusCode).toBe(409);
  });

  it('rejects a size mismatch', async () => {
    const created = (await requestUpload(alice)).json<{ data: Created }>().data;
    ctx.storage.put(
      await objectKeyOf(created.upload.id),
      Buffer.concat([SAMPLE_FILES.png, Buffer.alloc(10)]),
      'image/png',
    );
    const response = await complete(alice, created.upload.id);
    expect(response.json().error.details.reason).toBe('size_mismatch');
  });

  it('records the checksum when provided', async () => {
    const checksum = createHash('sha256').update(SAMPLE_FILES.png).digest('base64');
    const created = (await requestUpload(alice, { checksumSha256: checksum })).json<{ data: Created }>().data;
    expect(created.uploadUrl.headers['x-amz-checksum-sha256']).toBe(checksum);
    ctx.storage.put(await objectKeyOf(created.upload.id), SAMPLE_FILES.png, 'image/png');
    expect((await complete(alice, created.upload.id)).statusCode).toBe(200);
  });

  it('does not let another user complete my upload', async () => {
    const created = (await requestUpload(alice)).json<{ data: Created }>().data;
    ctx.storage.put(await objectKeyOf(created.upload.id), SAMPLE_FILES.png, 'image/png');
    expect((await complete(bob, created.upload.id)).statusCode).toBe(404);
  });
});

describe('reading uploads', () => {
  it('isolates users and lets administrators read any upload', async () => {
    const { id } = await uploadFile(alice);
    const asBob = await ctx.app.inject({ method: 'GET', url: `/api/v1/uploads/${id}`, headers: bob.auth });
    expect(asBob.statusCode).toBe(404); // existence is not disclosed
    const asManager = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/uploads/${id}`,
      headers: manager.auth,
    });
    expect(asManager.statusCode).toBe(200);
  });

  it('lists only my uploads; ownerId filter is admin-only', async () => {
    await uploadFile(bob);
    const mine = await ctx.app.inject({ method: 'GET', url: '/api/v1/uploads', headers: bob.auth });
    const bobId = (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bob.auth })).json()
      .data.id;
    expect(mine.json().data.length).toBeGreaterThan(0);
    expect(mine.json().data.every((u: { ownerId: string }) => u.ownerId === bobId)).toBe(true);
    const aliceId = (
      await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: alice.auth })
    ).json().data.id;
    const snoop = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/uploads?ownerId=${aliceId}`,
      headers: bob.auth,
    });
    expect(snoop.statusCode).toBe(403);
    const admin = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/uploads?ownerId=${aliceId}`,
      headers: manager.auth,
    });
    expect(admin.json().data.every((u: { ownerId: string }) => u.ownerId === aliceId)).toBe(true);
  });

  it('issues inline URLs for images and attachment URLs for documents', async () => {
    const image = await uploadFile(alice);
    const imageUrl = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/uploads/${image.id}/download-url`,
      headers: alice.auth,
    });
    expect(imageUrl.statusCode).toBe(200);
    expect(imageUrl.headers['cache-control']).toBe('no-store');
    expect(imageUrl.json().data.url).toContain('disposition=inline');

    const created = (
      await requestUpload(alice, {
        purpose: 'inventory_invoice',
        contentType: 'application/pdf',
        size: SAMPLE_FILES.pdf.length,
      })
    ).json<{ data: Created }>().data;
    ctx.storage.put(await objectKeyOf(created.upload.id), SAMPLE_FILES.pdf, 'application/pdf');
    await complete(alice, created.upload.id);
    const pdfUrl = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/uploads/${created.upload.id}/download-url`,
      headers: alice.auth,
    });
    expect(pdfUrl.json().data.url).toContain('disposition=attachment');
  });
});

describe('DELETE /api/v1/uploads/:id', () => {
  it('soft-deletes, queues object removal and is idempotent', async () => {
    const { id } = await uploadFile(alice);
    const first = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/uploads/${id}`,
      headers: alice.auth,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json().data.status).toBe('deleting');
    expect(ctx.dispatcher.dispatched).toEqual([expect.objectContaining({ uploadId: id })]);
    const again = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/uploads/${id}`,
      headers: alice.auth,
    });
    expect(again.statusCode).toBe(202);
    expect(ctx.dispatcher.dispatched).toHaveLength(1);
  });

  it('still accepts the deletion when the queue is down (the sweep re-dispatches)', async () => {
    const { id } = await uploadFile(alice);
    ctx.dispatcher.fail = true;
    const response = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/uploads/${id}`,
      headers: alice.auth,
    });
    expect(response.statusCode).toBe(202);
    const doc = await ctx.db.collection(Collections.uploads).findOne({ _id: new ObjectId(id) });
    expect(doc?.status).toBe('deleting');
  });

  it("forbids deleting another user's upload unless permitted", async () => {
    const { id } = await uploadFile(alice);
    expect(
      (await ctx.app.inject({ method: 'DELETE', url: `/api/v1/uploads/${id}`, headers: bob.auth }))
        .statusCode,
    ).toBe(404);
    expect(
      (await ctx.app.inject({ method: 'DELETE', url: `/api/v1/uploads/${id}`, headers: manager.auth }))
        .statusCode,
    ).toBe(202);
  });
});
