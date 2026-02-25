import { describe, it, expect } from "vitest";
import { normalizeQuotes } from "../normalize-quotes.js";

const MOCK_QUOTE = {
  merchant_did: "did:nexus:20250407:demo_flight",
  merchant_order_ref: "FLT-001",
  amount: "100000",
  currency: "USDC",
  chain_id: 20250407,
  expiry: 9999999999,
  context: { summary: "Test flight", line_items: [] },
  signature: "0xdeadbeef",
};

describe("normalizeQuotes", () => {
  it("passes through raw NexusQuotePayload unchanged", () => {
    const result = normalizeQuotes([MOCK_QUOTE]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(MOCK_QUOTE);
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
    expect(result[0]).toBe(MOCK_QUOTE);
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
    expect(result[0]).toBe(MOCK_QUOTE);
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
    expect(result[0]).toBe(MOCK_QUOTE);
    expect(result[1]).toBe(quote2);
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
    expect(result[0]).toBe(MOCK_QUOTE);
    expect(result[1]).toBe(quote2);
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
});
