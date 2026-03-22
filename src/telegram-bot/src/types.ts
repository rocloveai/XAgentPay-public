/**
 * Telegram Bot — Type definitions.
 *
 * Request/response shapes and terminal state sets.
 */

// ---------------------------------------------------------------------------
// POST /api/render-order request
// ---------------------------------------------------------------------------

export interface PaymentSummary {
  readonly xagent_payment_id: string;
  readonly merchant_order_ref: string;
  readonly amount_display: string;
  readonly status: string;
  readonly summary?: string;
}

export interface RenderOrderRequest {
  readonly chat_id: number | string;
  readonly checkout_url: string;
  readonly group_id: string;
  readonly total_amount_display: string;
  readonly currency: string;
  readonly payments: readonly PaymentSummary[];
}

// ---------------------------------------------------------------------------
// GET /api/payments?group_id=X response (subset we use)
// ---------------------------------------------------------------------------

export interface GroupInfo {
  readonly group_id: string;
  readonly status: string;
  readonly total_amount: string;
  readonly total_amount_display: string;
  readonly currency: string;
  readonly chain_id: number;
  readonly payment_count: number;
  readonly tx_hash: string | null;
  readonly created_at: string;
}

export interface GroupPaymentInfo {
  readonly xagent_payment_id: string;
  readonly status: string;
  readonly amount_display: string;
  readonly currency: string;
  readonly merchant_did: string;
  readonly merchant_order_ref: string;
}

export interface XAgentGroupStatusResponse {
  readonly payment: unknown;
  readonly group: GroupInfo | null;
  readonly group_payments: readonly GroupPaymentInfo[];
}

// ---------------------------------------------------------------------------
// Terminal states
// ---------------------------------------------------------------------------

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "SETTLED",
  "COMPLETED",
  "REFUNDED",
  "EXPIRED",
  "TX_FAILED",
  "RISK_REJECTED",
]);

export const TERMINAL_GROUP_STATUSES: ReadonlySet<string> = new Set([
  "GROUP_SETTLED",
  "GROUP_COMPLETED",
  "GROUP_EXPIRED",
]);

// ---------------------------------------------------------------------------
// Active poll tracking
// ---------------------------------------------------------------------------

export interface ActivePoll {
  readonly chatId: number | string;
  readonly messageId: number;
  readonly groupId: string;
  readonly checkoutUrl: string;
  readonly startedAt: number;
  readonly lastRenderedHash: string;
}
