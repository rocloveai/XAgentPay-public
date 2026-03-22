import { describe, it, expect, beforeEach } from "vitest";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import type { CreatePaymentParams, XAgentQuotePayload } from "../../types.js";

const QUOTE: XAgentQuotePayload = {
  merchant_did: "did:xagent:210425:demo_flight",
  merchant_order_ref: "FLT-001",
  amount: "530000000",
  currency: "USDC",
  chain_id: 210425,
  expiry: Math.floor(Date.now() / 1000) + 3600,
  context: {
    summary: "Test flight",
    line_items: [{ name: "Flight SFO-NRT", qty: 1, amount: "530.00" }],
  },
  signature: "0xtest",
};

function makeParams(
  overrides?: Partial<CreatePaymentParams>,
): CreatePaymentParams {
  return {
    xagent_payment_id: "NEX-001",
    quote_hash: "0xhash1",
    merchant_did: "did:xagent:210425:demo_flight",
    merchant_order_ref: "FLT-001",
    payer_wallet: "0xpayer",
    payment_address: "0xmerchant",
    amount: "530000000",
    amount_display: "530.00",
    currency: "USDC",
    chain_id: 210425,
    payment_method: "DIRECT_TRANSFER",
    quote_payload: QUOTE,
    iso_metadata: null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe("MockPaymentRepository", () => {
  let repo: MockPaymentRepository;

  beforeEach(() => {
    repo = new MockPaymentRepository();
  });

  it("insert returns a full record with CREATED status", async () => {
    const record = await repo.insert(makeParams());
    expect(record.xagent_payment_id).toBe("NEX-001");
    expect(record.status).toBe("CREATED");
    expect(record.payment_method).toBe("DIRECT_TRANSFER");
    expect(record.tx_hash).toBeNull();
    expect(record.created_at).toBeDefined();
  });

  it("findById returns null for missing", async () => {
    const result = await repo.findById("nonexistent");
    expect(result).toBeNull();
  });

  it("findById returns inserted record", async () => {
    await repo.insert(makeParams());
    const found = await repo.findById("NEX-001");
    expect(found).not.toBeNull();
    expect(found!.xagent_payment_id).toBe("NEX-001");
  });

  it("findByOrderRef returns correct record", async () => {
    await repo.insert(makeParams());
    const found = await repo.findByOrderRef("FLT-001");
    expect(found).not.toBeNull();
    expect(found!.merchant_order_ref).toBe("FLT-001");
  });

  it("findByQuoteHash excludes EXPIRED and TX_FAILED", async () => {
    await repo.insert(makeParams());
    await repo.updateStatus("NEX-001", "EXPIRED");
    const found = await repo.findByQuoteHash("0xhash1");
    expect(found).toBeNull();
  });

  it("updateStatus returns a new immutable record", async () => {
    const original = await repo.insert(makeParams());
    // small delay so updated_at differs
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.updateStatus("NEX-001", "AWAITING_TX");
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("AWAITING_TX");
    // Original reference still shows CREATED (immutable pattern)
    expect(original.status).toBe("CREATED");
    // updated_at should differ
    expect(updated!.updated_at).not.toBe(original.updated_at);
  });

  it("updateStatus returns null for missing payment", async () => {
    const result = await repo.updateStatus("nonexistent", "SETTLED");
    expect(result).toBeNull();
  });

  it("updateStatus with extra fields merges them", async () => {
    await repo.insert(makeParams());
    const updated = await repo.updateStatus("NEX-001", "BROADCASTED", {
      tx_hash: "0xtx1",
    });
    expect(updated!.tx_hash).toBe("0xtx1");
  });

  it("findExpiredAwaiting filters correctly", async () => {
    const pastExpiry = new Date(Date.now() - 60_000).toISOString();
    const futureExpiry = new Date(Date.now() + 60_000).toISOString();

    await repo.insert(
      makeParams({ xagent_payment_id: "NEX-EXP", expires_at: pastExpiry }),
    );
    await repo.insert(
      makeParams({
        xagent_payment_id: "NEX-FUTURE",
        quote_hash: "0xhash2",
        expires_at: futureExpiry,
      }),
    );

    const expired = await repo.findExpiredAwaiting(new Date().toISOString());
    expect(expired).toHaveLength(1);
    expect(expired[0].xagent_payment_id).toBe("NEX-EXP");
  });

  it("findExpiredEscrowed filters by release_deadline", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await repo.insert(makeParams({ xagent_payment_id: "NEX-ESC" }));
    await repo.updateStatus("NEX-ESC", "ESCROWED", {
      release_deadline: past,
    });

    // Need to transition through valid states for this test
    // The mock doesn't enforce transition rules — tests for that are elsewhere
    const results = await repo.findExpiredEscrowed(new Date().toISOString());
    expect(results).toHaveLength(1);
    expect(results[0].xagent_payment_id).toBe("NEX-ESC");
  });
});
