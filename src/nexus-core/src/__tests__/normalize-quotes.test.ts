import { describe, it, expect } from "vitest";
import { normalizeQuotes } from "../normalize-quotes.js";

const MOCK_QUOTE = {
  merchant_did: "did:nexus:20250407:demo_flight",
  merchant_order_ref: "FLT-001",
  amount: "100000",
  currency: "USDC",
  chain_id: 20250407,
  expiry: 9999999999,
  context: {
    summary: "Test flight",
    line_items: [{ name: "Flight", qty: 1, amount: "530000" }],
    original_amount: "530000",
    payer_wallet: "0x1234",
  },
  signature: "0xdeadbeef",
};

describe("normalizeQuotes", () => {
  it("passes through raw NexusQuotePayload with correct types", () => {
    const result = normalizeQuotes([MOCK_QUOTE]);
    expect(result).toHaveLength(1);
    const q = result[0] as Record<string, unknown>;
    expect(q.merchant_did).toBe(MOCK_QUOTE.merchant_did);
    expect(q.amount).toBe("100000");
    expect(typeof q.amount).toBe("string");
  });

  it("extracts config from full UCP envelope", () => {
    const ucpEnvelope = {
      ucp: {
        version: "2026-01-11",
        payment_handlers: {
          "urn:ucp:payment:nexus_v1": [
            {
              id: "nexus_handler_1",
              version: "v1",
              config: MOCK_QUOTE,
              nexus_core: {
                skill_url: "https://example.com/skill.md",
                mcp_endpoint: "https://example.com/sse",
              },
            },
          ],
        },
      },
      id: "FLT-001",
      status: "ready_for_complete",
    };

    const result = normalizeQuotes([ucpEnvelope]);
    expect(result).toHaveLength(1);
    const q = result[0] as Record<string, unknown>;
    expect(q.merchant_did).toBe(MOCK_QUOTE.merchant_did);
  });

  it("extracts config from handler object", () => {
    const handler = {
      id: "nexus_handler_1",
      version: "v1",
      config: MOCK_QUOTE,
      nexus_core: { mcp_endpoint: "https://example.com/sse" },
    };

    const result = normalizeQuotes([handler]);
    expect(result).toHaveLength(1);
    const q = result[0] as Record<string, unknown>;
    expect(q.merchant_did).toBe(MOCK_QUOTE.merchant_did);
  });

  it("handles mixed shapes (raw + UCP envelope)", () => {
    const quote2 = { ...MOCK_QUOTE, merchant_order_ref: "HTL-001" };
    const ucpEnvelope = {
      ucp: {
        payment_handlers: {
          "urn:ucp:payment:nexus_v1": [{ config: quote2 }],
        },
      },
    };

    const result = normalizeQuotes([MOCK_QUOTE, ucpEnvelope]);
    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>).merchant_order_ref).toBe(
      "FLT-001",
    );
    expect((result[1] as Record<string, unknown>).merchant_order_ref).toBe(
      "HTL-001",
    );
  });

  it("extracts multiple handlers from a single UCP envelope", () => {
    const quote2 = { ...MOCK_QUOTE, merchant_order_ref: "HTL-001" };
    const ucpEnvelope = {
      ucp: {
        payment_handlers: {
          "urn:ucp:payment:nexus_v1": [
            { config: MOCK_QUOTE },
            { config: quote2 },
          ],
        },
      },
    };

    const result = normalizeQuotes([ucpEnvelope]);
    expect(result).toHaveLength(2);
  });

  it("passes through null/undefined/primitives for downstream validation", () => {
    const result = normalizeQuotes([null, undefined, 42, "bad"]);
    expect(result).toHaveLength(4);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeUndefined();
    expect(result[2]).toBe(42);
    expect(result[3]).toBe("bad");
  });

  it("passes through unrecognized objects for downstream validation", () => {
    const unknown = { foo: "bar" };
    const result = normalizeQuotes([unknown]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(unknown);
  });

  it("handles empty array", () => {
    const result = normalizeQuotes([]);
    expect(result).toHaveLength(0);
  });

  // Type coercion tests
  describe("type coercion", () => {
    it("coerces numeric amount back to string", () => {
      const coerced = {
        ...MOCK_QUOTE,
        amount: 100000, // number instead of string
      };
      const result = normalizeQuotes([coerced]);
      const q = result[0] as Record<string, unknown>;
      expect(q.amount).toBe("100000");
      expect(typeof q.amount).toBe("string");
    });

    it("coerces string chain_id to number", () => {
      const coerced = {
        ...MOCK_QUOTE,
        chain_id: "20250407", // string instead of number
      };
      const result = normalizeQuotes([coerced]);
      const q = result[0] as Record<string, unknown>;
      expect(q.chain_id).toBe(20250407);
      expect(typeof q.chain_id).toBe("number");
    });

    it("coerces string expiry to number", () => {
      const coerced = {
        ...MOCK_QUOTE,
        expiry: "9999999999",
      };
      const result = normalizeQuotes([coerced]);
      const q = result[0] as Record<string, unknown>;
      expect(q.expiry).toBe(9999999999);
      expect(typeof q.expiry).toBe("number");
    });

    it("coerces numeric line_items amounts to strings", () => {
      const coerced = {
        ...MOCK_QUOTE,
        context: {
          ...MOCK_QUOTE.context,
          line_items: [{ name: "Flight", qty: 1, amount: 530000 }],
          original_amount: 530000,
        },
      };
      const result = normalizeQuotes([coerced]);
      const q = result[0] as Record<string, unknown>;
      const ctx = q.context as Record<string, unknown>;
      const items = ctx.line_items as { amount: string }[];
      expect(items[0].amount).toBe("530000");
      expect(typeof items[0].amount).toBe("string");
      expect(ctx.original_amount).toBe("530000");
    });

    it("preserves context_hash consistency after coercion", () => {
      // The whole point: after coercion, JSON.stringify(context) should
      // produce the same result as the merchant's original
      const original = JSON.stringify(MOCK_QUOTE.context);

      const coerced = {
        ...MOCK_QUOTE,
        context: {
          ...MOCK_QUOTE.context,
          line_items: [{ name: "Flight", qty: 1, amount: 530000 }],
          original_amount: 530000,
        },
      };
      const result = normalizeQuotes([coerced]);
      const q = result[0] as Record<string, unknown>;
      const normalized = JSON.stringify(q.context);

      expect(normalized).toBe(original);
    });
  });
});
