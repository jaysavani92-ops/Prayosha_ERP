import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { commonErrorResponses, errorResponse } from '../../common/http/schemas.js';
import type { AuthController } from './auth.controller.js';
import { changePasswordBody, loginBody, loginResponse, meResponse, refreshResponse } from './auth.schema.js';

export interface AuthRoutesOptions {
  controller: AuthController;
  loginRateLimit: { max: number; timeWindow: number };
}

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = (app, { controller, loginRateLimit }) => {
  app.post(
    '/login',
    {
      config: { rateLimit: loginRateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Sign in with username and password',
        description:
          'Returns a short-lived access token and sets the refresh token as an httpOnly cookie scoped to /api/v1/auth.',
        body: loginBody,
        response: { 200: loginResponse, 423: errorResponse, ...commonErrorResponses },
      },
    },
    controller.login,
  );

  app.post(
    '/refresh',
    {
      config: { rateLimit: { max: loginRateLimit.max * 3, timeWindow: loginRateLimit.timeWindow } },
      schema: {
        tags: ['auth'],
        summary: 'Rotate the refresh cookie and issue a new access token',
        response: { 200: refreshResponse, ...commonErrorResponses },
      },
    },
    controller.refresh,
  );

  app.post(
    '/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke the current session',
        response: { 204: z.null().describe('Signed out'), ...commonErrorResponses },
      },
    },
    controller.logout,
  );

  app.get(
    '/me',
    {
      onRequest: app.authenticate,
      schema: {
        tags: ['auth'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        response: { 200: meResponse, ...commonErrorResponses },
      },
    },
    controller.me,
  );

  app.put(
    '/password',
    {
      onRequest: app.authenticate,
      config: { rateLimit: loginRateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Change own password (signs out every session)',
        security: [{ bearerAuth: [] }],
        body: changePasswordBody,
        response: { 204: z.null().describe('Password changed'), ...commonErrorResponses },
      },
    },
    controller.changePassword,
  );

  return Promise.resolve();
};
