import { logger } from "./logger";

export type HealthCheck = {
  name: string;
  /** Resolve for healthy, throw or return false for unhealthy. */
  check: () => Promise<boolean | void> | boolean | void;
};

export type HealthOptions = {
  /** Baked in by the Dockerfile from the git tag. */
  version?: string;
  /** Dependencies to probe. Keep these cheap -- liveness hits this often. */
  checks?: HealthCheck[];
  /** Per-check timeout. Must stay under the probe's own timeout. */
  timeoutMs?: number;
};

/**
 * Builds the /api/healthz handler that the Kubernetes probes point at.
 *
 * Reports APP_VERSION, so you can tell which build a pod is actually running
 * without shelling into it -- the thing you always want at exactly the moment
 * it is most annoying to get.
 *
 * Checks are bounded by a timeout because an unbounded dependency check turns
 * a slow database into a liveness failure, and kubelet then restarts a pod that
 * was merely waiting. Failing fast and reporting `degraded` is more useful than
 * hanging until the probe's own deadline.
 *
 *   export const GET = createHealthHandler({ version: process.env.APP_VERSION });
 */
export function createHealthHandler(options: HealthOptions = {}) {
  const { version = process.env.APP_VERSION ?? "dev", checks = [], timeoutMs = 2000 } = options;
  const startedAt = Date.now();

  return async function GET(): Promise<Response> {
    const results = await Promise.all(
      checks.map(async (c) => {
        try {
          const outcome = await withTimeout(c.check(), timeoutMs, c.name);
          return { name: c.name, ok: outcome !== false };
        } catch (error) {
          logger.warn("health check failed", {
            check: c.name,
            error: error instanceof Error ? error.message : String(error),
          });
          return { name: c.name, ok: false };
        }
      }),
    );

    const healthy = results.every((r) => r.ok);

    return Response.json(
      {
        status: healthy ? "ok" : "degraded",
        version,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        ...(results.length ? { checks: results } : {}),
      },
      {
        status: healthy ? 200 : 503,
        // A cached health response would let a proxy keep reporting a dead pod
        // as alive, which defeats the entire point of the endpoint.
        headers: { "cache-control": "no-store" },
      },
    );
  };
}

async function withTimeout<T>(value: Promise<T> | T, ms: number, name: string): Promise<T> {
  if (!(value instanceof Promise)) return value;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`health check "${name}" timed out`)), ms);
  });
  try {
    return await Promise.race([value, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
