/**
 * End-to-end smoke test of the real upload path against a RUNNING stack
 * (API + S3 or the local emulator). Not part of `npm test`.
 *
 *   SMOKE_API=http://127.0.0.1:3000 SMOKE_USER=owner SMOKE_PASSWORD=... npm run smoke:upload
 *
 * Verifies with real S3 semantics that:
 *   1. a presigned PUT with the signed headers succeeds and /complete verifies it;
 *   2. a body whose size differs from the signed Content-Length is rejected;
 *   3. a second PUT to the same URL cannot overwrite the object (If-None-Match);
 *   4. the presigned download URL returns the exact bytes.
 */
import { createHash } from 'node:crypto';

const api = process.env.SMOKE_API ?? 'http://127.0.0.1:3000';
const username = process.env.SMOKE_USER;
const password = process.env.SMOKE_PASSWORD;
if (!username || !password) {
  console.error('Set SMOKE_USER and SMOKE_PASSWORD');
  process.exit(1);
}

function check(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`ok   ${message}`);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(2048, 7),
]);
const checksum = createHash('sha256').update(png).digest('base64');

const loginRes = await fetch(`${api}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
check(loginRes.ok, `login (${loginRes.status})`);
const { data: session } = (await loginRes.json()) as { data: { accessToken: string } };
const auth = { authorization: `Bearer ${session.accessToken}` };

const createRes = await fetch(`${api}/api/v1/uploads`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({
    purpose: 'snag_photo',
    contentType: 'image/png',
    size: png.length,
    filename: 'smoke.png',
    checksumSha256: checksum,
  }),
});
check(createRes.status === 201, `presign (${createRes.status})`);
const created = (await createRes.json()) as {
  data: { upload: { id: string }; uploadUrl: { url: string; headers: Record<string, string> } };
};
const { url, headers } = created.data.uploadUrl;

const wrongSize = await fetch(url, { method: 'PUT', headers, body: Buffer.concat([png, Buffer.from('x')]) });
check(wrongSize.status >= 400, `S3 rejects a body that does not match the signed size (${wrongSize.status})`);

const tampered = Buffer.from(png);
tampered[100] = 0;
const badChecksum = await fetch(url, { method: 'PUT', headers, body: tampered });
check(badChecksum.status >= 400, `S3 rejects bytes that do not match the checksum (${badChecksum.status})`);

const put = await fetch(url, { method: 'PUT', headers, body: png });
check(put.ok, `direct upload to S3 (${put.status})`);

const overwrite = await fetch(url, { method: 'PUT', headers, body: png });
check(overwrite.status === 412, `second PUT cannot overwrite the object (${overwrite.status})`);

const completeRes = await fetch(`${api}/api/v1/uploads/${created.data.upload.id}/complete`, {
  method: 'POST',
  headers: auth,
});
const completed = (await completeRes.json()) as { data?: { status: string }; error?: unknown };
check(
  completeRes.ok && completed.data?.status === 'available',
  `complete -> available (${completeRes.status})`,
);

const dlRes = await fetch(`${api}/api/v1/uploads/${created.data.upload.id}/download-url`, {
  method: 'POST',
  headers: auth,
});
const { data: download } = (await dlRes.json()) as { data: { url: string } };
const fetched = Buffer.from(await (await fetch(download.url)).arrayBuffer());
check(fetched.equals(png), 'download URL returns the exact bytes');

const del = await fetch(`${api}/api/v1/uploads/${created.data.upload.id}`, {
  method: 'DELETE',
  headers: auth,
});
check(del.status === 202, `delete accepted (${del.status})`);
console.log('smoke test passed');
