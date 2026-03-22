/**
 * x402 Payment Protocol Type Definitions (v2)
 *
 * Based on the x402 specification:
 * https://github.com/coinbase/x402
 */

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/** CAIP-2 network identifier (e.g. "eip155:196" for XLayer) */
export type Network = `${string}:${string}`;

// ---------------------------------------------------------------------------
// Resource
// ---------------------------------------------------------------------------

/** Describes the resource being paid for */
export interface ResourceInfo {
  /** Resource URL (e.g. "mcp://tool/search_and_quote") */
  url: string;
  /** Human-readable description */
  description?: string;
  /** MIME type of the resource */
  mimeType?: string;
}

// ---------------------------------------------------------------------------
// Payment Requirements
// ---------------------------------------------------------------------------

/** A single payment option that the server accepts */
export interface PaymentRequirements {
  /** Payment scheme identifier (e.g. "exact") */
  scheme: string;
  /** Blockchain network in CAIP-2 format (e.g. "eip155:196") */
  network: Network;
  /** Token contract address */
  asset: string;
  /** Amount in atomic units (e.g. "100000" for 0.10 USDC) */
  amount: string;
  /** Recipient address */
  payTo: string;
  /** Maximum time for payment completion in seconds */
  maxTimeoutSeconds: number;
  /** Scheme-specific extra data (e.g. EIP-712 domain info for EIP-3009) */
  extra: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Payment Required (402 response)
// ---------------------------------------------------------------------------

/** Standard x402 PaymentRequired response */
export interface PaymentRequired {
  /** x402 protocol version */
  x402Version: number;
  /** Human-readable error message */
  error?: string;
  /** Resource being paid for */
  resource: ResourceInfo;
  /** List of accepted payment options */
  accepts: PaymentRequirements[];
  /** Protocol extensions */
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Payment Payload (client → server)
// ---------------------------------------------------------------------------

/** Payment payload submitted by the client */
export interface PaymentPayload {
  /** x402 protocol version */
  x402Version: number;
  /** Resource being paid for */
  resource?: ResourceInfo;
  /** The accepted payment requirements (echoed from PaymentRequired.accepts[]) */
  accepted: PaymentRequirements;
  /** Scheme-specific payload data (e.g. EIP-3009 authorization + signature) */
  payload: Record<string, unknown>;
  /** Protocol extensions */
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EIP-3009 Authorization
// ---------------------------------------------------------------------------

/** EIP-3009 transferWithAuthorization parameters */
export interface EIP3009Authorization {
  /** Sender address */
  from: `0x${string}`;
  /** Recipient address */
  to: `0x${string}`;
  /** Transfer amount in atomic units */
  value: string;
  /** Unix timestamp: transfer valid after this time */
  validAfter: string;
  /** Unix timestamp: transfer valid before this time */
  validBefore: string;
  /** Unique nonce (bytes32) */
  nonce: `0x${string}`;
}

/** EIP-3009 specific payload within PaymentPayload.payload */
export interface EIP3009PayloadData {
  /** EIP-712 signature */
  signature: `0x${string}`;
  /** Authorization parameters */
  authorization: EIP3009Authorization;
}

// ---------------------------------------------------------------------------
// Settle Response
// ---------------------------------------------------------------------------

/** Response after successful/failed settlement */
export interface SettleResponse {
  /** Whether settlement succeeded */
  success: boolean;
  /** Error reason if failed */
  errorReason?: string;
  /** Payer address */
  payer?: string;
  /** Transaction hash (empty string if failed before submission) */
  transaction: string;
  /** Network in CAIP-2 format */
  network: Network;
}

// ---------------------------------------------------------------------------
// Verify Response
// ---------------------------------------------------------------------------

/** Response after payment verification */
export interface VerifyResponse {
  /** Whether the payment is valid */
  isValid: boolean;
  /** Reason for invalidity */
  invalidReason?: string;
  /** Payer address recovered from signature */
  payer?: string;
}
