import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { hasPermission, type Permission } from '../common/constants/roles.js';
import { Errors } from '../common/errors/app-error.js';
import type { Principal } from '../common/types/principal.js';
import type { TokenService } from '../modules/auth/token.service.js';
import type { AuthStateCache } from '../modules/users/auth-state-cache.js';
import type { UsersRepository } from '../modules/users/users.repository.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
  interface FastifyInstance {
    /** onRequest hook: requires a valid access token for an active user. */
    authenticate: onRequestAsyncHookHandler;
    /** onRequest hook factory: authenticate, then require a permission. */
    requirePermission(permission: Permission): onRequestAsyncHookHandler;
  }
}

export interface AuthPluginOptions {
  tokens: TokenService;
  users: UsersRepository;
  authStateCache: AuthStateCache;
}

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

/**
 * Access tokens are verified cryptographically, then checked against the
 * user's current state (status + tokenVersion) so disabling a user, changing
 * their role or resetting their password takes effect on the next request.
 */
export const authPlugin = fp<AuthPluginOptions>(
  (app, options, done) => {
    app.decorateRequest('principal', null);

    async function resolvePrincipal(request: FastifyRequest): Promise<Principal> {
      const header = request.headers.authorization;
      const match = header ? BEARER.exec(header) : null;
      if (!match?.[1]) throw Errors.unauthenticated();
      const claims = await options.tokens.verifyAccessToken(match[1]);

      let state = await options.authStateCache.get(claims.userId);
      if (!state) {
        state = (await options.users.findAuthState(claims.userId)) ?? undefined;
        if (state) await options.authStateCache.set(state);
      }
      if (!state || state.status !== 'active' || state.tokenVersion !== claims.tokenVersion) {
        throw Errors.unauthenticated('Session is no longer valid; please sign in again');
      }
      return { userId: claims.userId, role: state.role, sessionId: claims.sessionId };
    }

    const authenticate = async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      if (request.principal) return;
      request.principal = await resolvePrincipal(request);
      request.log = request.log.child({ userId: request.principal.userId.toHexString() });
    };

    app.decorate('authenticate', authenticate);
    app.decorate('requirePermission', (permission: Permission) => {
      return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
        await authenticate(request, reply);
        if (!request.principal || !hasPermission(request.principal.role, permission))
          throw Errors.forbidden();
      };
    });
    done();
  },
  { name: 'auth' },
);

/** Narrowing helper for handlers behind `authenticate`. */
export function requirePrincipal(request: FastifyRequest): Principal {
  if (!request.principal) throw Errors.unauthenticated();
  return request.principal;
}
