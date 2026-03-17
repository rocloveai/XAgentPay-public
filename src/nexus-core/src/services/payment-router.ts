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
 * Determine payment routing for a quote.
 * Routes to ACP_JOB if quote explicitly requests it via payment_method,
 * otherwise defaults to ESCROW_CONTRACT.
 */
export function routePayment(quote: NexusQuotePayload): RouteDecision {
  if (quote.payment_method === "ACP_JOB") {
    return {
      method: "ACP_JOB",
      reason: "Quote requested ACP_JOB payment method (ERC-8183)",
    };
  }

  return {
    method: "ESCROW_CONTRACT",
    reason: "Default: routed to escrow",
  };
}
