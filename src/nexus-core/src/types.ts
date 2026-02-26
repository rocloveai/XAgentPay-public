/**
 * NexusPay Core — shared type definitions.
 *
 * Every subsequent phase imports from this file.
 */

// ---------------------------------------------------------------------------
// Branded primitives
// ---------------------------------------------------------------------------

/** EVM address (0x-prefixed, 40 hex chars) */
export type Address = `0x${string}`;

/** Hex-encoded bytes (0x-prefixed) */
export type Hex = `0x${string}`;

// ---------------------------------------------------------------------------
// Status unions
// ---------------------------------------------------------------------------

/** 12-state payment status machine */
export type PaymentStatus =
  | "CREATED"
  | "AWAITING_TX"
  | "BROADCASTED"
  | "SETTLED"
  | "COMPLETED"
  | "EXPIRED"
  | "TX_FAILED"
  | "RISK_REJECTED"
  // Escrow-specific
  | "ESCROWED"
  | "REFUNDED"
  | "DISPUTE_OPEN"
  | "DISPUTE_RESOLVED";

/** Payment routing method */
export type PaymentMethod = "DIRECT_TRANSFER" | "ESCROW_CONTRACT";

/** Append-only event types for payment_events table */
export type PaymentEventType =
  | "PAYMENT_CREATED"
  | "PAYMENT_FINALIZED"
  | "TX_SUBMITTED"
  | "TX_CONFIRMED"
  | "TX_FAILED"
  | "PAYMENT_EXPIRED"
  | "FULFILLMENT_CONFIRMED"
  | "RISK_REJECTED"
  | "WEBHOOK_SENT"
  | "WEBHOOK_FAILED"
  // Escrow-specific
  | "EIP3009_SIGNATURE_RECEIVED"
  | "RELAYER_TX_SUBMITTED"
  | "RELAYER_TX_FAILED"
  | "ESCROW_DEPOSITED"
  | "ESCROW_RELEASED"
  | "ESCROW_REFUNDED"
  | "DISPUTE_OPENED"
  | "DISPUTE_RESOLVED";

/** Webhook event types sent to merchants */
export type WebhookEventType =
  | "payment.created"
  | "payment.settled"
  | "payment.expired"
  | "payment.failed"
  // Escrow-specific
  | "payment.escrowed"
  | "payment.refunded"
  | "dispute.opened"
  | "dispute.resolved"
  | "payment.completed";

// ---------------------------------------------------------------------------
// Core records (immutable DB rows)
// ---------------------------------------------------------------------------

/** Line item in a quote context */
export interface LineItem {
  readonly name: string;
  readonly qty: number;
  readonly amount: string;
}

/** ISO 20022 metadata attached to a payment */
export interface IsoMetadata {
  readonly end_to_end_id: string;
  readonly remittance_info: string;
  readonly instructed_amount: string;
  readonly instructed_currency: string;
  readonly creditor_id: string;
  readonly settlement_asset: string;
}

/**
 * NUPS Quote Payload — compatible with flight-agent/hotel-agent's existing type.
 * Kept in nexus-core so every consumer references one definition.
 */
export interface NexusQuotePayload {
  readonly merchant_did: string;
  readonly merchant_order_ref: string;
  readonly amount: string;
  readonly currency: string;
  readonly chain_id: number;
  readonly expiry: number;
  readonly payment_method?: PaymentMethod;
  readonly context: {
    readonly summary: string;
    readonly line_items: readonly LineItem[];
    readonly original_amount?: string;
    readonly payer_wallet?: string;
  };
  readonly signature: string;
}

// ---------------------------------------------------------------------------
// Payment Group types
// ---------------------------------------------------------------------------

/** Group-level status (aggregated from child payments) */
export type PaymentGroupStatus =
  | "GROUP_CREATED"
  | "GROUP_AWAITING_TX"
  | "GROUP_DEPOSITED"
  | "GROUP_ESCROWED"
  | "GROUP_SETTLED"
  | "GROUP_COMPLETED"
  | "GROUP_EXPIRED"
  | "GROUP_PARTIAL";

/** Payment group record persisted in `payment_groups` table */
export interface PaymentGroupRecord {
  readonly group_id: string;
  readonly payer_wallet: string;
  readonly total_amount: string;
  readonly total_amount_display: string;
  readonly currency: string;
  readonly chain_id: number;
  readonly status: PaymentGroupStatus;
  readonly payment_count: number;
  readonly tx_hash: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Parameters for creating a payment group */
export interface CreateGroupParams {
  readonly group_id: string;
  readonly payer_wallet: string;
  readonly total_amount: string;
  readonly total_amount_display: string;
  readonly currency: string;
  readonly chain_id: number;
  readonly payment_count: number;
}

/** Aggregated escrow instruction for the entire group */
export interface GroupEscrowInstruction {
  readonly group_id: string;
  readonly chain_id: number;
  readonly chain_name: string;
  readonly payment_method: "ESCROW_CONTRACT";
  readonly escrow_contract: Address;
  readonly token_address: Address;
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;
  readonly total_amount_uint256: string;
  readonly total_amount_display: string;
  readonly payments: readonly GroupPaymentDetail[];
  readonly eip3009_sign_data: EIP3009SignData;
  readonly user_action: "SIGN_EIP3009";
  readonly gas_paid_by: "RELAYER";
}

/** Per-payment detail within a group instruction */
export interface GroupPaymentDetail {
  readonly nexus_payment_id: string;
  readonly merchant_did: string;
  readonly merchant_order_ref: string;
  readonly merchant_address: Address;
  readonly amount_uint256: string;
  readonly amount_display: string;
  readonly summary: string;
  /** keccak256(nexus_payment_id) — precomputed for on-chain BatchEntry */
  readonly payment_id_bytes32: Hex;
  /** keccak256(merchant_order_ref) — precomputed for on-chain BatchEntry */
  readonly order_ref_bytes32: Hex;
  /** keccak256(merchant_did) — precomputed for on-chain BatchEntry */
  readonly merchant_did_bytes32: Hex;
  /** keccak256(JSON.stringify(context)) — precomputed for on-chain BatchEntry */
  readonly context_hash: Hex;
}

/** Full payment record persisted in the `payments` table */
export interface PaymentRecord {
  readonly nexus_payment_id: string;
  readonly group_id: string | null;
  readonly quote_hash: string;
  readonly merchant_did: string;
  readonly merchant_order_ref: string;
  readonly payer_wallet: string | null;
  readonly payment_address: string;
  readonly amount: string;
  readonly amount_display: string;
  readonly currency: string;
  readonly chain_id: number;
  readonly status: PaymentStatus;
  readonly payment_method: PaymentMethod;
  readonly tx_hash: string | null;
  readonly block_number: number | null;
  readonly block_timestamp: string | null;
  readonly quote_payload: NexusQuotePayload;
  readonly iso_metadata: IsoMetadata | null;
  readonly expires_at: string;
  readonly settled_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  // Escrow-specific (all nullable)
  readonly escrow_contract: string | null;
  readonly payment_id_bytes32: string | null;
  readonly eip3009_nonce: string | null;
  readonly deposit_tx_hash: string | null;
  readonly release_tx_hash: string | null;
  readonly refund_tx_hash: string | null;
  readonly release_deadline: string | null;
  readonly dispute_deadline: string | null;
  readonly protocol_fee: string | null;
  readonly dispute_reason: string | null;
}

/** Append-only event row from `payment_events` */
export interface PaymentEvent {
  readonly event_id: string;
  readonly nexus_payment_id: string;
  readonly event_type: PaymentEventType;
  readonly from_status: PaymentStatus | null;
  readonly to_status: PaymentStatus;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string;
}

/** Health status for marketplace agents */
export type AgentHealthStatus = "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";

/** Merchant identity from `merchant_registry` (unified with marketplace) */
export interface MerchantRecord {
  readonly merchant_did: string;
  readonly name: string;
  readonly signer_address: string;
  readonly payment_address: string;
  readonly webhook_url: string | null;
  readonly webhook_secret: string | null;
  // Marketplace fields
  readonly description: string;
  readonly category: string;
  readonly skill_md_url: string | null;
  readonly health_url: string | null;
  readonly mcp_endpoint: string | null;
  readonly skill_name: string | null;
  readonly skill_version: string | null;
  readonly skill_protocol: string | null;
  readonly skill_tools: readonly { name: string; role: string }[];
  readonly currencies: readonly string[];
  readonly chain_id: number | null;
  readonly health_status: AgentHealthStatus;
  readonly last_health_check: string | null;
  readonly last_health_latency_ms: number | null;
  readonly consecutive_failures: number;
  readonly is_verified: boolean;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Webhook delivery log row */
export interface WebhookDeliveryLog {
  readonly log_id: string;
  readonly nexus_payment_id: string;
  readonly merchant_did: string;
  readonly webhook_url: string;
  readonly event_type: WebhookEventType;
  readonly request_body: Record<string, unknown>;
  readonly response_status: number | null;
  readonly response_body: string | null;
  readonly attempt_number: number;
  readonly next_retry_at: string | null;
  readonly delivered_at: string | null;
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Payment instructions (returned to User Agent)
// ---------------------------------------------------------------------------

/** Direct Transfer payment instruction */
export interface PaymentInstruction {
  readonly chain_id: number;
  readonly chain_name: string;
  readonly payment_method: "DIRECT_TRANSFER";
  readonly target_address: Address;
  readonly token_address: Address;
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;
  readonly amount_uint256: string;
  readonly amount_display: string;
  readonly method: "erc20_transfer";
  readonly tx_data: {
    readonly to: Address;
    readonly data: Hex;
    readonly value: "0";
    readonly gas_limit: string;
  };
  readonly nexus_payment_id: string;
  readonly memo: string;
}

/** EIP-3009 TypedData sign parameters for Escrow deposit */
export interface EIP3009SignData {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
    readonly verifyingContract: Address;
  };
  readonly types: {
    readonly TransferWithAuthorization: readonly [
      { readonly name: "from"; readonly type: "address" },
      { readonly name: "to"; readonly type: "address" },
      { readonly name: "value"; readonly type: "uint256" },
      { readonly name: "validAfter"; readonly type: "uint256" },
      { readonly name: "validBefore"; readonly type: "uint256" },
      { readonly name: "nonce"; readonly type: "bytes32" },
    ];
  };
  readonly primaryType: "TransferWithAuthorization";
  readonly message: {
    readonly from: Address;
    readonly to: Address;
    readonly value: string;
    readonly validAfter: string;
    readonly validBefore: string;
    readonly nonce: Hex;
  };
}

/** Batch deposit instruction — EIP-3009 sign + user-submitted batchDepositWithAuthorization */
export interface BatchDepositInstruction {
  readonly group_id: string;
  readonly chain_id: number;
  readonly chain_name: string;
  readonly rpc_url: string;
  readonly payment_method: "ESCROW_CONTRACT";
  readonly escrow_contract: Address;
  readonly token_address: Address;
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;
  readonly total_amount_uint256: string;
  readonly total_amount_display: string;
  readonly payments: readonly GroupPaymentDetail[];
  /** EIP-3009 typed data for user to sign via eth_signTypedData_v4 */
  readonly eip3009_sign_data: EIP3009SignData;
  /** Pre-encoded batchDepositWithAuthorization tx (v/r/s as zero placeholders — fill after signing) */
  readonly deposit_tx: {
    readonly to: Address;
    readonly abi: string;
    readonly value: "0";
    readonly gas_limit: string;
  };
  readonly user_action: "SIGN_AND_SEND";
  readonly gas_paid_by: "USER";
  /** EIP-712 signature over (groupId, entriesHash, totalAmount) by Nexus Core operator */
  readonly nexus_group_sig: Hex;
  /** Address of the core operator that signed the group instruction */
  readonly core_operator_address: Address;
}

/** HTTP 402 Payment Required response body */
export interface PaymentRequired402 {
  readonly nexus_version: string;
  readonly group_id: string;
  readonly status: "PAYMENT_REQUIRED";
  /** Browser checkout URL — user can open this in MetaMask browser */
  readonly checkout_url: string;
  /** Full instruction for direct on-chain submission by User Agent */
  readonly instruction: BatchDepositInstruction;
  /** EIP-712 signature over (groupId, entriesHash, totalAmount) by Nexus Core operator */
  readonly nexus_group_sig: Hex;
  /** Address of the core operator that signed the group instruction */
  readonly core_operator_address: Address;
}

/** @deprecated Use BatchDepositInstruction instead — Escrow mode instruction (EIP-3009 + Relayer) */
export interface EscrowInstruction {
  readonly chain_id: number;
  readonly chain_name: string;
  readonly payment_method: "ESCROW_CONTRACT";
  readonly escrow_contract: Address;
  readonly token_address: Address;
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;
  readonly amount_uint256: string;
  readonly amount_display: string;
  readonly eip3009_sign_data: EIP3009SignData;
  readonly nexus_payment_id: string;
  readonly payment_id_bytes32: Hex;
  readonly merchant_address: Address;
  readonly order_ref_hash: Hex;
  readonly merchant_did_hash: Hex;
  readonly context_hash: Hex;
  readonly release_deadline: string;
  readonly dispute_deadline: string;
  readonly user_action: "SIGN_EIP3009";
  readonly gas_paid_by: "RELAYER";
}

// ---------------------------------------------------------------------------
// Webhook payload
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  readonly event_id: string;
  readonly event_type: WebhookEventType;
  readonly created_at: string;
  readonly data: {
    readonly nexus_payment_id: string;
    readonly merchant_order_ref: string;
    readonly merchant_did: string;
    readonly status: PaymentStatus;
    readonly amount: string;
    readonly amount_display: string;
    readonly currency: string;
    readonly chain_id: number;
    readonly payer_wallet: string;
    readonly settlement?: {
      readonly tx_hash: string;
      readonly block_number: number;
      readonly block_timestamp: string;
      readonly payment_address: string;
    };
    readonly iso_metadata?: IsoMetadata;
  };
}

// ---------------------------------------------------------------------------
// Repository parameter types
// ---------------------------------------------------------------------------

/** Parameters for creating a new payment */
export interface CreatePaymentParams {
  readonly nexus_payment_id: string;
  readonly group_id: string | null;
  readonly quote_hash: string;
  readonly merchant_did: string;
  readonly merchant_order_ref: string;
  readonly payer_wallet: string | null;
  readonly payment_address: string;
  readonly amount: string;
  readonly amount_display: string;
  readonly currency: string;
  readonly chain_id: number;
  readonly payment_method: PaymentMethod;
  readonly quote_payload: NexusQuotePayload;
  readonly iso_metadata: IsoMetadata | null;
  readonly expires_at: string;
}

/** Parameters for creating a payment event */
export interface CreateEventParams {
  readonly event_id: string;
  readonly nexus_payment_id: string;
  readonly event_type: PaymentEventType;
  readonly from_status: PaymentStatus | null;
  readonly to_status: PaymentStatus;
  readonly metadata: Record<string, unknown>;
}

/** Parameters for creating a webhook delivery log */
export interface CreateWebhookLogParams {
  readonly log_id: string;
  readonly nexus_payment_id: string;
  readonly merchant_did: string;
  readonly webhook_url: string;
  readonly event_type: WebhookEventType;
  readonly request_body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

/** Parameters for registering a new merchant (unified: payment + marketplace) */
export interface RegisterMerchantParams {
  readonly merchant_did: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly signer_address: string;
  readonly payment_address: string;
  readonly skill_md_url: string;
  readonly health_url: string;
  readonly webhook_url?: string;
  readonly webhook_secret?: string;
  readonly mcp_endpoint?: string;
}
