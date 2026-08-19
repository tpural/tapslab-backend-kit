import { AppError } from "./envelope";
import { logger } from "../runtime/logger";

/**
 * Bearer guard for /api/jobs/*. Scheduled work runs as CronJobs curling these
 * routes rather than as in-process timers, so restarts cannot silently skip a
 * run -- but that leaves the endpoints reachable, hence the shared secret.
 *
 *   export const POST = handler(withJobAuth(async () => {
 *     await materialise();
 *     return ok({ done: true });
 *   }));
 */
export function withJobAuth<Args extends unknown[]>(
  fn: (request: Request, ...rest: Args) => Promise<Response>,
  secret: string | undefined = process.env.CRON_SECRET,
): (request: Request, ...rest: Args) => Promise<Response> {
  return async (request, ...rest) => {
    if (!secret) {
      // Refuse rather than allow: a missing secret must not open the endpoint.
      logger.error("CRON_SECRET is not set; refusing job request");
      throw new AppError("internal", "Job authentication is not configured");
    }

    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!timingSafeEqual(token, secret)) {
      logger.warn("rejected job request", { path: new URL(request.url).pathname });
      throw AppError.unauthorized("Invalid job token");
    }

    return fn(request, ...rest);
  };
}

/**
 * Constant-time over the shared length, which is what stops `===` leaking the
 * secret's prefix a character at a time. Length itself still leaks, exactly as
 * it does in node's own `crypto.timingSafeEqual`, which rejects mismatched
 * lengths outright.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
