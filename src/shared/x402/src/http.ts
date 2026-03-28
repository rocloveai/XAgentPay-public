/**
 * x402 HTTP-level middleware (OKX OnchainOS compatible)
 *
 * Implements HTTP 402 Payment Required protocol.
 * Server returns HTTP 402 with base64-encoded JSON payload.
 * Client attaches PAYMENT-SIGNATURE or X-PAYMENT header to retry.
 *
 * OKX x402 SKILL reference: https://github.com/okx/onchainos-skills
 * Flow: HTTP 402 → onchainos payment x402-pay → PAYMENT-SIGNATURE header → HTTP 200
 */
import {
  X402_VERSION,
  XLAYER_NETWORK,
  XLAYER_USDC,
  MAX_TIMEOUT_SECONDS,
  PAYMENT_SCHEME,
  USDC_NAME,
  USDC_VERSION,
} from "./config.js";
import { settleEIP3009Payment } from "./facilitator.js";
import type { X402ToolConfig } from "./middleware.js";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "./types.js";

/**
 * Build the base64-encoded HTTP 402 response body.
 * Decoded format matches OKX x402 skill expectations.
 */
export function buildHTTP402Body(config: X402ToolConfig): string {
  const payload = {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: PAYMENT_SCHEME,
        network: XLAYER_NETWORK,
        asset: XLAYER_USDC,
        amount: config.priceUsdcAtomic,
        payTo: config.payTo,
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
      },
    ],
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Extract x402 payment from HTTP PAYMENT-SIGNATURE or X-PAYMENT header.
 * Converts OKX header format to internal PaymentPayload.
 */
export function extractHTTPPayment(
  headers: Record<string, string | string[] | undefined>,
): PaymentPayload | null {
  const rawHeader =
    (headers["payment-signature"] as string | undefined) ??
    (headers["x-payment"] as string | undefined);
  if (!rawHeader) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(rawHeader, "base64").toString("utf8"),
    );
    const option = decoded?.accepts?.[0];
    const { signature, authorization } = decoded?.payload ?? {};
    if (!option || !signature || !authorization) return null;

    const amount = option.amount ?? option.maxAmountRequired;
    const payTo = option.payTo;

    // Reject payments with missing critical fields
    if (!amount || amount === "0" || !payTo) return null;

    return {
      x402Version: decoded.x402Version ?? X402_VERSION,
      accepted: {
        scheme: option.scheme ?? PAYMENT_SCHEME,
        network: option.network ?? XLAYER_NETWORK,
        asset: option.asset ?? XLAYER_USDC,
        amount,
        payTo,
        maxTimeoutSeconds: option.maxTimeoutSeconds ?? MAX_TIMEOUT_SECONDS,
        extra: {
          name: USDC_NAME,
          version: USDC_VERSION,
          assetTransferMethod: "eip3009",
        },
      },
      payload: { signature, authorization },
    };
  } catch {
    return null;
  }
}

/**
 * Verify and settle an HTTP x402 payment on-chain.
 */
export async function processHTTPPayment(
  payment: PaymentPayload,
  config: X402ToolConfig,
): Promise<
  { success: true; settled: SettleResponse } | { success: false; error: string }
> {
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

  const result = await settleEIP3009Payment(
    payment,
    requirements,
    config.signerPrivateKey,
  );
  if (!result.success) {
    return {
      success: false,
      error: result.errorReason ?? "Payment settlement failed",
    };
  }
  return { success: true, settled: result };
}
