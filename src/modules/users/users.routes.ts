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
import type { UsersController } from './users.controller.js';
import {
  createUserBody,
  listUsersQuery,
  resetPasswordBody,
  updateUserBody,
  userDto,
} from './users.schema.js';

export const usersRoutes: FastifyPluginAsyncZod<{ controller: UsersController }> = (app, { controller }) => {
  const security = [{ bearerAuth: [] }];

  app.post(
    '/',
    {
      onRequest: app.requirePermission('users:manage'),
      schema: {
        tags: ['users'],
        summary: 'Create a staff user',
        security,
        headers: z.looseObject({ 'idempotency-key': idempotencyKeyHeader.optional() }),
        body: createUserBody,
        response: {
          201: dataEnvelope(userDto),
          409: errorResponse,
          422: errorResponse,
          ...commonErrorResponses,
        },
      },
    },
    controller.create,
  );

  app.get(
    '/',
    {
      onRequest: app.requirePermission('users:read'),
      schema: {
        tags: ['users'],
        summary: 'List users (newest first, cursor paginated)',
        security,
        querystring: listUsersQuery,
        response: { 200: listEnvelope(userDto), ...commonErrorResponses },
      },
    },
    controller.list,
  );

  app.get(
    '/:id',
    {
      onRequest: app.requirePermission('users:read'),
      schema: {
        tags: ['users'],
        summary: 'Get a user',
        security,
        params: idParams,
        response: { 200: dataEnvelope(userDto), 404: errorResponse, ...commonErrorResponses },
      },
    },
    controller.get,
  );

  app.patch(
    '/:id',
    {
      onRequest: app.requirePermission('users:manage'),
      schema: {
        tags: ['users'],
        summary: 'Update display name, role or status',
        description: 'Changing role or disabling a user immediately invalidates their tokens.',
        security,
        params: idParams,
        body: updateUserBody,
        response: {
          200: dataEnvelope(userDto),
          404: errorResponse,
          409: errorResponse,
          ...commonErrorResponses,
        },
      },
    },
    controller.update,
  );

  app.put(
    '/:id/password',
    {
      onRequest: app.requirePermission('users:manage'),
      schema: {
        tags: ['users'],
        summary: "Reset a user's password (signs them out everywhere)",
        security,
        params: idParams,
        body: resetPasswordBody,
        response: { 204: z.null().describe('Password reset'), 404: errorResponse, ...commonErrorResponses },
      },
    },
    controller.resetPassword,
  );

  return Promise.resolve();
};
