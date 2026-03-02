import { describe, it, expect, beforeEach } from "vitest";
import { handleMarketRequest, type MarketDeps } from "../market.js";
import { MockMerchantRepository } from "./mocks/mock-merchant-repo.js";
import { MockStarRepository } from "./mocks/mock-star-repo.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NexusCoreConfig } from "../config.js";
import type { MerchantRecord } from "../types.js";

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

function makeMerchant(overrides?: Partial<MerchantRecord>): MerchantRecord {
  const now = new Date().toISOString();
  return {
    merchant_did: "did:nexus:20250407:test",
    name: "Test Agent",
    description: "A test agent",
    signer_address: "0x1234567890abcdef1234567890abcdef12345678",
    payment_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    webhook_url: null,
    webhook_secret: null,
    category: "travel.hotels",
    skill_md_url: "https://example.com/skill.md",
    health_url: "https://example.com/health",
    mcp_endpoint: "https://example.com/mcp",
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
  let merchantRepo: MockMerchantRepository;
  let starRepo: MockStarRepository;
  let deps: MarketDeps;

  beforeEach(() => {
    merchantRepo = new MockMerchantRepository();
    starRepo = new MockStarRepository();
    deps = { merchantRepo, starRepo, config: makeConfig() };
  });

  // -----------------------------------------------------------------------
  // GET /market — HTML page
  // -----------------------------------------------------------------------

  it("GET /market returns HTML page", async () => {
    const { req, url } = makeReq("GET", "/market");
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(res.body).toContain("Commercial Agent Marketplace");
  });

  // -----------------------------------------------------------------------
  // GET /api/market/agents — list
  // -----------------------------------------------------------------------

  it("GET /api/market/agents returns agents array", async () => {
    merchantRepo.seed(makeMerchant());
    const { req, url } = makeReq("GET", "/api/market/agents");
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.agents).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.agents[0].merchant_did).toBe("did:nexus:20250407:test");
  });

  it("GET /api/market/agents with category filter", async () => {
    merchantRepo.seed([
      makeMerchant({
        merchant_did: "did:nexus:hotel",
        category: "travel.hotels",
      }),
      makeMerchant({
        merchant_did: "did:nexus:flight",
        category: "travel.flights",
      }),
      makeMerchant({
        merchant_did: "did:nexus:food",
        category: "food.delivery",
      }),
    ]);
    const { req, url } = makeReq("GET", "/api/market/agents?category=travel");
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    const data = JSON.parse(res.body);
    expect(data.agents).toHaveLength(2);
    expect(
      data.agents.every((a: { category: string }) =>
        a.category.startsWith("travel"),
      ),
    ).toBe(true);
  });

  it("GET /api/market/agents returns empty array when no agents", async () => {
    const { req, url } = makeReq("GET", "/api/market/agents");
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    const data = JSON.parse(res.body);
    expect(data.agents).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it("GET /api/market/agents excludes merchants without skill_md_url", async () => {
    merchantRepo.seed([
      makeMerchant({
        merchant_did: "did:nexus:with_skill",
        skill_md_url: "https://example.com/skill.md",
      }),
      makeMerchant({ merchant_did: "did:nexus:no_skill", skill_md_url: null }),
    ]);
    const { req, url } = makeReq("GET", "/api/market/agents");
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    const data = JSON.parse(res.body);
    expect(data.agents).toHaveLength(1);
    expect(data.agents[0].merchant_did).toBe("did:nexus:with_skill");
  });

  // -----------------------------------------------------------------------
  // GET /api/market/agents/:merchantDid — detail
  // -----------------------------------------------------------------------

  it("GET /api/market/agents/:merchantDid returns agent detail", async () => {
    merchantRepo.seed(makeMerchant({ merchant_did: "did:nexus:20250407:abc" }));
    const { req, url } = makeReq(
      "GET",
      "/api/market/agents/did:nexus:20250407:abc",
    );
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.agent.merchant_did).toBe("did:nexus:20250407:abc");
  });

  it("GET /api/market/agents/:merchantDid returns 404 for nonexistent", async () => {
    const { req, url } = makeReq("GET", "/api/market/agents/did:nexus:noexist");
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
    const data = JSON.parse(res.body);
    expect(data.error).toBe("Agent not found");
  });

  // -----------------------------------------------------------------------
  // POST /api/market/register — unified registration
  // -----------------------------------------------------------------------

  it("POST /api/market/register creates merchant with valid body", async () => {
    const body = JSON.stringify({
      merchant_did: "did:nexus:20250407:new",
      name: "My Agent",
      description: "Test description",
      category: "travel.hotels",
      signer_address: "0x1111111111111111111111111111111111111111",
      payment_address: "0x2222222222222222222222222222222222222222",
      skill_md_url: "https://example.com/skill.md",
      health_url: "https://example.com/health",
    });
    const { req, url } = makeReq(
      "POST",
      "/api/market/register",
      {
        authorization: "Bearer test-token",
      },
      body,
    );
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.agent.name).toBe("My Agent");
    expect(data.agent.merchant_did).toBe("did:nexus:20250407:new");
  });

  it("POST /api/market/register returns 400 on missing fields", async () => {
    const body = JSON.stringify({ name: "Incomplete" });
    const { req, url } = makeReq(
      "POST",
      "/api/market/register",
      {
        authorization: "Bearer test-token",
      },
      body,
    );
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("Missing required fields");
  });

  it("POST /api/market/register returns 401 without auth", async () => {
    const body = JSON.stringify({
      merchant_did: "did:nexus:20250407:new",
      name: "My Agent",
      description: "Test",
      category: "general",
      signer_address: "0x1111111111111111111111111111111111111111",
      payment_address: "0x2222222222222222222222222222222222222222",
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
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

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
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(false);
  });

  it("POST /api/market/register returns 400 on invalid JSON", async () => {
    const { req, url } = makeReq(
      "POST",
      "/api/market/register",
      {
        authorization: "Bearer test-token",
      },
      "not json",
    );
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toBe("Invalid JSON");
  });

  // -----------------------------------------------------------------------
  // Star endpoints
  // -----------------------------------------------------------------------

  const VALID_WALLET = "0x1234567890abcdef1234567890abcdef12345678";
  const MERCHANT_DID = "did:nexus:20250407:test";

  it("POST /star adds star and returns 201", async () => {
    const body = JSON.stringify({ wallet_address: VALID_WALLET });
    const { req, url } = makeReq(
      "POST",
      `/api/market/agents/${MERCHANT_DID}/star`,
      {},
      body,
    );
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.starred).toBe(true);
    expect(data.star_count).toBe(1);
  });

  it("POST /star returns 200 on duplicate (idempotent)", async () => {
    await starRepo.addStar(MERCHANT_DID, VALID_WALLET);
    const body = JSON.stringify({ wallet_address: VALID_WALLET });
    const { req, url } = makeReq(
      "POST",
      `/api/market/agents/${MERCHANT_DID}/star`,
      {},
      body,
    );
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.starred).toBe(true);
    expect(data.star_count).toBe(1);
  });

  it("POST /star returns 400 on missing wallet_address", async () => {
    const body = JSON.stringify({});
    const { req, url } = makeReq(
      "POST",
      `/api/market/agents/${MERCHANT_DID}/star`,
      {},
      body,
    );
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("Invalid wallet_address");
  });

  it("POST /star returns 400 on invalid wallet_address format", async () => {
    const body = JSON.stringify({ wallet_address: "not-a-wallet" });
    const { req, url } = makeReq(
      "POST",
      `/api/market/agents/${MERCHANT_DID}/star`,
      {},
      body,
    );
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("Invalid wallet_address");
  });

  it("DELETE /star removes star", async () => {
    await starRepo.addStar(MERCHANT_DID, VALID_WALLET);
    const body = JSON.stringify({ wallet_address: VALID_WALLET });
    const { req, url } = makeReq(
      "DELETE",
      `/api/market/agents/${MERCHANT_DID}/star`,
      {},
      body,
    );
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.starred).toBe(false);
    expect(data.star_count).toBe(0);
  });

  it("DELETE /star returns 200 even when star didn't exist", async () => {
    const body = JSON.stringify({ wallet_address: VALID_WALLET });
    const { req, url } = makeReq(
      "DELETE",
      `/api/market/agents/${MERCHANT_DID}/star`,
      {},
      body,
    );
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.starred).toBe(false);
  });

  it("GET /stars returns star count and has_starred", async () => {
    await starRepo.addStar(MERCHANT_DID, VALID_WALLET);
    await starRepo.addStar(
      MERCHANT_DID,
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const { req, url } = makeReq(
      "GET",
      `/api/market/agents/${MERCHANT_DID}/stars?wallet_address=${VALID_WALLET}`,
    );
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.star_count).toBe(2);
    expect(data.has_starred).toBe(true);
  });

  it("GET /stars without wallet_address returns has_starred=false", async () => {
    await starRepo.addStar(MERCHANT_DID, VALID_WALLET);
    const { req, url } = makeReq(
      "GET",
      `/api/market/agents/${MERCHANT_DID}/stars`,
    );
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    const data = JSON.parse(res.body);
    expect(data.star_count).toBe(1);
    expect(data.has_starred).toBe(false);
  });

  it("Agent listing includes star_count field", async () => {
    merchantRepo.seed(makeMerchant());
    await starRepo.addStar("did:nexus:20250407:test", VALID_WALLET);
    const { req, url } = makeReq("GET", "/api/market/agents");
    const res = makeRes();
    await handleMarketRequest(deps, req, res as unknown as ServerResponse, url);

    const data = JSON.parse(res.body);
    expect(data.agents[0].star_count).toBe(1);
  });

  it("OPTIONS preflight includes DELETE method", async () => {
    const { req, url } = makeReq("OPTIONS", "/api/market/agents/foo/star");
    const res = makeRes();
    const handled = await handleMarketRequest(
      deps,
      req,
      res as unknown as ServerResponse,
      url,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Methods"]).toContain("DELETE");
  });
});
