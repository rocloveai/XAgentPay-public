/**
 * x402 MCP Middleware
 *
 * Helper functions for integrating x402 payments into MCP tool handlers.
 * Each merchant agent uses these to:
 * 1. Detect x402 payment in _meta
 * 2. Build PaymentRequired responses
 * 3. Process payments (verify + settle)
 * 4. Format MCP-compatible results
 *
 * Reference: x402 MCP Transport Specification
 * https://github.com/coinbase/x402/blob/main/specs/transports-v2/mcp.md
 */
import {
  X402_VERSION,
  XLAYER_NETWORK,
  XLAYER_USDC,
  USDC_NAME,
  USDC_VERSION,
  MAX_TIMEOUT_SECONDS,
  MCP_PAYMENT_META_KEY,
  MCP_PAYMENT_RESPONSE_META_KEY,
  PAYMENT_SCHEME,
} from "./config.js";
import {
  verifyEIP3009Payment,
  settleEIP3009Payment,
} from "./facilitator.js";
import type {
  PaymentRequired,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "./types.js";

// ---------------------------------------------------------------------------
// Tool Payment Configuration
// ---------------------------------------------------------------------------

/** Configuration for a paid MCP tool */
export interface X402ToolConfig {
  /** MCP tool name */
  toolName: string;
  /** Price in USDC atomic units (6 decimals). e.g. "100000" = 0.10 USDC */
  priceUsdcAtomic: string;
  /** Merchant payment address (payTo) */
  payTo: string;
  /** Human-readable description of the resource */
  resourceDescription: string;
  /** Facilitator/relayer private key for settling on-chain */
  signerPrivateKey: string;
}

// ---------------------------------------------------------------------------
// Extract x402 Payment from MCP _meta
// ---------------------------------------------------------------------------

/**
 * Extracts the x402 payment payload from MCP tool call `_meta`.
 *
 * @param meta - The _meta object from the MCP tool call (extra._meta or params._meta)
 * @returns PaymentPayload if present, null otherwise
 */
export function extractX402Payment(
  meta: Record<string, unknown> | undefined | null,
): PaymentPayload | null {
  if (!meta) return null;

  const payment = meta[MCP_PAYMENT_META_KEY];
  if (!payment || typeof payment !== "object") return null;

  // Basic structural validation
  const p = payment as Record<string, unknown>;
  if (!p.x402Version || !p.accepted || !p.payload) return null;

  return payment as PaymentPayload;
}

// ---------------------------------------------------------------------------
// Build PaymentRequired Response
// ---------------------------------------------------------------------------

/**
 * Builds a standard x402 PaymentRequired object.
 *
 * Used when a tool call arrives without payment.
 */
export function buildPaymentRequired(
  config: X402ToolConfig,
): PaymentRequired {
  const requirements: PaymentRequirements = {
    scheme: PAYMENT_SCHEME,
    network: XLAYER_NETWORK,
    asset: XLAYER_USDC,
    amount: config.priceUsdcAtomic,
    payTo: config.payTo,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      /** EIP-712 domain info for EIP-3009 signing */
      name: USDC_NAME,
      version: USDC_VERSION,
      /** Asset transfer method hint */
      assetTransferMethod: "eip3009",
    },
  };

  return {
    x402Version: X402_VERSION,
    error: "Payment required",
    resource: {
      url: `mcp://tool/${config.toolName}`,
      description: config.resourceDescription,
    },
    accepts: [requirements],
  };
}

// ---------------------------------------------------------------------------
// Process x402 Payment (Verify + Settle)
// ---------------------------------------------------------------------------

/**
 * Processes an x402 payment: verify → settle → return result.
 *
 * @returns SettleResponse on success, or { error: PaymentRequired } on failure
 */
export async function processX402Payment(
  payment: PaymentPayload,
  config: X402ToolConfig,
): Promise<{ settled: SettleResponse } | { error: PaymentRequired }> {
  // Build the requirements for verification
  const requirements: PaymentRequirements = {
    scheme: PAYMENT_SCHEME,
    network: XLAYER_NETWORK,
    asset: XLAYER_USDC,
    amount: config.priceUsdcAtomic,
    payTo: config.payTo,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      name: USDC_NAME,
      version: USDC_VERSION,
      assetTransferMethod: "eip3009",
    },
  };

  // Settle (includes re-verification)
  const settleResult = await settleEIP3009Payment(
    payment,
    requirements,
    config.signerPrivateKey,
  );

  if (!settleResult.success) {
    console.error(
      `[x402 Middleware] Payment failed for ${config.toolName}: ${settleResult.errorReason}`,
    );
    // Return PaymentRequired so the client can retry
    return {
      error: {
        ...buildPaymentRequired(config),
        error: settleResult.errorReason ?? "Payment verification failed",
      },
    };
  }

  return { settled: settleResult };
}

// ---------------------------------------------------------------------------
// MCP Response Builders
// ---------------------------------------------------------------------------

/**
 * Builds an MCP tool result for a successful x402 payment.
 * Includes the settlement info in `_meta["x402/payment-response"]`.
 */
export function buildPaidToolResult(
  textContent: string,
  settleResponse: SettleResponse,
): {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  _meta: Record<string, unknown>;
} {
  return {
    content: [{ type: "text" as const, text: textContent }],
    _meta: {
      [MCP_PAYMENT_RESPONSE_META_KEY]: settleResponse,
    },
  };
}

/**
 * Builds an MCP tool result for a PaymentRequired (402) response.
 *
 * Per x402 MCP spec:
 * - `isError: true` signals payment required
 * - `structuredContent` contains the PaymentRequired object
 * - `content[0].text` contains a JSON string of PaymentRequired
 */
export function buildPaymentRequiredResult(
  paymentRequired: PaymentRequired,
  additionalText?: string,
): {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  const textParts: string[] = [];

  if (additionalText) {
    textParts.push(additionalText);
    textParts.push("\n\n---\n");
  }

  textParts.push("💳 Payment Required (x402 Protocol)\n");
  textParts.push(
    `Amount: ${(Number(paymentRequired.accepts[0]?.amount ?? 0) / 1e6).toFixed(2)} USDC\n`,
  );
  textParts.push(`Network: XLayer (${XLAYER_NETWORK})\n`);
  textParts.push(
    `Pay to: ${paymentRequired.accepts[0]?.payTo ?? "unknown"}\n`,
  );
  textParts.push(`\nTo pay, include _meta["${MCP_PAYMENT_META_KEY}"] with a signed EIP-3009 transferWithAuthorization.\n`);
  textParts.push(`\nx402_payment_required: ${JSON.stringify(paymentRequired)}`);

  return {
    content: [{ type: "text" as const, text: textParts.join("") }],
    isError: true,
    structuredContent: { ...paymentRequired } as Record<string, unknown>,
  };
}

/**
 * Formats the USDC amount from atomic units to human-readable.
 * e.g. "100000" → "0.10 USDC"
 */
export function formatUsdcAmount(atomicAmount: string): string {
  return `${(Number(atomicAmount) / 1e6).toFixed(2)} USDC`;
}
