import { AppError } from "./envelope";
import { logger } from "../runtime/logger";

/**
 * Bearer-token guard for /api/jobs/* endpoints.
 *
 * Scheduled work runs as Kubernetes CronJobs that curl these routes, rather
 * than as timers inside the app process: restarts and rollouts cannot then
 * silently skip a run, and any job can be triggered by hand with a single
 * `kubectl create job --from=`. The tradeoff is that the endpoints are
 * reachable, so they need a shared secret.
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
      // Refuse rather than allow. A missing secret in production must not
      // quietly open the endpoint to the internet.
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
 * Constant-time comparison. `===` on secrets leaks their length and, in
 * principle, a prefix through timing. The cost here is a few microseconds, so
 * there is no reason to take the risk even on an internal endpoint.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
