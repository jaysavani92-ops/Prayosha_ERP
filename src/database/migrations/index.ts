import type { Migration } from './runner.js';

/**
 * Ordered data migrations. Collections, validators and indexes are declarative
 * (see ../validators.ts and ../indexes/index-specs.ts) and need no entry here.
 *
 * Add a migration only to transform existing data. Rules:
 *  - ids are zero-padded and strictly increasing: "0001-...", "0002-...".
 *  - never edit or delete a migration that has run anywhere.
 *  - process large collections in bounded batches (find with a limit, bulkWrite).
 *  - make `up` safe to re-run after a partial failure.
 */
export const MIGRATIONS: Migration[] = [];
