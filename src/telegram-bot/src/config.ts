/**
 * Telegram Bot — Environment configuration.
 *
 * Fail-fast on missing required values.
 */

export interface TelegramBotConfig {
  readonly telegramBotToken: string;
  readonly xagentCoreUrl: string;
  readonly baseUrl: string | null;
  readonly port: number;
  /** Initial polling interval in ms (first poll after this delay) */
  readonly pollIntervalMs: number;
  /** Each subsequent poll adds this many ms to the interval */
  readonly pollBackoffMs: number;
  /** Hard cap on number of status queries per order message */
  readonly maxPollCount: number;
}

export function loadConfig(): TelegramBotConfig {
  const telegramBotToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const xagentCoreUrl = requireEnv("XAGENT_CORE_URL");
  const baseUrl = process.env.BASE_URL?.replace(/\/+$/, "") ?? null;

  return {
    telegramBotToken,
    xagentCoreUrl: xagentCoreUrl.replace(/\/+$/, ""), // strip trailing slash
    baseUrl,
    port: intEnv("PORT", 4100),
    pollIntervalMs: intEnv("POLL_INTERVAL_MS", 10_000),
    pollBackoffMs: intEnv("POLL_BACKOFF_MS", 5_000),
    maxPollCount: intEnv("MAX_POLL_COUNT", 20),
  };
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${key}: ${raw}`);
  }
  return parsed;
}
