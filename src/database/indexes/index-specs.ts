import type { CreateIndexesOptions, IndexSpecification } from 'mongodb';
import { Collections } from '../collections.js';

export interface IndexSpec {
  key: IndexSpecification & Record<string, 1 | -1>;
  options: CreateIndexesOptions & { name: string };
  /** The query this index exists to serve. Every index must justify itself. */
  servesQuery: string;
}

/**
 * Declared indexes, derived from the repositories' actual query shapes
 * (Equality, Sort, Range ordering). `npm run db:migrate` creates missing ones;
 * `npm run db:verify-indexes` reports drift. Indexes are never dropped
 * automatically: remove one from this list, deploy, confirm it is unused with
 * $indexStats, then drop it by hand.
 */
export const INDEX_SPECS: Record<string, IndexSpec[]> = {
  [Collections.users]: [
    {
      key: { username: 1 },
      options: { name: 'username_unique', unique: true },
      servesQuery: 'login lookup by username; uniqueness',
    },
    {
      key: { createdAt: -1, _id: -1 },
      options: { name: 'createdAt_id' },
      servesQuery: 'admin user list, newest first, keyset pagination',
    },
  ],
  [Collections.sessions]: [
    {
      key: { tokenHash: 1 },
      options: { name: 'tokenHash_unique', unique: true },
      servesQuery: 'refresh token rotation lookup',
    },
    {
      key: { previousTokenHash: 1 },
      options: {
        name: 'previousTokenHash',
        partialFilterExpression: { previousTokenHash: { $type: 'string' } },
      },
      servesQuery: 'refresh token reuse detection',
    },
    {
      key: { userId: 1 },
      options: { name: 'userId' },
      servesQuery: 'revoke all sessions of a user',
    },
    {
      key: { expiresAt: 1 },
      options: { name: 'expiresAt_ttl', expireAfterSeconds: 0 },
      servesQuery: 'TTL removal of expired sessions',
    },
  ],
  [Collections.uploads]: [
    {
      key: { objectKey: 1 },
      options: { name: 'objectKey_unique', unique: true },
      servesQuery: 'one record per S3 object; guards against key reuse',
    },
    {
      key: { ownerId: 1, status: 1, createdAt: -1, _id: -1 },
      options: { name: 'owner_status_recent' },
      servesQuery: 'list my uploads by status, newest first, keyset pagination',
    },
    {
      key: { status: 1, createdAt: -1, _id: -1 },
      options: { name: 'status_recent' },
      servesQuery: 'admin list of all uploads by status, newest first',
    },
    {
      key: { uploadUrlExpiresAt: 1 },
      options: { name: 'pending_by_expiry', partialFilterExpression: { status: 'pending' } },
      servesQuery: 'cleanup job: abandoned pending uploads past expiry',
    },
    {
      key: { deleteRequestedAt: 1 },
      options: { name: 'deleting_by_request_time', partialFilterExpression: { status: 'deleting' } },
      servesQuery: 'cleanup job: re-dispatch deletions stuck in deleting',
    },
  ],
  [Collections.idempotencyKeys]: [
    {
      key: { expiresAt: 1 },
      options: { name: 'expiresAt_ttl', expireAfterSeconds: 0 },
      servesQuery: 'TTL removal of expired idempotency records',
    },
  ],
};
