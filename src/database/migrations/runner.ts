import { MongoServerError, type Db } from 'mongodb';
import { Collections } from '../collections.js';
import { INDEX_SPECS } from '../indexes/index-specs.js';
import { COLLECTION_VALIDATORS } from '../validators.js';

export interface Migration {
  /** Monotonic, never reused, e.g. "0002-backfill-display-names". */
  id: string;
  description: string;
  up(db: Db): Promise<void>;
}

export interface MigrationLogger {
  info(message: string): void;
  warn(message: string): void;
}

const LOCK_ID = 'schema';
const LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Schema changes run as a separate deployment step (`npm run db:migrate`),
 * never at application startup, so N API replicas starting at once cannot
 * race each other and a slow index build cannot fail health checks.
 *
 * Order: collections + validators -> declared indexes -> data migrations.
 * Everything is idempotent. A lock document prevents concurrent runs.
 */
export async function runMigrations(
  db: Db,
  migrations: Migration[],
  logger: MigrationLogger,
): Promise<string[]> {
  await acquireLock(db);
  try {
    await ensureCollections(db, logger);
    await ensureIndexes(db, logger);
    return await applyDataMigrations(db, migrations, logger);
  } finally {
    await db.collection(Collections.migrationLock).deleteOne({ _id: LOCK_ID as never });
  }
}

async function acquireLock(db: Db): Promise<void> {
  const locks = db.collection<{ _id: string; acquiredAt: Date }>(Collections.migrationLock);
  const now = new Date();
  // Reclaim a lock abandoned by a crashed run.
  await locks.deleteOne({ _id: LOCK_ID, acquiredAt: { $lt: new Date(now.getTime() - LOCK_TTL_MS) } });
  try {
    await locks.insertOne({ _id: LOCK_ID, acquiredAt: now });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new Error(
        'Another migration run holds the lock; retry later or remove a stale _migration_lock document',
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}

export async function ensureCollections(db: Db, logger: MigrationLogger): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [name, validator] of Object.entries(COLLECTION_VALIDATORS)) {
    if (existing.has(name)) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
      logger.info(`validator updated: ${name}`);
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
      logger.info(`collection created: ${name}`);
    }
  }
}

export async function ensureIndexes(db: Db, logger: MigrationLogger): Promise<void> {
  for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
    if (specs.length === 0) continue;
    const created = await db
      .collection(collection)
      .createIndexes(specs.map((spec) => ({ key: spec.key, ...spec.options })));
    logger.info(`indexes ensured on ${collection}: ${created.join(', ')}`);
  }
}

async function applyDataMigrations(
  db: Db,
  migrations: Migration[],
  logger: MigrationLogger,
): Promise<string[]> {
  const ids = migrations.map((m) => m.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate migration id');
  const sorted = [...ids].sort();
  if (sorted.some((id, index) => id !== ids[index])) throw new Error('Migrations must be listed in id order');

  const history = db.collection<{ _id: string; description: string; appliedAt: Date; durationMs: number }>(
    Collections.migrations,
  );
  const applied = new Set((await history.find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    const started = Date.now();
    logger.info(`applying migration ${migration.id}: ${migration.description}`);
    await migration.up(db);
    await history.insertOne({
      _id: migration.id,
      description: migration.description,
      appliedAt: new Date(),
      durationMs: Date.now() - started,
    });
    ran.push(migration.id);
  }
  if (ran.length === 0) logger.info('no pending data migrations');
  return ran;
}

export interface IndexDrift {
  collection: string;
  missing: string[];
  unexpected: string[];
}

/** Compares declared indexes with what exists. Used by db:verify-indexes and CI. */
export async function findIndexDrift(db: Db): Promise<IndexDrift[]> {
  const drift: IndexDrift[] = [];
  for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
    let actual: string[] = [];
    try {
      actual = (await db.collection(collection).listIndexes().toArray()).map((index) =>
        String((index as { name?: unknown }).name),
      );
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 26)) throw error; // 26 = NamespaceNotFound
    }
    const declared = new Set(specs.map((spec) => spec.options.name));
    const missing = [...declared].filter((name) => !actual.includes(name));
    const unexpected = actual.filter((name) => name !== '_id_' && !declared.has(name));
    if (missing.length > 0 || unexpected.length > 0) drift.push({ collection, missing, unexpected });
  }
  return drift;
}
