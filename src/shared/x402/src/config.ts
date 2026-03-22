/**
 * XLayer x402 Payment Protocol Constants
 *
 * Shared configuration for all XAgentPay merchant agents.
 */

/** x402 specification version */
export const X402_VERSION = 2;

/** XLayer network in CAIP-2 format */
export const XLAYER_NETWORK = "eip155:196" as const;

/** XLayer chain ID */
export const XLAYER_CHAIN_ID = 196;

/** XLayer RPC URL */
export const XLAYER_RPC_URL = "https://rpc.xlayer.tech";

/** USDC contract address on XLayer */
export const XLAYER_USDC = "0x74b7F16337b8972027F6196A17a631aC6dE26d22" as const;

/** USDC EIP-712 domain name (from contract) */
export const USDC_NAME = "USDC";

/** USDC EIP-712 domain version (from contract) */
export const USDC_VERSION = "2";

/** USDC decimal places */
export const USDC_DECIMALS = 6;

/** Maximum payment timeout in seconds (5 minutes) */
export const MAX_TIMEOUT_SECONDS = 300;

/** MCP _meta key for payment payload (client → server) */
export const MCP_PAYMENT_META_KEY = "x402/payment" as const;

/** MCP _meta key for payment response (server → client) */
export const MCP_PAYMENT_RESPONSE_META_KEY = "x402/payment-response" as const;

/** Payment scheme identifier */
export const PAYMENT_SCHEME = "exact" as const;
