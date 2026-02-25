import { describe, it, expect, beforeEach } from "vitest";
import { handleMarketRequest, type MarketDeps } from "../market.js";
import { MockMarketRepository } from "./mocks/mock-market-repo.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NexusCoreConfig } from "../config.js";
import type { MarketAgentRecord } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers — minimal mock HTTP objects
// ---------------------------------------------------------------------------

function makeReq(
  method: string,
  path: string,
  extraHeaders: Record<string, string> = {},
  body?: string,
): { req: IncomingMessage; url: URL } {
  const chunks: Buffer[] = body ? [Buffer.from(body)] : [];
  const req = {
    method,
    url: path,
    headers: { host: "localhost:4000", ...extraHeaders },
    on(event: string, cb: (arg?: unknown) => void) {
      if (event === "data") {
        for (const chunk of chunks) cb(chunk);
      }
      if (event === "end") cb();
      return req;
    },
  } as unknown as IncomingMessage;
  const url = new URL(path, "http://localhost:4000");
  return { req, url };
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead(status: number, headers?: Record<string, string>): void;
  end(body?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      res.statusCode = status;
      if (headers) Object.assign(res.headers, headers);
    },
    end(body?: string) {
      res.body = body ?? "";
    },
  };
  return res;
}

function makeConfig(overrides?: Partial<NexusCoreConfig>): NexusCoreConfig {
  return {
    databaseUrl: "",
    escrowContract: "0x0000000000000000000000000000000000000000",
    chainId: 20250407,
    chainName: "PlatON Devnet",
    usdcAddress: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
    usdcDecimals: 6,
    protocolFeeBps: 30,
    releaseTimeoutS: 86400,
    disputeWindowS: 259200,
    port: 4000,
    rpcUrl: "https://devnet3openapi.platon.network/rpc",
    relayerPrivateKey: "",
    watcherIntervalMs: 15000,
    timeoutSweepIntervalMs: 60000,
    webhookRetryIntervalMs: 30000,
    arbitrationTimeoutS: 604800,
    portalToken: "test-token",
    baseUrl: "http://localhost:4000",
    ...overrides,
  };
}

function makeAgent(overrides?: Partial<MarketAgentRecord>): MarketAgentRecord {
  const now = new Date().toISOString();
  return {
    agent_id: "AGT-test1234",
    name: "Test Agent",
    description: "A test agent",
    category: "travel.hotels",
    skill_md_url: "https://example.com/skill.md",
    health_url: "https://example.com/health",
    mcp_endpoint: "https://example.com/sse",
    merchant_did: "did:nexus:20250407:test",
    skill_name: "Test",
    skill_version: "0.1.0",
    skill_protocol: "MCP",
    skill_tools: [{ name: "search", role: "search" }],
    currencies: ["USDC"],
    chain_id: 20250407,
    health_status: "ONLINE",
    last_health_check: now,
    last_health_latency_ms: 150,
    consecutive_failures: 0,
    is_verified: true,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Market", () => {
  let marketRepo: MockMarketRepository;
  let deps: MarketDeps;

  beforeEach(() => {
    marketRepo = new MockMarketRepository();
    deps = { marketRepo, config: makeConfig() };
  });

  // -----------------------------------------------------------------------
  // GET /market — HTML page
  // -----------------------------------------------------------------------

  it("GET /market returns HTML page", async () => {
    const { req, url } = makeReq("GET", "/market");
    const res = makeRes();
    const handled = await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(res.body).toContain("Agent Marketplace");
  });

  // -----------------------------------------------------------------------
  // GET /api/market/agents — list
  // -----------------------------------------------------------------------

  it("GET /api/market/agents returns agents array", async () => {
    marketRepo.seed(makeAgent());
    const { req, url } = makeReq("GET", "/api/market/agents");
    const res = makeRes();
    const handled = await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.agents).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.agents[0].agent_id).toBe("AGT-test1234");
  });

  it("GET /api/market/agents with category filter", async () => {
    marketRepo.seed([
      makeAgent({ agent_id: "AGT-hotel001", category: "travel.hotels" }),
      makeAgent({ agent_id: "AGT-flight01", category: "travel.flights" }),
      makeAgent({ agent_id: "AGT-food0001", category: "food.delivery" }),
    ]);
    const { req, url } = makeReq("GET", "/api/market/agents?category=travel");
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    const data = JSON.parse(res.body);
    expect(data.agents).toHaveLength(2);
    expect(data.agents.every((a: { category: string }) => a.category.startsWith("travel"))).toBe(true);
  });

  it("GET /api/market/agents returns empty array when no agents", async () => {
    const { req, url } = makeReq("GET", "/api/market/agents");
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    const data = JSON.parse(res.body);
    expect(data.agents).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  // -----------------------------------------------------------------------
  // GET /api/market/agents/:agentId — detail
  // -----------------------------------------------------------------------

  it("GET /api/market/agents/:agentId returns agent detail", async () => {
    marketRepo.seed(makeAgent({ agent_id: "AGT-abc12345" }));
    const { req, url } = makeReq("GET", "/api/market/agents/AGT-abc12345");
    const res = makeRes();
    const handled = await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.agent.agent_id).toBe("AGT-abc12345");
  });

  it("GET /api/market/agents/:agentId returns 404 for nonexistent", async () => {
    const { req, url } = makeReq("GET", "/api/market/agents/AGT-noexist0");
    const res = makeRes();
    const handled = await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
    const data = JSON.parse(res.body);
    expect(data.error).toBe("Agent not found");
  });

  // -----------------------------------------------------------------------
  // POST /api/market/register
  // -----------------------------------------------------------------------

  it("POST /api/market/register creates agent with valid body", async () => {
    const body = JSON.stringify({
      name: "My Agent",
      description: "Test description",
      category: "travel.hotels",
      skill_md_url: "https://example.com/skill.md",
      health_url: "https://example.com/health",
    });
    const { req, url } = makeReq("POST", "/api/market/register", {
      authorization: "Bearer test-token",
    }, body);
    const res = makeRes();
    const handled = await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.agent.name).toBe("My Agent");
    expect(data.agent.agent_id).toMatch(/^AGT-[a-z0-9]{8}$/);
  });

  it("POST /api/market/register returns 400 on missing fields", async () => {
    const body = JSON.stringify({ name: "Incomplete" });
    const { req, url } = makeReq("POST", "/api/market/register", {
      authorization: "Bearer test-token",
    }, body);
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("Missing required fields");
  });

  it("POST /api/market/register returns 401 without auth", async () => {
    const body = JSON.stringify({
      name: "My Agent",
      description: "Test",
      category: "general",
      skill_md_url: "https://example.com/skill.md",
      health_url: "https://example.com/health",
    });
    const { req, url } = makeReq("POST", "/api/market/register", {}, body);
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(401);
    const data = JSON.parse(res.body);
    expect(data.error).toBe("Unauthorized");
  });

  // -----------------------------------------------------------------------
  // OPTIONS — CORS preflight
  // -----------------------------------------------------------------------

  it("OPTIONS /api/market/agents returns CORS headers", async () => {
    const { req, url } = makeReq("OPTIONS", "/api/market/agents");
    const res = makeRes();
    const handled = await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Access-Control-Allow-Methods"]).toContain("POST");
  });

  // -----------------------------------------------------------------------
  // Unmatched routes
  // -----------------------------------------------------------------------

  it("returns false for unmatched routes", async () => {
    const { req, url } = makeReq("GET", "/api/other");
    const res = makeRes();
    const handled = await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(handled).toBe(false);
  });

  it("POST /api/market/register returns 400 on invalid JSON", async () => {
    const { req, url } = makeReq("POST", "/api/market/register", {
      authorization: "Bearer test-token",
    }, "not json");
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toBe("Invalid JSON");
  });
});
