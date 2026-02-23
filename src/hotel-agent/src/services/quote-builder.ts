import type { LineItem, NexusQuotePayload } from "../types.js";

interface BuildQuoteParams {
  readonly merchantDid: string;
  readonly orderRef: string;
  readonly amount: string;
  readonly currency: string;
  readonly summary: string;
  readonly lineItems: readonly LineItem[];
}

const USDC_DECIMALS = 6;
const QUOTE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Convert a human-readable amount (e.g. "530.00") to uint256 string
 * with the specified decimal precision.
 */
export function toUint256(
  amount: string,
  decimals: number = USDC_DECIMALS,
): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`Invalid amount string for toUint256: "${amount}"`);
  }
  const parts = amount.split(".");
  const integerPart = parts[0] ?? "0";
  const fractionalPart = (parts[1] ?? "")
    .padEnd(decimals, "0")
    .slice(0, decimals);
  const raw = integerPart + fractionalPart;
  return raw.replace(/^0+/, "") || "0";
}

export function buildQuote(params: BuildQuoteParams): NexusQuotePayload {
  const amountUint256 = toUint256(params.amount);
  const lineItemsUint256 = params.lineItems.map((item) => ({
    ...item,
    amount: toUint256(item.amount),
  }));

  return {
    merchant_did: params.merchantDid,
    merchant_order_ref: params.orderRef,
    amount: amountUint256,
    currency: params.currency,
    chain_id: 210425,
    expiry: Math.floor((Date.now() + QUOTE_TTL_MS) / 1000),
    context: {
      summary: params.summary,
      line_items: lineItemsUint256,
    },
    signature: "PENDING_NEXUS_CORE",
  };
}
