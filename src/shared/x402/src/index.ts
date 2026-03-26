/**
 * @xagentpay/x402 — x402 Payment Protocol Module
 *
 * Shared module for integrating x402 payment protocol into
 * XAgentPay MCP merchant agents (eSIM, Flight, Hotel).
 *
 * Usage in agent server.ts:
 *
 * ```typescript
 * import {
 *   extractX402Payment,
 *   buildPaymentRequired,
 *   buildPaymentRequiredResult,
 *   buildPaidToolResult,
 *   processX402Payment,
 *   type X402ToolConfig,
 * } from "@xagentpay/x402";
 * ```
 */

// Types
export type {
  Network,
  ResourceInfo,
  PaymentRequirements,
  PaymentRequired,
  PaymentPayload,
  EIP3009Authorization,
  EIP3009PayloadData,
  SettleResponse,
  VerifyResponse,
} from "./types.js";

// Config constants
export {
  X402_VERSION,
  XLAYER_NETWORK,
  XLAYER_CHAIN_ID,
  XLAYER_RPC_URL,
  XLAYER_USDC,
  USDC_NAME,
  USDC_VERSION,
  USDC_DECIMALS,
  MAX_TIMEOUT_SECONDS,
  MCP_PAYMENT_META_KEY,
  MCP_PAYMENT_RESPONSE_META_KEY,
  PAYMENT_SCHEME,
} from "./config.js";

// Facilitator
export {
  verifyEIP3009Payment,
  settleEIP3009Payment,
  extractEIP3009Payload,
} from "./facilitator.js";

// Middleware
export {
  extractX402Payment,
  buildPaymentRequired,
  processX402Payment,
  buildPaidToolResult,
  buildPaymentRequiredResult,
  formatUsdcAmount,
  type X402ToolConfig,
} from "./middleware.js";

// HTTP-level x402 (OKX OnchainOS compatible)
export {
  buildHTTP402Body,
  extractHTTPPayment,
  processHTTPPayment,
} from "./http.js";
