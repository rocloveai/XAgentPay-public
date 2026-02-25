import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { HealthChecker } from "../../services/health-checker.js";
import { MockMerchantRepository } from "../mocks/mock-merchant-repo.js";
import type { MerchantRecord } from "../../types.js";

function makeMerchant(overrides?: Partial<MerchantRecord>): MerchantRecord {
  const now = new Date().toISOString();
  return {
    merchant_did: "did:nexus:20250407:test",
    name: "Test Agent",
    description: "Test",
    signer_address: "0x1234567890abcdef1234567890abcdef12345678",
    payment_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    webhook_url: null,
    webhook_secret: null,
    category: "general",
    skill_md_url: "https://example.com/skill.md",
    health_url: "https://example.com/health",
    mcp_endpoint: null,
    skill_name: null,
    skill_version: null,
    skill_protocol: null,
    skill_tools: [],
    currencies: ["USDC"],
    chain_id: null,
    health_status: "UNKNOWN",
    last_health_check: null,
    last_health_latency_ms: null,
    consecutive_failures: 0,
    is_verified: false,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("HealthChecker", () => {
  let repo: MockMerchantRepository;
  let checker: HealthChecker;

  beforeEach(() => {
    repo = new MockMerchantRepository();
    checker = new HealthChecker(repo, 60_000);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    checker.stop();
  });

  it("checkOne: HTTP 200 → ONLINE with 0 failures", async () => {
    const merchant = makeMerchant();
    repo.seed(merchant);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("ok", { status: 200 }),
    );

    await checker.checkOne(merchant);

    const updated = await repo.findByDid(merchant.merchant_did);
    expect(updated?.health_status).toBe("ONLINE");
    expect(updated?.consecutive_failures).toBe(0);
    expect(updated?.last_health_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("checkOne: HTTP 500 → DEGRADED when failures < 3", async () => {
    const merchant = makeMerchant({ consecutive_failures: 1 });
    repo.seed(merchant);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );

    await checker.checkOne(merchant);

    const updated = await repo.findByDid(merchant.merchant_did);
    expect(updated?.health_status).toBe("DEGRADED");
    expect(updated?.consecutive_failures).toBe(2);
  });

  it("checkOne: HTTP 500 × 3 → OFFLINE", async () => {
    const merchant = makeMerchant({ consecutive_failures: 2 });
    repo.seed(merchant);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );

    await checker.checkOne(merchant);

    const updated = await repo.findByDid(merchant.merchant_did);
    expect(updated?.health_status).toBe("OFFLINE");
    expect(updated?.consecutive_failures).toBe(3);
  });

  it("checkOne: network error → DEGRADED/OFFLINE", async () => {
    const merchant = makeMerchant({ consecutive_failures: 0 });
    repo.seed(merchant);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    await checker.checkOne(merchant);

    const updated = await repo.findByDid(merchant.merchant_did);
    expect(updated?.health_status).toBe("DEGRADED");
    expect(updated?.consecutive_failures).toBe(1);
  });

  it("checkAll: checks multiple merchants concurrently", async () => {
    const m1 = makeMerchant({ merchant_did: "did:nexus:agent001" });
    const m2 = makeMerchant({ merchant_did: "did:nexus:agent002" });
    repo.seed([m1, m2]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response("err", { status: 503 }));

    await checker.checkAll();

    const u1 = await repo.findByDid("did:nexus:agent001");
    const u2 = await repo.findByDid("did:nexus:agent002");
    expect(u1?.health_status).toBe("ONLINE");
    expect(u2?.health_status).toBe("DEGRADED");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
