type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  return LEVELS[configured ?? "info"] ?? LEVELS.info;
}

/**
 * One JSON object per line, which is what the cluster's log collector indexes.
 * No pretty-printing variant: two code paths could disagree about what is logged.
 */
function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold()) return;
  // Fields are spread first so a caller cannot rename the level of its own
  // message: the collector indexes on these three, and an error filed as a
  // debug line is an error nobody sees.
  const line = JSON.stringify({
    ...fields,
    time: new Date().toISOString(),
    level,
    msg,
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
