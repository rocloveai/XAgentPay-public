/**
 * xNexus Core — barrel export.
 */

// Types
export type {
  Address,
  Hex,
  PaymentStatus,
  PaymentMethod,
  PaymentEventType,
  WebhookEventType,
  PaymentGroupStatus,
  LineItem,
  IsoMetadata,
  NexusQuotePayload,
  PaymentRecord,
  PaymentEvent,
  MerchantRecord,
  WebhookDeliveryLog,
  PaymentGroupRecord,
  CreateGroupParams,
  GroupEscrowInstruction,
  GroupPaymentDetail,
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
  PLATON_DEVNET_CHAIN_ID,
  PLATON_DEVNET_RPC_URL,
  PLATON_DEVNET_USDC_ADDRESS,
  USDC_DECIMALS,
  PROTOCOL_FEE_BPS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_DELAYS_MS,
} from "./constants.js";

// Config
export type { NexusCoreConfig } from "./config.js";
export { loadNexusCoreConfig } from "./config.js";

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
  GroupRepository,
} from "./db/interfaces/index.js";

// Concrete repositories
export { NeonPaymentRepository } from "./db/payment-repo.js";
export { NeonEventRepository } from "./db/event-repo.js";
export { NeonMerchantRepository } from "./db/merchant-repo.js";
export { NeonWebhookRepository } from "./db/webhook-repo.js";
export { NeonGroupRepository } from "./db/group-repo.js";

// Pool
export { initPool, getPool, isPoolInitialized } from "./db/pool.js";

// Services
export { PaymentStateMachine } from "./services/state-machine.js";
export { GroupManager } from "./services/group-manager.js";
export { NexusOrchestrator } from "./services/orchestrator.js";
export { routePayment } from "./services/payment-router.js";
export {
  verifyQuoteSignature,
  resolveMerchantDid,
  checkNonceGuard,
  checkQuoteExpiry,
  computeQuoteHash,
} from "./services/security.js";
export {
  buildDirectTransferInstruction,
  buildEscrowInstruction,
  buildGroupEscrowInstruction,
} from "./services/instruction-builder.js";

// Phase 3+4: Relayer, Chain Watcher, Timeout Handler, Webhook Notifier
export { NexusRelayer } from "./services/relayer.js";
export type { RelayerTxResult } from "./services/relayer.js";
export { ChainWatcher } from "./services/chain-watcher.js";
export { TimeoutHandler } from "./services/timeout-handler.js";
export { WebhookNotifier } from "./services/webhook-notifier.js";

// ABI
export { NEXUS_PAY_ESCROW_ABI } from "./abi/nexus-pay-escrow.js";
