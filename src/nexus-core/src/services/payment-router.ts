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
 * MVP implementation: all payments go through escrow.
 */
export function routePayment(_quote: NexusQuotePayload): RouteDecision {
  return {
    method: "ESCROW_CONTRACT",
    reason: "MVP: all payments routed to escrow",
  };
}
