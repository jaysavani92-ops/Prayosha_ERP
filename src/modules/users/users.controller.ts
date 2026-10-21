import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ObjectId } from 'mongodb';
import type { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { requirePrincipal } from '../../plugins/auth.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema.js';
import type { UsersService } from './users.service.js';

type WithId = { Params: { id: ObjectId } };

export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly idempotency: IdempotencyService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateUserInput; Headers: { 'idempotency-key'?: string | undefined } }>,
    reply: FastifyReply,
  ) => {
    const actor = requirePrincipal(request);
    const key = request.headers['idempotency-key'];
    const run = async () => ({
      statusCode: 201,
      body: { data: await this.service.createUser(actor, request.body) },
    });
    if (!key) {
      const result = await run();
      return reply.status(result.statusCode).send(result.body);
    }
    // The password is excluded from the stored request fingerprint: an
    // unsalted digest of a weak password would be crackable.
    const result = await this.idempotency.execute(
      {
        actorId: actor.userId,
        scope: 'users.create',
        key,
        request: { ...request.body, password: undefined },
      },
      run,
    );
    if (result.replayed) void reply.header('idempotent-replayed', 'true');
    return reply.status(result.statusCode).send(result.body);
  };

  list = async (request: FastifyRequest<{ Querystring: ListUsersQuery }>, reply: FastifyReply) => {
    const page = await this.service.listUsers(request.query);
    return reply.send({
      data: page.items,
      page: { nextCursor: page.nextCursor, limit: request.query.limit },
    });
  };

  get = async (request: FastifyRequest<WithId>, reply: FastifyReply) => {
    return reply.send({ data: await this.service.getUser(request.params.id) });
  };

  update = async (request: FastifyRequest<WithId & { Body: UpdateUserInput }>, reply: FastifyReply) => {
    const user = await this.service.updateUser(requirePrincipal(request), request.params.id, request.body);
    return reply.send({ data: user });
  };

  resetPassword = async (
    request: FastifyRequest<WithId & { Body: { newPassword: string } }>,
    reply: FastifyReply,
  ) => {
    await this.service.resetPassword(requirePrincipal(request), request.params.id, request.body.newPassword);
    return reply.status(204).send();
  };
}
