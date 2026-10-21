/**
 * Seeds a NON-PRODUCTION database with load-test users and upload records.
 *
 *   LOAD_USERS=50 LOAD_UPLOADS_PER_USER=200 npm run load:seed
 *
 * Safety: refuses NODE_ENV=production and any MongoDB host other than
 * localhost unless LOAD_TEST_TARGET=staging is set explicitly.
 * Users are named loadtest.NNN with password LOAD_PASSWORD.
 */
import { MongoClient, ObjectId } from 'mongodb';
import { Collections } from '../../src/database/collections.js';
import type { UploadDocument } from '../../src/modules/uploads/uploads.types.js';
import { Argon2PasswordHasher } from '../../src/modules/users/password-hasher.js';
import type { UserDocument } from '../../src/modules/users/users.types.js';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? 'prayosha';
const users = Number(process.env.LOAD_USERS ?? 50);
const uploadsPerUser = Number(process.env.LOAD_UPLOADS_PER_USER ?? 200);
const password = process.env.LOAD_PASSWORD ?? 'load-test-password-1';

if (!uri) throw new Error('MONGODB_URI is required');
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed with NODE_ENV=production');
const host = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).hostname;
if (!['127.0.0.1', 'localhost', 'mongo'].includes(host) && process.env.LOAD_TEST_TARGET !== 'staging') {
  throw new Error(
    `Refusing to seed remote host ${host}; set LOAD_TEST_TARGET=staging for a staging database`,
  );
}

const client = await MongoClient.connect(uri);
const db = client.db(dbName);
const hasher = new Argon2PasswordHasher({ concurrency: 4, queueLimit: 1000 });
const passwordHash = await hasher.hash(password);
const now = Date.now();

const userDocs: UserDocument[] = Array.from({ length: users }, (_, i) => ({
  _id: new ObjectId(),
  username: `loadtest.${String(i).padStart(3, '0')}`,
  displayName: `Load Test ${i}`,
  role: 'site_engineer',
  status: 'active',
  passwordHash,
  passwordChangedAt: new Date(now),
  tokenVersion: 0,
  failedLoginCount: 0,
  lockedUntil: null,
  lastLoginAt: null,
  createdBy: null,
  createdAt: new Date(now),
  updatedAt: new Date(now),
}));

await db.collection(Collections.users).deleteMany({ username: /^loadtest\./ });
await db.collection<UserDocument>(Collections.users).insertMany(userDocs);

let inserted = 0;
for (const user of userDocs) {
  const batch: UploadDocument[] = Array.from({ length: uploadsPerUser }, (_, j) => {
    const id = new ObjectId();
    const createdAt = new Date(now - j * 60_000);
    return {
      _id: id,
      ownerId: user._id,
      purpose: 'snag_photo',
      status: 'available',
      objectKey: `uploads/loadtest/${id.toHexString()}.jpg`,
      declaredContentType: 'image/jpeg',
      declaredSize: 250_000,
      checksumSha256: null,
      originalFilename: `photo-${j}.jpg`,
      size: 250_000,
      etag: null,
      rejectionReason: null,
      uploadUrlExpiresAt: createdAt,
      completedAt: createdAt,
      deleteRequestedAt: null,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
  });
  if (batch.length > 0)
    await db.collection<UploadDocument>(Collections.uploads).insertMany(batch, { ordered: false });
  inserted += batch.length;
}

console.log(`seeded ${users} users (loadtest.000..) and ${inserted} uploads into ${dbName}`);
await client.close();
