import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { HealthChecker } from "../../services/health-checker.js";
import { MockMarketRepository } from "../mocks/mock-market-repo.js";
import type { MarketAgentRecord } from "../../types.js";

function makeAgent(overrides?: Partial<MarketAgentRecord>): MarketAgentRecord {
  const now = new Date().toISOString();
  return {
    agent_id: "AGT-test0001",
    name: "Test Agent",
    description: "Test",
    category: "general",
    skill_md_url: "https://example.com/skill.md",
    health_url: "https://example.com/health",
    mcp_endpoint: null,
    merchant_did: null,
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
  let repo: MockMarketRepository;
  let checker: HealthChecker;

  beforeEach(() => {
    repo = new MockMarketRepository();
    checker = new HealthChecker(repo, 60_000);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    checker.stop();
  });

  it("checkOne: HTTP 200 → ONLINE with 0 failures", async () => {
    const agent = makeAgent();
    repo.seed(agent);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("ok", { status: 200 }),
    );

    await checker.checkOne(agent);

    const updated = await repo.findById(agent.agent_id);
    expect(updated?.health_status).toBe("ONLINE");
    expect(updated?.consecutive_failures).toBe(0);
    expect(updated?.last_health_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("checkOne: HTTP 500 → DEGRADED when failures < 3", async () => {
    const agent = makeAgent({ consecutive_failures: 1 });
    repo.seed(agent);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );

    await checker.checkOne(agent);

    const updated = await repo.findById(agent.agent_id);
    expect(updated?.health_status).toBe("DEGRADED");
    expect(updated?.consecutive_failures).toBe(2);
  });

  it("checkOne: HTTP 500 × 3 → OFFLINE", async () => {
    const agent = makeAgent({ consecutive_failures: 2 });
    repo.seed(agent);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );

    await checker.checkOne(agent);

    const updated = await repo.findById(agent.agent_id);
    expect(updated?.health_status).toBe("OFFLINE");
    expect(updated?.consecutive_failures).toBe(3);
  });

  it("checkOne: network error → DEGRADED/OFFLINE", async () => {
    const agent = makeAgent({ consecutive_failures: 0 });
    repo.seed(agent);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    await checker.checkOne(agent);

    const updated = await repo.findById(agent.agent_id);
    expect(updated?.health_status).toBe("DEGRADED");
    expect(updated?.consecutive_failures).toBe(1);
  });

  it("checkAll: checks multiple agents concurrently", async () => {
    const a1 = makeAgent({ agent_id: "AGT-agent001" });
    const a2 = makeAgent({ agent_id: "AGT-agent002" });
    repo.seed([a1, a2]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response("err", { status: 503 }));

    await checker.checkAll();

    const u1 = await repo.findById("AGT-agent001");
    const u2 = await repo.findById("AGT-agent002");
    expect(u1?.health_status).toBe("ONLINE");
    expect(u2?.health_status).toBe("DEGRADED");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
