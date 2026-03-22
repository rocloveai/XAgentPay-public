/**
 * XAgent Core — Structured JSON Logger.
 *
 * Outputs one JSON object per line to stderr.
 * LOG_LEVEL env controls minimum level (default: "info").
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

function currentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return env in LEVELS ? (env as LogLevel) : "info";
}

function write(
  level: LogLevel,
  component: string,
  msg: string,
  ctx?: Record<string, unknown>,
): void {
  if (LEVELS[level] < LEVELS[currentLevel()]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    msg,
    ...ctx,
  };

  process.stderr.write(JSON.stringify(entry) + "\n");
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  return {
    debug: (msg, ctx) => write("debug", component, msg, ctx),
    info: (msg, ctx) => write("info", component, msg, ctx),
    warn: (msg, ctx) => write("warn", component, msg, ctx),
    error: (msg, ctx) => write("error", component, msg, ctx),
  };
}
