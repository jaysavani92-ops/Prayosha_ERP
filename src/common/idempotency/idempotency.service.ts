import { MongoServerError, type Collection, type Db, type ObjectId } from 'mongodb';
import { Collections } from '../../database/collections.js';
import { AppError, ErrorCode } from '../errors/app-error.js';
import { addSeconds, type Clock } from '../utils/clock.js';
import { sha256Hex } from '../utils/crypto.js';

interface IdempotencyRecord {
  _id: string;
  scope: string;
  requestHash: string;
  state: 'in_progress' | 'completed';
  response: { statusCode: number; body: unknown } | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotentResult {
  statusCode: number;
  body: unknown;
  replayed: boolean;
}

const RETENTION_SECONDS = 24 * 60 * 60;
/** An in-progress record older than this is assumed abandoned (crashed process). */
const STALE_IN_PROGRESS_MS = 60_000;

/**
 * Idempotency-Key support for non-idempotent POSTs (IETF
 * draft-ietf-httpapi-idempotency-key-header semantics):
 *  - first request with a key executes and its response is stored for 24h;
 *  - a retry with the same key and same body replays the stored response;
 *  - the same key with a different body is rejected (422);
 *  - a retry while the first is still executing gets 409 and should back off.
 * Keys are scoped per user and per operation. Failed executions are not
 * stored, so the client may retry them with the same key.
 */
export class IdempotencyService {
  private readonly collection: Collection<IdempotencyRecord>;

  constructor(
    db: Db,
    private readonly clock: Clock,
  ) {
    this.collection = db.collection<IdempotencyRecord>(Collections.idempotencyKeys);
  }

  async execute(
    params: { actorId: ObjectId; scope: string; key: string; request: unknown },
    handler: () => Promise<{ statusCode: number; body: unknown }>,
  ): Promise<IdempotentResult> {
    const id = sha256Hex(`${params.actorId.toHexString()}:${params.scope}:${params.key}`);
    const requestHash = sha256Hex(stableStringify(params.request));

    for (let attempt = 0; attempt < 2; attempt++) {
      const now = this.clock.now();
      try {
        await this.collection.insertOne({
          _id: id,
          scope: params.scope,
          requestHash,
          state: 'in_progress',
          response: null,
          createdAt: now,
          expiresAt: addSeconds(now, RETENTION_SECONDS),
        });
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
        const existing = await this.collection.findOne({ _id: id });
        if (!existing) continue; // expired between insert and read; try again
        if (existing.requestHash !== requestHash) {
          throw new AppError(
            422,
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
            'Idempotency-Key was already used with a different request body',
          );
        }
        if (existing.state === 'completed' && existing.response) {
          return { ...existing.response, replayed: true };
        }
        if (now.getTime() - existing.createdAt.getTime() > STALE_IN_PROGRESS_MS) {
          await this.collection.deleteOne({ _id: id, state: 'in_progress', createdAt: existing.createdAt });
          continue;
        }
        throw new AppError(
          409,
          ErrorCode.IDEMPOTENCY_IN_PROGRESS,
          'A request with this Idempotency-Key is in progress',
          {
            headers: { 'retry-after': '1' },
          },
        );
      }

      try {
        const response = await handler();
        await this.collection.updateOne({ _id: id }, { $set: { state: 'completed', response } });
        return { ...response, replayed: false };
      } catch (error) {
        await this.collection.deleteOne({ _id: id, state: 'in_progress' });
        throw error;
      }
    }
    throw new AppError(
      409,
      ErrorCode.IDEMPOTENCY_IN_PROGRESS,
      'Could not acquire the Idempotency-Key; retry',
      {
        headers: { 'retry-after': '1' },
      },
    );
  }
}

/** JSON with sorted object keys, so semantically equal bodies hash equally. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
