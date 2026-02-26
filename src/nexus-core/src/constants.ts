/**
 * NexusPay Core — constants and state machine transitions.
 */
import type { PaymentStatus } from "./types.js";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * Valid state transitions for the 12-state payment machine.
 * Key = current status, Value = set of allowed target statuses.
 */
export const VALID_TRANSITIONS: ReadonlyMap<
  PaymentStatus,
  ReadonlySet<PaymentStatus>
> = new Map<PaymentStatus, ReadonlySet<PaymentStatus>>([
  ["CREATED", new Set(["AWAITING_TX", "ESCROWED", "EXPIRED", "RISK_REJECTED"])],
  [
    "AWAITING_TX",
    new Set(["BROADCASTED", "TX_FAILED", "EXPIRED", "RISK_REJECTED"]),
  ],
  [
    "BROADCASTED",
    new Set(["SETTLED", "ESCROWED", "TX_FAILED", "RISK_REJECTED"]),
  ],
  ["SETTLED", new Set(["COMPLETED"])],
  ["COMPLETED", new Set()],
  ["EXPIRED", new Set()],
  ["TX_FAILED", new Set()],
  ["RISK_REJECTED", new Set()],
  // Escrow-specific
  ["ESCROWED", new Set(["SETTLED", "REFUNDED", "DISPUTE_OPEN"])],
  ["REFUNDED", new Set()],
  ["DISPUTE_OPEN", new Set(["DISPUTE_RESOLVED"])],
  ["DISPUTE_RESOLVED", new Set()],
]);

/** Terminal statuses — no further transitions possible */
export const TERMINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "COMPLETED",
  "EXPIRED",
  "TX_FAILED",
  "RISK_REJECTED",
  "REFUNDED",
  "DISPUTE_RESOLVED",
]);

/** All 12 payment statuses */
export const ALL_STATUSES: readonly PaymentStatus[] = [
  "CREATED",
  "AWAITING_TX",
  "BROADCASTED",
  "SETTLED",
  "COMPLETED",
  "EXPIRED",
  "TX_FAILED",
  "RISK_REJECTED",
  "ESCROWED",
  "REFUNDED",
  "DISPUTE_OPEN",
  "DISPUTE_RESOLVED",
];

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

/** Max time in AWAITING_TX before auto-expiry (30 minutes) */
export const AWAITING_TX_TIMEOUT_MS = 30 * 60 * 1000;

/** Default escrow release deadline (24 hours) */
export const DEFAULT_RELEASE_TIMEOUT_S = 24 * 60 * 60;

/** Default escrow dispute window (72 hours) */
export const DEFAULT_DISPUTE_WINDOW_S = 72 * 60 * 60;

/** Arbitration timeout (7 days) */
export const ARBITRATION_TIMEOUT_S = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Chain constants
// ---------------------------------------------------------------------------

/** PlatON mainnet chain ID */
export const PLATON_CHAIN_ID = 20250407;

/** PlatON devnet chain ID */
export const PLATON_DEVNET_CHAIN_ID = 20250407;

/** PlatON devnet RPC URL */
export const PLATON_DEVNET_RPC_URL =
  "https://devnet3openapi.platon.network/rpc";

/** USDC contract address on PlatON devnet (bech32: lat19wan5842fdd7ahj20vhzhwasxugqvz3k2qtk50) */
export const PLATON_DEVNET_USDC_ADDRESS =
  "0xFF8dEe9983768D0399673014cf77826896F97e4d" as const;

/** USDC decimals */
export const USDC_DECIMALS = 6;

/** Protocol fee in basis points (0.3%) */
export const PROTOCOL_FEE_BPS = 30;

// ---------------------------------------------------------------------------
// Webhook constants
// ---------------------------------------------------------------------------

/** Maximum webhook delivery attempts */
export const WEBHOOK_MAX_ATTEMPTS = 6;

/** Retry delays in milliseconds (exponential backoff) */
export const WEBHOOK_RETRY_DELAYS_MS: readonly number[] = [
  10_000, // 10s
  30_000, // 30s
  120_000, // 2min
  600_000, // 10min
  1_800_000, // 30min
];
