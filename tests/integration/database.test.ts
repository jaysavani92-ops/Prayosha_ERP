import { MongoServerError, ObjectId, type Db, type Document, type MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Collections } from '../../src/database/collections.js';
import { INDEX_SPECS } from '../../src/database/indexes/index-specs.js';
import { findIndexDrift, runMigrations, type Migration } from '../../src/database/migrations/runner.js';
import { UploadsRepository } from '../../src/modules/uploads/uploads.repository.js';
import { UsersRepository } from '../../src/modules/users/users.repository.js';
import { createTestDb, seedUser } from '../helpers/test-app.js';

const quiet = { info: () => undefined, warn: () => undefined };
let client: MongoClient;
let db: Db;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
});
afterAll(async () => {
  await db.dropDatabase();
  await client.close();
});

/** Walks an explain() plan and returns every stage name. */
function stages(plan: Document): string[] {
  const out: string[] = [];
  const visit = (node: Document | undefined) => {
    if (!node) return;
    out.push(String(node.stage));
    visit(node.inputStage as Document | undefined);
    for (const child of (node.inputStages as Document[] | undefined) ?? []) visit(child);
  };
  visit((plan.queryPlanner as Document).winningPlan as Document);
  return out;
}

describe('migrations', () => {
  it('creates every declared index and reports no drift', async () => {
    expect(await findIndexDrift(db)).toEqual([]);
    for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
      const names = (await db.collection(collection).listIndexes().toArray()).map(
        (index) => index.name as string,
      );
      for (const spec of specs) expect(names).toContain(spec.options.name);
    }
  });

  it('is idempotent and records data migrations once', async () => {
    let runs = 0;
    const migration: Migration = {
      id: '0001-test',
      description: 'test',
      up: () => {
        runs++;
        return Promise.resolve();
      },
    };
    await runMigrations(db, [migration], quiet);
    await runMigrations(db, [migration], quiet);
    expect(runs).toBe(1);
    expect(await db.collection(Collections.migrations).countDocuments({ _id: '0001-test' as never })).toBe(1);
  });

  it('refuses to run concurrently', async () => {
    await db
      .collection(Collections.migrationLock)
      .insertOne({ _id: 'schema' as never, acquiredAt: new Date() });
    await expect(runMigrations(db, [], quiet)).rejects.toThrow(/holds the lock/);
    await db.collection(Collections.migrationLock).deleteMany({});
  });

  it('rejects out-of-order migration lists', async () => {
    const noop = () => Promise.resolve();
    await expect(
      runMigrations(
        db,
        [
          { id: '0002-b', description: '', up: noop },
          { id: '0001-a', description: '', up: noop },
        ],
        quiet,
      ),
    ).rejects.toThrow(/id order/);
  });

  it('detects index drift', async () => {
    await db.collection(Collections.uploads).createIndex({ purpose: 1 }, { name: 'rogue_index' });
    expect(await findIndexDrift(db)).toEqual([
      { collection: 'uploads', missing: [], unexpected: ['rogue_index'] },
    ]);
    await db.collection(Collections.uploads).dropIndex('rogue_index');
  });
});

describe('schema validation', () => {
  it('rejects documents with unknown fields or invalid enums', async () => {
    const users = db.collection(Collections.users);
    const base = await seedUser({ db }, { username: 'validator.user', role: 'site_engineer' });
    await expect(
      users.insertOne({ ...base, _id: new ObjectId(), username: 'other', role: 'superuser' }),
    ).rejects.toBeInstanceOf(MongoServerError);
    await expect(
      users.insertOne({ ...base, _id: new ObjectId(), username: 'other2', isAdmin: true }),
    ).rejects.toBeInstanceOf(MongoServerError);
  });

  it('enforces unique usernames', async () => {
    await seedUser({ db }, { username: 'dupe', role: 'site_engineer' });
    await expect(seedUser({ db }, { username: 'dupe', role: 'site_engineer' })).rejects.toMatchObject({
      code: 11000,
    });
  });
});

describe('query plans use the declared indexes (no collection scans)', () => {
  it('login lookup by username', async () => {
    const plan = await db.collection(Collections.users).find({ username: 'dupe' }).explain('queryPlanner');
    // MongoDB 8 serves unique equality lookups with EXPRESS_IXSCAN.
    expect(stages(plan).some((stage) => stage.endsWith('IXSCAN'))).toBe(true);
    expect(stages(plan)).not.toContain('COLLSCAN');
  });

  it('owner upload list with keyset pagination needs no in-memory sort', async () => {
    const ownerId = new ObjectId();
    const plan = await db
      .collection(Collections.uploads)
      .find({
        ownerId,
        status: 'available',
        $or: [{ createdAt: { $lt: new Date() } }, { createdAt: new Date(), _id: { $lt: new ObjectId() } }],
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(21)
      .explain('queryPlanner');
    const used = stages(plan);
    expect(used).toContain('IXSCAN');
    expect(used).not.toContain('COLLSCAN');
    expect(used).not.toContain('SORT');
  });

  it('cleanup sweep uses the partial pending index', async () => {
    const plan = await db
      .collection(Collections.uploads)
      .find({ status: 'pending', uploadUrlExpiresAt: { $lt: new Date() } })
      .sort({ uploadUrlExpiresAt: 1 })
      .explain('queryPlanner');
    expect(JSON.stringify(plan)).toContain('pending_by_expiry');
  });
});

describe('repositories', () => {
  it('locks an account atomically under concurrent failed logins', async () => {
    const repo = new UsersRepository(db, 5000);
    const user = await seedUser({ db }, { username: 'locked.user', role: 'site_engineer' });
    const now = new Date();
    const lockUntil = new Date(now.getTime() + 60_000);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repo.recordFailedLogin(user._id, { maxAttempts: 5, lockUntil, now })),
    );
    expect(results.filter((r) => r.locked)).toHaveLength(1);
    const stored = await db.collection(Collections.users).findOne({ _id: user._id });
    expect(stored?.lockedUntil).toEqual(lockUntil);
    expect(stored?.failedLoginCount).toBe(0);
  });

  it('paginates without duplicates or gaps when timestamps collide', async () => {
    const repo = new UploadsRepository(db, 5000);
    const ownerId = new ObjectId();
    const createdAt = new Date('2026-05-01T00:00:00Z');
    for (let i = 0; i < 25; i++) {
      await repo.insert({
        _id: new ObjectId(),
        ownerId,
        purpose: 'snag_photo',
        status: 'available',
        objectKey: `uploads/test/${ownerId.toHexString()}/${i}`,
        declaredContentType: 'image/png',
        declaredSize: 10,
        checksumSha256: null,
        originalFilename: 'x.png',
        size: 10,
        etag: null,
        rejectionReason: null,
        uploadUrlExpiresAt: createdAt,
        completedAt: createdAt,
        deleteRequestedAt: null,
        deletedAt: null,
        // Several documents share a timestamp to exercise the _id tie-breaker.
        createdAt: new Date(createdAt.getTime() - Math.floor(i / 3) * 1000),
        updatedAt: createdAt,
      });
    }
    const seen = new Set<string>();
    let after;
    for (;;) {
      const page = await repo.list({ ownerId, status: 'available' }, 10, after);
      for (const item of page.items) seen.add(item._id.toHexString());
      if (!page.nextCursor) break;
      const { decodeCursor } = await import('../../src/common/utils/pagination.js');
      after = decodeCursor(page.nextCursor);
    }
    expect(seen.size).toBe(25);
  });
});
