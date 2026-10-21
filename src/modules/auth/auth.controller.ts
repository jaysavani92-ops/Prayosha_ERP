import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { requirePrincipal } from '../../plugins/auth.js';
import type { ChangePasswordBody, LoginBody } from './auth.schema.js';
import type { AuthService } from './auth.service.js';

export const REFRESH_COOKIE = 'prayosha_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** HTTP adapter for AuthService: cookies, status codes and response shapes. */
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly config: AppConfig['auth'],
  ) {}

  login = async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const result = await this.service.login(request.body.username, request.body.password, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    this.setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt);
    return reply.status(200).send({
      data: {
        accessToken: result.accessToken,
        tokenType: 'Bearer' as const,
        expiresAt: result.accessTokenExpiresAt.toISOString(),
        user: result.user,
      },
    });
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) {
      this.clearRefreshCookie(reply);
      throw new AppError(401, ErrorCode.SESSION_INVALID, 'No active session');
    }
    try {
      const result = await this.service.refresh(token);
      this.setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt);
      return await reply.status(200).send({
        data: {
          accessToken: result.accessToken,
          tokenType: 'Bearer' as const,
          expiresAt: result.accessTokenExpiresAt.toISOString(),
        },
      });
    } catch (error) {
      this.clearRefreshCookie(reply);
      throw error;
    }
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.logout(request.cookies[REFRESH_COOKIE]);
    this.clearRefreshCookie(reply);
    return reply.status(204).send();
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ data: await this.service.me(requirePrincipal(request)) });
  };

  changePassword = async (request: FastifyRequest<{ Body: ChangePasswordBody }>, reply: FastifyReply) => {
    await this.service.changePassword(
      requirePrincipal(request),
      request.body.currentPassword,
      request.body.newPassword,
    );
    this.clearRefreshCookie(reply);
    return reply.status(204).send();
  };

  private setRefreshCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    void reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.refreshCookieSecure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
      ...(this.config.refreshCookieDomain ? { domain: this.config.refreshCookieDomain } : {}),
    });
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    void reply.clearCookie(REFRESH_COOKIE, {
      path: REFRESH_COOKIE_PATH,
      ...(this.config.refreshCookieDomain ? { domain: this.config.refreshCookieDomain } : {}),
    });
  }
}
