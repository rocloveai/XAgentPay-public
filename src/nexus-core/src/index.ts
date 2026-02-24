/**
 * NexusPay Core — barrel export.
 */

// Types
export type {
  Address,
  Hex,
  PaymentStatus,
  PaymentMethod,
  PaymentEventType,
  WebhookEventType,
  LineItem,
  IsoMetadata,
  NexusQuotePayload,
  PaymentRecord,
  PaymentEvent,
  MerchantRecord,
  WebhookDeliveryLog,
  PaymentInstruction,
  EIP3009SignData,
  EscrowInstruction,
  WebhookPayload,
  CreatePaymentParams,
  CreateEventParams,
  CreateWebhookLogParams,
} from "./types.js";

// Constants
export {
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  ALL_STATUSES,
  AWAITING_TX_TIMEOUT_MS,
  DEFAULT_RELEASE_TIMEOUT_S,
  DEFAULT_DISPUTE_WINDOW_S,
  ARBITRATION_TIMEOUT_S,
  PLATON_CHAIN_ID,
  USDC_DECIMALS,
  PROTOCOL_FEE_BPS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
} from "./constants.js";

// Errors
export {
  NexusError,
  SecurityError,
  InvalidTransitionError,
  RelayerError,
  ChainError,
} from "./errors.js";

// Repository interfaces
export type {
  PaymentRepository,
  EventRepository,
  MerchantRepository,
  WebhookRepository,
} from "./db/interfaces/index.js";

// Concrete repositories
export { NeonPaymentRepository } from "./db/payment-repo.js";
export { NeonEventRepository } from "./db/event-repo.js";
export { NeonMerchantRepository } from "./db/merchant-repo.js";
export { NeonWebhookRepository } from "./db/webhook-repo.js";

// Pool
export { initPool, getPool, isPoolInitialized } from "./db/pool.js";
