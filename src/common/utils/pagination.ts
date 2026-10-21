import { ObjectId, type Filter, type Document } from 'mongodb';
import { z } from 'zod';
import { AppError, ErrorCode } from '../errors/app-error.js';

/**
 * Keyset (cursor) pagination over a fixed (createdAt desc, _id desc) ordering.
 * Cursors are opaque to clients. They contain no secrets, so they are encoded,
 * not signed; tampering can only move a client to a different page of data it
 * is already allowed to read, because the authorisation filter is applied
 * separately by the repository.
 */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export interface CursorPosition {
  createdAt: Date;
  id: ObjectId;
}

const cursorPayload = z.object({ c: z.iso.datetime(), i: z.string().regex(/^[a-f0-9]{24}$/) }).strict();

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(
    JSON.stringify({ c: position.createdAt.toISOString(), i: position.id.toHexString() }),
  ).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  try {
    const json: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const payload = cursorPayload.parse(json);
    return { createdAt: new Date(payload.c), id: new ObjectId(payload.i) };
  } catch {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Invalid pagination cursor');
  }
}

/** Filter selecting documents strictly after `position` in (createdAt desc, _id desc) order. */
export function afterCursorFilter<T extends Document>(position: CursorPosition | undefined): Filter<T> {
  if (!position) return {};
  return {
    $or: [
      { createdAt: { $lt: position.createdAt } },
      { createdAt: position.createdAt, _id: { $lt: position.id } },
    ],
  } as Filter<T>;
}

export const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Repositories fetch `limit + 1` rows; the extra row only signals that another
 * page exists and is never returned.
 */
export function toPage<T extends { _id: ObjectId; createdAt: Date }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last._id }) : null,
  };
}
