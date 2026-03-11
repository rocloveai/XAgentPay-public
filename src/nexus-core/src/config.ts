/**
 * xNexus Core — environment configuration.
 */

export type TransportMode = "stdio" | "http";

export interface NexusCoreConfig {
  readonly databaseUrl: string;
  readonly escrowContract: string;
  readonly chainId: number;
  readonly chainName: string;
  readonly usdcAddress: string;
  readonly usdcDecimals: number;
  readonly protocolFeeBps: number;
  readonly releaseTimeoutS: number;
  readonly disputeWindowS: number;
  readonly port: number;
  readonly rpcUrl: string;
  readonly relayerPrivateKey: string;
  readonly watcherIntervalMs: number;
  readonly timeoutSweepIntervalMs: number;
  readonly webhookRetryIntervalMs: number;
  readonly arbitrationTimeoutS: number;
  readonly portalToken: string;
  readonly baseUrl: string;
  /**
   * Optional URL of the Telegram bot service's /api/payment-notify endpoint.
   * When set, nexus-core pushes real-time payment state changes to the bot
   * so the order card (sent by Eva) updates instantly without polling.
   * e.g. https://nexus-telegram-bot-8fzu.onrender.com/api/payment-notify
   */
  readonly telegramNotifyUrl: string;
}

export interface ConfigValidationError {
  readonly field: string;
  readonly message: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function validateConfig(
  config: NexusCoreConfig,
  mode: TransportMode,
): readonly ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (mode === "http") {
    if (!config.databaseUrl) {
      errors.push({ field: "DATABASE_URL", message: "Required in HTTP mode" });
    }
    if (!config.relayerPrivateKey) {
      errors.push({
        field: "RELAYER_PRIVATE_KEY",
        message: "Required in HTTP mode",
      });
    }
    if (config.escrowContract === ZERO_ADDRESS) {
      errors.push({
        field: "ESCROW_CONTRACT",
        message: "Must not be zero address in HTTP mode",
      });
    }
  }

  if (config.protocolFeeBps < 0 || config.protocolFeeBps > 10000) {
    errors.push({
      field: "PROTOCOL_FEE_BPS",
      message: "Must be between 0 and 10000",
    });
  }

  return errors;
}

import { getAddress } from "viem";

export function loadNexusCoreConfig(): NexusCoreConfig {
  const escrowContract = process.env.ESCROW_CONTRACT ?? "0x0000000000000000000000000000000000000000";
  const usdcAddress = process.env.USDC_ADDRESS ?? "0xFF8dEe9983768D0399673014cf77826896F97e4d";

  return {
    databaseUrl: process.env.DATABASE_URL ?? "",
    escrowContract: getAddress(escrowContract),
    chainId: Number(process.env.CHAIN_ID ?? "196"),
    chainName: process.env.CHAIN_NAME ?? "XLayer Mainnet",
    usdcAddress: getAddress(usdcAddress),
    usdcDecimals: 6,
    protocolFeeBps: Number(process.env.PROTOCOL_FEE_BPS ?? "30"),
    releaseTimeoutS: Number(process.env.RELEASE_TIMEOUT_S ?? "86400"),
    disputeWindowS: Number(process.env.DISPUTE_WINDOW_S ?? "259200"),
    port: Number(process.env.PORT ?? "4000"),
    rpcUrl: process.env.RPC_URL ?? "https://rpc.xlayer.tech",
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY ?? "",
    watcherIntervalMs: Number(process.env.WATCHER_INTERVAL_MS ?? "8000"),
    timeoutSweepIntervalMs: Number(
      process.env.TIMEOUT_SWEEP_INTERVAL_MS ?? "60000",
    ),
    webhookRetryIntervalMs: Number(
      process.env.WEBHOOK_RETRY_INTERVAL_MS ?? "30000",
    ),
    arbitrationTimeoutS: Number(process.env.ARBITRATION_TIMEOUT_S ?? "604800"),
    portalToken: process.env.PORTAL_TOKEN ?? "",
    baseUrl: process.env.BASE_URL ?? "",
    telegramNotifyUrl: process.env.TELEGRAM_NOTIFY_URL ?? "",
  };
}
