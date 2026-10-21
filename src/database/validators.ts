import type { Document } from 'mongodb';
import { ROLES } from '../common/constants/roles.js';
import { UPLOAD_PURPOSES, UPLOAD_STATUSES } from '../modules/uploads/upload-policy.js';
import { USER_STATUSES } from '../modules/users/users.types.js';
import { Collections } from './collections.js';

/**
 * Server-side $jsonSchema validators. They are a second line of defence behind
 * Zod request validation: they stop a bug or a manual mongosh session from
 * writing structurally invalid documents. Keep them in sync with the
 * TypeScript document types in each module's *.types.ts file.
 *
 * Applied idempotently by `npm run db:migrate` (collMod on existing collections).
 */
const objectId = { bsonType: 'objectId' };
const date = { bsonType: 'date' };
const nullableDate = { bsonType: ['date', 'null'] };

export const COLLECTION_VALIDATORS: Record<string, Document> = {
  [Collections.users]: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        '_id',
        'username',
        'displayName',
        'role',
        'status',
        'passwordHash',
        'tokenVersion',
        'failedLoginCount',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        username: { bsonType: 'string', pattern: '^[a-z0-9._-]{3,32}$' },
        displayName: { bsonType: 'string', minLength: 1, maxLength: 100 },
        role: { enum: [...ROLES] },
        status: { enum: [...USER_STATUSES] },
        passwordHash: { bsonType: 'string', minLength: 20 },
        passwordChangedAt: date,
        tokenVersion: { bsonType: 'int', minimum: 0 },
        failedLoginCount: { bsonType: 'int', minimum: 0 },
        lockedUntil: nullableDate,
        lastLoginAt: nullableDate,
        createdBy: { bsonType: ['objectId', 'null'] },
        createdAt: date,
        updatedAt: date,
      },
    },
  },
  [Collections.sessions]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'userId', 'tokenHash', 'tokenVersion', 'createdAt', 'lastRotatedAt', 'expiresAt'],
      additionalProperties: false,
      properties: {
        _id: objectId,
        userId: objectId,
        tokenHash: { bsonType: 'string', minLength: 64, maxLength: 64 },
        previousTokenHash: { bsonType: ['string', 'null'] },
        tokenVersion: { bsonType: 'int', minimum: 0 },
        createdAt: date,
        lastRotatedAt: date,
        expiresAt: date,
        revokedAt: nullableDate,
        revokedReason: { bsonType: ['string', 'null'], maxLength: 64 },
        userAgent: { bsonType: ['string', 'null'], maxLength: 256 },
        ip: { bsonType: ['string', 'null'], maxLength: 64 },
      },
    },
  },
  [Collections.uploads]: {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        '_id',
        'ownerId',
        'purpose',
        'status',
        'objectKey',
        'declaredContentType',
        'declaredSize',
        'originalFilename',
        'uploadUrlExpiresAt',
        'createdAt',
        'updatedAt',
      ],
      additionalProperties: false,
      properties: {
        _id: objectId,
        ownerId: objectId,
        purpose: { enum: [...UPLOAD_PURPOSES] },
        status: { enum: [...UPLOAD_STATUSES] },
        objectKey: { bsonType: 'string', minLength: 1, maxLength: 512 },
        declaredContentType: { bsonType: 'string', maxLength: 100 },
        declaredSize: { bsonType: ['int', 'long'], minimum: 1 },
        checksumSha256: { bsonType: ['string', 'null'], maxLength: 64 },
        originalFilename: { bsonType: 'string', maxLength: 255 },
        size: { bsonType: ['int', 'long', 'null'] },
        etag: { bsonType: ['string', 'null'], maxLength: 128 },
        rejectionReason: { bsonType: ['string', 'null'], maxLength: 200 },
        uploadUrlExpiresAt: date,
        completedAt: nullableDate,
        deleteRequestedAt: nullableDate,
        deletedAt: nullableDate,
        createdAt: date,
        updatedAt: date,
      },
    },
  },
  [Collections.idempotencyKeys]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'scope', 'requestHash', 'state', 'createdAt', 'expiresAt'],
      additionalProperties: false,
      properties: {
        _id: { bsonType: 'string' },
        scope: { bsonType: 'string', maxLength: 128 },
        requestHash: { bsonType: 'string', minLength: 64, maxLength: 64 },
        state: { enum: ['in_progress', 'completed'] },
        response: {
          bsonType: ['object', 'null'],
          required: ['statusCode', 'body'],
          properties: { statusCode: { bsonType: 'int' }, body: {} },
        },
        createdAt: date,
        expiresAt: date,
      },
    },
  },
};
