/**
 * The response envelope.
 *
 * Defined here and type-imported by @tapslab/frontend-kit, so the contract
 * lives in exactly one place. A duplicated six-line type is the kind of thing
 * that drifts silently and is then wrong in production on one side only.
 *
 * Discriminated on `ok`, so a caller that checks `if (res.ok)` gets `data`
 * narrowed and cannot reach for `error` on a success.
 */
export type ApiSuccess<T> = { ok: true; data: T };

export type ApiFailure = {
  ok: false;
  error: {
    /** Stable, machine-readable. Safe to switch on in a client. */
    code: ErrorCode;
    /** Human-readable. Safe to show a user. */
    message: string;
    /** Field-level problems, keyed by field name. */
    fields?: Record<string, string>;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The single mapping from code to status. Keeping it here rather than at each
 * throw site is what stops the same condition returning 400 in one route and
 * 422 in another.
 */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal: 500,
};

/**
 * An error that carries its own HTTP semantics, so route handlers can throw
 * from anywhere in a call stack and still produce a correct response.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fields = fields;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  static notFound(what = "Resource") {
    return new AppError("not_found", `${what} not found`);
  }

  static validation(fields: Record<string, string>, message = "Validation failed") {
    return new AppError("validation_failed", message, fields);
  }

  static unauthorized(message = "Not authenticated") {
    return new AppError("unauthorized", message);
  }

  static conflict(message: string) {
    return new AppError("conflict", message);
  }
}
