/**
 * Telegram Bot — Environment configuration.
 *
 * Fail-fast on missing required values.
 */

export interface TelegramBotConfig {
  readonly telegramBotToken: string;
  readonly nexusCoreUrl: string;
  readonly baseUrl: string | null;
  readonly port: number;
  readonly pollIntervalMs: number;
  readonly maxPollDurationMs: number;
}

export function loadConfig(): TelegramBotConfig {
  const telegramBotToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const nexusCoreUrl = requireEnv("NEXUS_CORE_URL");
  const baseUrl = process.env.BASE_URL?.replace(/\/+$/, "") ?? null;

  return {
    telegramBotToken,
    nexusCoreUrl: nexusCoreUrl.replace(/\/+$/, ""), // strip trailing slash
    baseUrl,
    port: intEnv("PORT", 4100),
    pollIntervalMs: intEnv("POLL_INTERVAL_MS", 10_000),
    maxPollDurationMs: intEnv("MAX_POLL_DURATION_MS", 3_600_000),
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
