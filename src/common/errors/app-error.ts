/**
 * Stable, machine-readable error codes. Clients branch on `code`, never on
 * `message`. Adding a code is safe; renaming or removing one is a breaking change.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  SESSION_INVALID: 'SESSION_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  UPLOAD_VERIFICATION_FAILED: 'UPLOAD_VERIFICATION_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_BUSY: 'SERVICE_BUSY',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppErrorOptions {
  details?: unknown;
  cause?: unknown;
  headers?: Record<string, string>;
}

/**
 * An error whose message is safe to show to API clients. Anything that is not
 * an AppError is treated as an unexpected failure and returned as a generic 500.
 */
export class AppError extends Error {
  readonly details: unknown;
  readonly headers: Record<string, string> | undefined;

  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.details = options.details;
    this.headers = options.headers;
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown) =>
    new AppError(400, ErrorCode.BAD_REQUEST, message, { details }),
  unauthenticated: (message = 'Authentication required') =>
    new AppError(401, ErrorCode.UNAUTHENTICATED, message),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, ErrorCode.FORBIDDEN, message),
  notFound: (resource: string) => new AppError(404, ErrorCode.NOT_FOUND, `${resource} not found`),
  conflict: (message: string, details?: unknown) =>
    new AppError(409, ErrorCode.CONFLICT, message, { details }),
  invalidState: (message: string, details?: unknown) =>
    new AppError(409, ErrorCode.INVALID_STATE, message, { details }),
  serviceBusy: (retryAfterSeconds = 2) =>
    new AppError(503, ErrorCode.SERVICE_BUSY, 'The service is busy, please retry shortly', {
      headers: { 'retry-after': String(retryAfterSeconds) },
    }),
  dependencyUnavailable: (dependency: string, cause?: unknown) =>
    new AppError(503, ErrorCode.DEPENDENCY_UNAVAILABLE, 'A required service is temporarily unavailable', {
      details: { dependency },
      cause,
      headers: { 'retry-after': '5' },
    }),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
