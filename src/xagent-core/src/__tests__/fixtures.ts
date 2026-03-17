/**
 * Shared test fixtures for Nexus Core tests.
 */
import type {
  NexusQuotePayload,
  MerchantRecord,
  PaymentGroupRecord,
  PaymentRecord,
  Address,
  Hex,
} from "../types.js";

// ---------------------------------------------------------------------------
// Test merchants
// ---------------------------------------------------------------------------

/** Default marketplace fields for test merchants */
const MARKET_DEFAULTS = {
  description: "",
  category: "general",
  skill_md_url: null,
  health_url: null,
  mcp_endpoint: null,
  skill_name: null,
  skill_version: null,
  skill_protocol: null,
  skill_tools: [] as readonly { name: string; role: string }[],
  currencies: ["USDC"] as readonly string[],
  chain_id: null,
  health_status: "UNKNOWN" as const,
  last_health_check: null,
  last_health_latency_ms: null,
  consecutive_failures: 0,
  is_verified: false,
};

export const TEST_FLIGHT_MERCHANT: MerchantRecord = {
  ...MARKET_DEFAULTS,
  merchant_did: "did:nexus:20250407:demo_flight",
  name: "Demo Flight Agent",
  signer_address: "0xdd31F8EcD2F5DE824238AB1A761212006A1E11b6",
  payment_address: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
  webhook_url: "http://localhost:3001/webhook",
  webhook_secret: "REDACTED_WEBHOOK_SECRET",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

export const TEST_HOTEL_MERCHANT: MerchantRecord = {
  ...MARKET_DEFAULTS,
  merchant_did: "did:nexus:20250407:demo_hotel",
  name: "Demo Hotel Agent",
  signer_address: "0x5916667cfBD5f329c0A6474bf81d7F58c3BFB2C4",
  payment_address: "0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd",
  webhook_url: "http://localhost:3002/webhook",
  webhook_secret: "REDACTED_WEBHOOK_SECRET",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Test wallet
// ---------------------------------------------------------------------------

export const TEST_PAYER_WALLET: Address =
  "0x1234567890abcdef1234567890abcdef12345678";

/** Deterministic test private key — NEVER use on mainnet */
export const TEST_RELAYER_PRIVATE_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// ---------------------------------------------------------------------------
// Quote factory
// ---------------------------------------------------------------------------

let quoteCounter = 0;

export function makeTestQuote(
  overrides: Partial<NexusQuotePayload> = {},
): NexusQuotePayload {
  quoteCounter++;
  return {
    merchant_did: "did:nexus:20250407:demo_flight",
    merchant_order_ref: `FLT-TEST-${quoteCounter}`,
    amount: "100000",
    currency: "USDC",
    chain_id: 20250407,
    expiry: Math.floor(Date.now() / 1000) + 1800,
    context: {
      summary: `Test flight #${quoteCounter}`,
      line_items: [{ name: "Flight", qty: 1, amount: "100000" }],
      payer_wallet: TEST_PAYER_WALLET,
    },
    signature: "0x" + "ab".repeat(65),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Group factory
// ---------------------------------------------------------------------------

let groupCounter = 0;

export function makeTestGroup(
  overrides: Partial<PaymentGroupRecord> = {},
): PaymentGroupRecord {
  groupCounter++;
  const now = new Date().toISOString();
  return {
    group_id: `GRP-test-${groupCounter}`,
    payer_wallet: TEST_PAYER_WALLET,
    total_amount: "200000",
    total_amount_display: "0.20",
    currency: "USDC",
    chain_id: 20250407,
    status: "GROUP_CREATED",
    payment_count: 2,
    tx_hash: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Payment factory
// ---------------------------------------------------------------------------

let paymentCounter = 0;

export function makeTestPayment(
  overrides: Partial<PaymentRecord> = {},
): PaymentRecord {
  paymentCounter++;
  const now = new Date().toISOString();
  return {
    xagent_payment_id: `PAY-test-${paymentCounter}`,
    group_id: null,
    quote_hash: `0x${"cc".repeat(32)}`,
    merchant_did: "did:nexus:20250407:demo_flight",
    merchant_order_ref: `FLT-TEST-${paymentCounter}`,
    payer_wallet: TEST_PAYER_WALLET,
    payment_address: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
    amount: "100000",
    amount_display: "0.10",
    currency: "USDC",
    chain_id: 20250407,
    status: "CREATED",
    payment_method: "ESCROW_CONTRACT",
    tx_hash: null,
    block_number: null,
    block_timestamp: null,
    quote_payload: makeTestQuote(),
    iso_metadata: null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    settled_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    escrow_contract: null,
    payment_id_bytes32: null,
    eip3009_nonce: null,
    deposit_tx_hash: null,
    release_tx_hash: null,
    refund_tx_hash: null,
    release_deadline: null,
    dispute_deadline: null,
    protocol_fee: null,
    dispute_reason: null,
    ...overrides,
  };
}
