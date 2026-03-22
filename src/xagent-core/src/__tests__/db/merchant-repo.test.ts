import { describe, it, expect, beforeEach } from "vitest";
import { MockMerchantRepository } from "../mocks/mock-merchant-repo.js";
import type { MerchantRecord } from "../../types.js";

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

const FLIGHT_MERCHANT: MerchantRecord = {
  ...MARKET_DEFAULTS,
  merchant_did: "did:xagent:210425:demo_flight",
  name: "Demo Flight Agent",
  signer_address: "0x0000000000000000000000000000000000000001",
  payment_address: "0x0000000000000000000000000000000000000002",
  webhook_url: "http://localhost:3001/webhook",
  webhook_secret: "secret1",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const HOTEL_MERCHANT: MerchantRecord = {
  ...MARKET_DEFAULTS,
  merchant_did: "did:xagent:210425:demo_hotel",
  name: "Demo Hotel Agent",
  signer_address: "0x0000000000000000000000000000000000000003",
  payment_address: "0x0000000000000000000000000000000000000004",
  webhook_url: "http://localhost:3002/webhook",
  webhook_secret: "secret2",
  is_active: true,
  created_at: "2026-01-02T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

const INACTIVE_MERCHANT: MerchantRecord = {
  ...FLIGHT_MERCHANT,
  merchant_did: "did:xagent:210425:inactive",
  name: "Inactive Merchant",
  is_active: false,
};

describe("MockMerchantRepository", () => {
  let repo: MockMerchantRepository;

  beforeEach(() => {
    repo = new MockMerchantRepository();
    repo.seed(FLIGHT_MERCHANT);
    repo.seed(HOTEL_MERCHANT);
  });

  it("findByDid returns correct record", async () => {
    const found = await repo.findByDid("did:xagent:210425:demo_flight");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Demo Flight Agent");
    expect(found!.signer_address).toBe(
      "0x0000000000000000000000000000000000000001",
    );
  });

  it("findByDid returns null for unknown DID", async () => {
    const found = await repo.findByDid("did:xagent:210425:unknown");
    expect(found).toBeNull();
  });

  it("findByDid returns null for inactive merchant", async () => {
    repo.seed(INACTIVE_MERCHANT);
    const found = await repo.findByDid("did:xagent:210425:inactive");
    expect(found).toBeNull();
  });

  it("listAll returns all active merchants", async () => {
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
  });

  it("listAll excludes inactive merchants", async () => {
    repo.seed(INACTIVE_MERCHANT);
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
    const dids = all.map((m) => m.merchant_did);
    expect(dids).not.toContain("did:xagent:210425:inactive");
  });

  it("listAll returns merchants sorted by created_at", async () => {
    const all = await repo.listAll();
    expect(all[0].merchant_did).toBe("did:xagent:210425:demo_flight");
    expect(all[1].merchant_did).toBe("did:xagent:210425:demo_hotel");
  });
});
