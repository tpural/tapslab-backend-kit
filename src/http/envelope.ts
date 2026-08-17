/**
 * The response envelope. Type-imported by @tpural/frontend-kit so the contract
 * has a single definition and cannot drift between the two sides.
 */
export type ApiSuccess<T> = { ok: true; data: T };

export type ApiFailure = {
  ok: false;
  error: {
    /** Stable and machine-readable; safe to switch on. */
    code: ErrorCode;
    /** Safe to show a user. */
    message: string;
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

/** Single mapping, so one condition cannot return 400 in one route and 422 in another. */
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

/** Carries its own HTTP semantics so handlers can throw from anywhere in the stack. */
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
