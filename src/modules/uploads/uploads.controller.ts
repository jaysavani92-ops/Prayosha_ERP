import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ObjectId } from 'mongodb';
import type { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { requirePrincipal } from '../../plugins/auth.js';
import type { CreateUploadInput, ListUploadsQuery } from './uploads.schema.js';
import type { UploadsService } from './uploads.service.js';

type WithId = { Params: { id: ObjectId } };

export class UploadsController {
  constructor(
    private readonly service: UploadsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateUploadInput; Headers: { 'idempotency-key'?: string | undefined } }>,
    reply: FastifyReply,
  ) => {
    const actor = requirePrincipal(request);
    const run = async () => ({
      statusCode: 201,
      body: { data: await this.service.createUpload(actor, request.body) },
    });
    const key = request.headers['idempotency-key'];
    if (!key) {
      const result = await run();
      return reply.status(result.statusCode).send(result.body);
    }
    // A replay returns the original presigned URL, which may have expired;
    // clients should then create a new upload with a new key.
    const result = await this.idempotency.execute(
      { actorId: actor.userId, scope: 'uploads.create', key, request: request.body },
      run,
    );
    if (result.replayed) void reply.header('idempotent-replayed', 'true');
    return reply.status(result.statusCode).send(result.body);
  };

  complete = async (request: FastifyRequest<WithId>, reply: FastifyReply) => {
    return reply.send({
      data: await this.service.completeUpload(requirePrincipal(request), request.params.id),
    });
  };

  get = async (request: FastifyRequest<WithId>, reply: FastifyReply) => {
    return reply.send({ data: await this.service.getUpload(requirePrincipal(request), request.params.id) });
  };

  list = async (request: FastifyRequest<{ Querystring: ListUploadsQuery }>, reply: FastifyReply) => {
    const page = await this.service.listUploads(requirePrincipal(request), request.query);
    return reply.send({
      data: page.items,
      page: { nextCursor: page.nextCursor, limit: request.query.limit },
    });
  };

  downloadUrl = async (request: FastifyRequest<WithId>, reply: FastifyReply) => {
    const result = await this.service.createDownloadUrl(requirePrincipal(request), request.params.id);
    return reply.header('cache-control', 'no-store').send({ data: result });
  };

  remove = async (request: FastifyRequest<WithId>, reply: FastifyReply) => {
    const upload = await this.service.deleteUpload(requirePrincipal(request), request.params.id);
    return reply.status(202).send({ data: upload });
  };
}
