import { logger } from "./logger";

type Spec<T> = {
  parse: (raw: string | undefined, key: string) => T;
  optional?: boolean;
};

/**
 * Fails at boot rather than at first request: otherwise a pod passes its startup
 * probe, serves traffic, and only then hits the missing variable -- a green
 * rollout in front of a broken app. Throwing keeps the old ReplicaSet serving.
 *
 * Collects every problem before throwing, so a bad deploy is one fix, not one
 * per restart.
 */
export const env = {
  string(): Spec<string> {
    return {
      parse: (raw, key) => {
        if (raw === undefined || raw === "") throw new Error(`${key} is required`);
        return raw;
      },
    };
  },

  number(): Spec<number> {
    return {
      parse: (raw, key) => {
        if (raw === undefined || raw === "") throw new Error(`${key} is required`);
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`${key} must be a number, got "${raw}"`);
        return n;
      },
    };
  },

  boolean(): Spec<boolean> {
    return {
      parse: (raw, key) => {
        if (raw === undefined || raw === "") throw new Error(`${key} is required`);
        if (["1", "true", "yes"].includes(raw.toLowerCase())) return true;
        if (["0", "false", "no"].includes(raw.toLowerCase())) return false;
        throw new Error(`${key} must be a boolean, got "${raw}"`);
      },
    };
  },

  enum<const T extends readonly string[]>(values: T): Spec<T[number]> {
    return {
      parse: (raw, key) => {
        if (raw === undefined || raw === "") throw new Error(`${key} is required`);
        if (!values.includes(raw)) {
          throw new Error(`${key} must be one of ${values.join(", ")}, got "${raw}"`);
        }
        return raw as T[number];
      },
    };
  },

  /** Falls back instead of throwing. */
  withDefault<T>(spec: Spec<T>, fallback: T): Spec<T> {
    return {
      optional: true,
      parse: (raw, key) => (raw === undefined || raw === "" ? fallback : spec.parse(raw, key)),
    };
  },
};

export type ConfigShape = Record<string, Spec<unknown>>;

export type Config<S extends ConfigShape> = {
  [K in keyof S]: S[K] extends Spec<infer T> ? T : never;
};

export function loadConfig<S extends ConfigShape>(
  shape: S,
  source: NodeJS.ProcessEnv = process.env,
): Config<S> {
  const out: Record<string, unknown> = {};
  const problems: string[] = [];

  for (const [key, spec] of Object.entries(shape)) {
    try {
      out[key] = spec.parse(source[key], key);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (problems.length) {
    // Logged as well as thrown -- this is the readable line in `kubectl logs`.
    logger.error("invalid configuration", { problems });
    throw new Error(`Invalid configuration:\n  - ${problems.join("\n  - ")}`);
  }

  return out as Config<S>;
}
