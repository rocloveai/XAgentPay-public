/**
 * xNexus Core — Payment router.
 *
 * Decides which payment method to use for a given quote.
 * MVP: Always routes to ESCROW_CONTRACT.
 */
import type { PaymentMethod, NexusQuotePayload } from "../types.js";

export interface RouteDecision {
  readonly method: PaymentMethod;
  readonly reason: string;
}

/**
 * Merchant DIDs that always use ACP_JOB (ERC-8183) payment method.
 * This bypasses LLM intermediary issues where payment_method may be
 * dropped when quotes are forwarded between agents.
 */
const ACP_MERCHANT_DIDS = new Set([
  "did:nexus:196:demo_esim",
]);

/**
 * Determine payment routing for a quote.
 * Routes to ACP_JOB if:
 *  1. Quote explicitly requests it via payment_method, OR
 *  2. Merchant is configured for ACP in ACP_MERCHANT_DIDS
 * Otherwise defaults to ESCROW_CONTRACT.
 */
export function routePayment(quote: NexusQuotePayload): RouteDecision {
  if (
    quote.payment_method === "ACP_JOB" ||
    ACP_MERCHANT_DIDS.has(quote.merchant_did)
  ) {
    return {
      method: "ACP_JOB",
      reason: `Routed to ACP_JOB (merchant: ${quote.merchant_did})`,
    };
  }

  return {
    method: "ESCROW_CONTRACT",
    reason: "Default: routed to escrow",
  };
}
