import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { MongoNetworkError, MongoServerError, MongoServerSelectionError } from 'mongodb';
import { AppError, ErrorCode, isAppError } from './app-error.js';

interface ErrorBody {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

function body(request: FastifyRequest, code: string, message: string, details?: unknown): ErrorBody {
  return { error: { code, message, requestId: request.id, ...(details === undefined ? {} : { details }) } };
}

/** Fastify's own client errors (bad JSON, wrong content type, body too large ...). */
const FASTIFY_CLIENT_ERRORS: Record<string, { code: ErrorCode; message: string }> = {
  FST_ERR_CTP_BODY_TOO_LARGE: { code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'Request body is too large' },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    message: 'Unsupported content type; send application/json',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: { code: ErrorCode.BAD_REQUEST, message: 'Request body must not be empty' },
  FST_ERR_CTP_INVALID_JSON_BODY: { code: ErrorCode.BAD_REQUEST, message: 'Request body is not valid JSON' },
};

export function errorHandler(
  this: FastifyInstance,
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (isAppError(error)) {
    if (error.headers) void reply.headers(error.headers);
    if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
    return reply.status(error.statusCode).send(body(request, error.code, error.message, error.details));
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const details = error.validation.map((issue) => ({ path: issue.instancePath, message: issue.message }));
    return reply
      .status(400)
      .send(
        body(request, ErrorCode.VALIDATION_FAILED, `Invalid request ${error.validationContext}`, details),
      );
  }

  if (isResponseSerializationError(error)) {
    request.log.error({ err: error, issues: error.cause.issues }, 'Response failed schema serialization');
    return reply.status(500).send(body(request, ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred'));
  }

  const fastifyError = error as FastifyError;
  const known = fastifyError.code ? FASTIFY_CLIENT_ERRORS[fastifyError.code] : undefined;
  if (known && fastifyError.statusCode !== undefined) {
    return reply.status(fastifyError.statusCode).send(body(request, known.code, known.message));
  }

  if (error instanceof MongoServerSelectionError || error instanceof MongoNetworkError) {
    request.log.error({ err: error }, 'MongoDB unavailable');
    return reply
      .status(503)
      .header('retry-after', '5')
      .send(body(request, ErrorCode.DEPENDENCY_UNAVAILABLE, 'A required service is temporarily unavailable'));
  }

  if (error instanceof MongoServerError && error.code === 11000) {
    // A unique index rejected the write and no service translated it. Treat as
    // a conflict but log it: services should map known duplicates explicitly.
    request.log.warn({ err: error }, 'Unhandled duplicate key error');
    return reply.status(409).send(body(request, ErrorCode.CONFLICT, 'The resource already exists'));
  }

  // Other Fastify 4xx errors (e.g. malformed URL encoding) are client mistakes.
  if (
    fastifyError.statusCode !== undefined &&
    fastifyError.statusCode >= 400 &&
    fastifyError.statusCode < 500
  ) {
    return reply.status(fastifyError.statusCode).send(body(request, ErrorCode.BAD_REQUEST, 'Bad request'));
  }

  request.log.error({ err: error }, 'Unhandled error');
  return reply.status(500).send(body(request, ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred'));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.status(404).send(body(request, ErrorCode.NOT_FOUND, 'Route not found'));
}

export { AppError };
