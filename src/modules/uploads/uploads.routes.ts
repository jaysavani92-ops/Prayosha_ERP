import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  commonErrorResponses,
  dataEnvelope,
  errorResponse,
  idParams,
  idempotencyKeyHeader,
  listEnvelope,
} from '../../common/http/schemas.js';
import type { UploadsController } from './uploads.controller.js';
import {
  createUploadBody,
  createUploadResponse,
  downloadUrlResponse,
  listUploadsQuery,
  uploadDto,
} from './uploads.schema.js';

export const uploadsRoutes: FastifyPluginAsyncZod<{ controller: UploadsController }> = (
  app,
  { controller },
) => {
  const security = [{ bearerAuth: [] }];

  app.post(
    '/',
    {
      onRequest: app.requirePermission('uploads:create'),
      schema: {
        tags: ['uploads'],
        summary: 'Request a presigned upload URL',
        description:
          'Creates a pending upload and returns a short-lived presigned PUT URL. Send the file to that URL with ' +
          'exactly the returned headers, then call POST /uploads/{id}/complete.',
        security,
        headers: z.looseObject({ 'idempotency-key': idempotencyKeyHeader.optional() }),
        body: createUploadBody,
        response: {
          201: createUploadResponse,
          409: errorResponse,
          413: errorResponse,
          415: errorResponse,
          422: errorResponse,
          ...commonErrorResponses,
        },
      },
    },
    controller.create,
  );

  app.post(
    '/:id/complete',
    {
      onRequest: app.requirePermission('uploads:create'),
      schema: {
        tags: ['uploads'],
        summary: 'Verify the uploaded object and mark the upload available',
        security,
        params: idParams,
        response: {
          200: dataEnvelope(uploadDto),
          404: errorResponse,
          409: errorResponse,
          422: errorResponse,
          ...commonErrorResponses,
        },
      },
    },
    controller.complete,
  );

  app.get(
    '/',
    {
      onRequest: app.requirePermission('uploads:read:own'),
      schema: {
        tags: ['uploads'],
        summary: 'List uploads (newest first, cursor paginated)',
        security,
        querystring: listUploadsQuery,
        response: { 200: listEnvelope(uploadDto), ...commonErrorResponses },
      },
    },
    controller.list,
  );

  app.get(
    '/:id',
    {
      onRequest: app.requirePermission('uploads:read:own'),
      schema: {
        tags: ['uploads'],
        summary: 'Get upload metadata',
        security,
        params: idParams,
        response: { 200: dataEnvelope(uploadDto), 404: errorResponse, ...commonErrorResponses },
      },
    },
    controller.get,
  );

  app.post(
    '/:id/download-url',
    {
      onRequest: app.requirePermission('uploads:read:own'),
      schema: {
        tags: ['uploads'],
        summary: 'Create a short-lived presigned download URL',
        security,
        params: idParams,
        response: {
          200: downloadUrlResponse,
          404: errorResponse,
          409: errorResponse,
          ...commonErrorResponses,
        },
      },
    },
    controller.downloadUrl,
  );

  app.delete(
    '/:id',
    {
      onRequest: app.requirePermission('uploads:delete:own'),
      schema: {
        tags: ['uploads'],
        summary: 'Delete an upload (object removal is asynchronous)',
        security,
        params: idParams,
        response: { 202: dataEnvelope(uploadDto), 404: errorResponse, ...commonErrorResponses },
      },
    },
    controller.remove,
  );

  return Promise.resolve();
};
