import { logger } from "./logger";

type Spec<T> = {
  parse: (raw: string | undefined, key: string) => T;
  optional?: boolean;
};

/**
 * Env parsing that fails at boot rather than at first request.
 *
 * The failure mode this exists to prevent: a pod starts, passes its startup
 * probe, serves traffic, and only then discovers a missing variable on the
 * first request that needs it. The rollout looks green and the app is broken.
 * Throwing here means the container exits, the Deployment never becomes ready,
 * and the previous ReplicaSet keeps serving.
 *
 * All problems are collected before throwing, so a fresh deploy reports every
 * missing variable at once instead of one per restart.
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

  /** Falls back instead of throwing. The default is also the documentation. */
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
    // Logged as well as thrown: the throw gives a stack trace nobody wants,
    // while this line is the one that is actually readable in `kubectl logs`.
    logger.error("invalid configuration", { problems });
    throw new Error(`Invalid configuration:\n  - ${problems.join("\n  - ")}`);
  }

  return out as Config<S>;
}
