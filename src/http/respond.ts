import { AppError, type ApiResponse, type ErrorCode, STATUS_BY_CODE } from "./envelope";
import { logger } from "../runtime/logger";

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>, {
    status: 200,
    ...init,
  });
}

export function created<T>(data: T): Response {
  return ok(data, { status: 201 });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function err(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): Response {
  return Response.json(
    { ok: false, error: { code, message, ...(fields ? { fields } : {}) } } satisfies ApiResponse<never>,
    { status: STATUS_BY_CODE[code] },
  );
}

/**
 * An unexpected error logs its real cause but returns a generic message:
 * echoing `error.message` is how stack traces and SQL reach a browser.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    // Expected and handled, so info rather than error keeps real failures visible.
    logger.info("request rejected", { code: error.code, message: error.message });
    return err(error.code, error.message, error.fields);
  }

  logger.error("unhandled error", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return err("internal", "Something went wrong");
}

/**
 *   export const POST = handler(async (req) => {
 *     const body = await req.json();
 *     if (!body.title) throw AppError.validation({ title: "Required" });
 *     return created(await repo.create(body));
 *   });
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
