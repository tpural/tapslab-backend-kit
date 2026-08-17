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
 * The /api/healthz handler the Kubernetes probes point at. Reports APP_VERSION
 * so you can tell which build a pod is running without shelling into it.
 *
 * Checks are bounded: an unbounded one turns a slow database into a liveness
 * failure, and kubelet then restarts a pod that was only waiting.
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
        // A cached response would let a proxy report a dead pod as alive.
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
