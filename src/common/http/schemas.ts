import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../utils/pagination.js';

/** 24-char hex string, converted to an ObjectId after validation. */
export const objectIdParam = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Must be a 24 character hex id')
  .transform((value) => new ObjectId(value));

export const idParams = z.object({ id: objectIdParam }).strict();

export const paginationQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    cursor: z.string().min(1).max(256).optional(),
  })
  .strict();

export const pageInfo = z.object({
  nextCursor: z.string().nullable(),
  limit: z.number().int(),
});

export const errorResponse = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'ErrorResponse' });

export function dataEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}

export function listEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: z.array(schema), page: pageInfo });
}

/** Standard error responses documented on every authenticated route. */
export const commonErrorResponses = {
  400: errorResponse,
  401: errorResponse,
  403: errorResponse,
  429: errorResponse,
  500: errorResponse,
  503: errorResponse,
} as const;

export const idempotencyKeyHeader = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_\-:.]+$/, 'Idempotency-Key may contain only letters, digits and _ - : .');
