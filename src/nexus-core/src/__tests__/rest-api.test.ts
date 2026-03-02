import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { handleRestApiRequest, type RestApiDeps } from "../rest-api.js";
import { MockMerchantRepository } from "./mocks/mock-merchant-repo.js";
import { MockPaymentRepository } from "./mocks/mock-payment-repo.js";
import { MockStarRepository } from "./mocks/mock-star-repo.js";
import type {
  MerchantRecord,
  PaymentRecord,
  PaymentGroupRecord,
} from "../types.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NexusOrchestrator } from "../services/orchestrator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMerchant(overrides?: Partial<MerchantRecord>): MerchantRecord {
  const now = new Date().toISOString();
  return {
    merchant_did: "did:nexus:20250407:test",
    name: "Test Agent",
    description: "A test agent for flights",
    signer_address: "0x1234567890abcdef1234567890abcdef12345678",
    payment_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    webhook_url: null,
    webhook_secret: null,
    category: "travel.flights",
    skill_md_url: "https://example.com/skill.md",
    health_url: "https://example.com/health",
    mcp_endpoint: "https://example.com/sse",
    skill_name: "FlightSearch",
    skill_version: "0.1.0",
    skill_protocol: "MCP",
    skill_tools: [{ name: "search_flights", role: "search" }],
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

function makePayment(overrides?: Partial<PaymentRecord>): PaymentRecord {
  const now = new Date().toISOString();
  return {
    nexus_payment_id: "PAY-TEST-001",
    group_id: "GRP-TEST-001",
    quote_hash: "0xabc",
    merchant_did: "did:nexus:20250407:test",
    merchant_order_ref: "FLT-001",
    payer_wallet: "0x1111111111111111111111111111111111111111",
    payment_address: "0x2222222222222222222222222222222222222222",
    amount: "100000",
    amount_display: "0.10",
    currency: "USDC",
    chain_id: 20250407,
    status: "ESCROWED",
    payment_method: "ESCROW_CONTRACT",
    tx_hash: "0xtx123",
    block_number: 12345,
    block_timestamp: now,
    quote_payload: {
      merchant_did: "did:nexus:20250407:test",
      merchant_order_ref: "FLT-001",
      amount: "100000",
      currency: "USDC",
      chain_id: 20250407,
      expiry: 9999999999,
      context: { summary: "Flight SFO-LAX", line_items: [] },
      signature: "0xsig",
    },
    iso_metadata: null,
    expires_at: now,
    settled_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    escrow_contract: "0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236",
    payment_id_bytes32: "0xpid123",
    eip3009_nonce: "0xnonce",
    deposit_tx_hash: "0xdep",
    release_tx_hash: null,
    refund_tx_hash: null,
    release_deadline: null,
    dispute_deadline: null,
    protocol_fee: null,
    dispute_reason: null,
    ...overrides,
  };
}

function makeGroup(
  overrides?: Partial<PaymentGroupRecord>,
): PaymentGroupRecord {
  const now = new Date().toISOString();
  return {
    group_id: "GRP-TEST-001",
    payer_wallet: "0x1111111111111111111111111111111111111111",
    total_amount: "100000",
    total_amount_display: "0.10",
    currency: "USDC",
    chain_id: 20250407,
    status: "GROUP_ESCROWED",
    payment_count: 1,
    tx_hash: "0xtx123",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/** Lightweight mock for http.IncomingMessage */
function mockReq(method: string, urlStr: string): IncomingMessage {
  return {
    method,
    url: urlStr,
    headers: { host: "localhost:3000" },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;
}

/** Lightweight mock for http.ServerResponse */
function mockRes(): ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const headers: Record<string, string> = {};
  let body = "";
  let status = 200;
  return {
    get _status() {
      return status;
    },
    get _headers() {
      return headers;
    },
    get _body() {
      return body;
    },
    writeHead(s: number, h?: Record<string, string>) {
      status = s;
      if (h) Object.assign(headers, h);
      return this;
    },
    setHeader(key: string, val: string) {
      headers[key] = val;
      return this;
    },
    end(chunk?: string) {
      if (chunk) body = chunk;
    },
  } as unknown as ServerResponse & {
    _status: number;
    _headers: Record<string, string>;
    _body: string;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rest-api", () => {
  let merchantRepo: MockMerchantRepository;
  let paymentRepo: MockPaymentRepository;
  let starRepo: MockStarRepository;
  let orchestrator: NexusOrchestrator;
  let deps: RestApiDeps;

  beforeEach(() => {
    merchantRepo = new MockMerchantRepository();
    paymentRepo = new MockPaymentRepository();
    starRepo = new MockStarRepository();

    // Mock orchestrator with getPaymentStatus
    orchestrator = {
      getPaymentStatus: vi.fn(),
    } as unknown as NexusOrchestrator;

    deps = {
      orchestrator,
      merchantRepo,
      paymentRepo,
      starRepo,
      kvRepo: null,
      portalToken: "test-portal-token",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Unmatched routes
  // -----------------------------------------------------------------------

  it("returns false for unmatched routes", async () => {
    const req = mockReq("GET", "/some/other/route");
    const res = mockRes();
    const url = new URL(req.url!, "http://localhost:3000");
    const handled = await handleRestApiRequest(deps, req, res, url);
    expect(handled).toBe(false);
  });

  it("skips /api/payments when portal token is present", async () => {
    const req = {
      ...mockReq("GET", "/api/payments?limit=50"),
      headers: {
        host: "localhost:3000",
        authorization: "Bearer test-portal-token",
      },
    } as unknown as IncomingMessage;
    const res = mockRes();
    const url = new URL(req.url!, "http://localhost:3000");
    const handled = await handleRestApiRequest(deps, req, res, url);
    expect(handled).toBe(false); // let portal handle it
  });

  // -----------------------------------------------------------------------
  // CORS preflight
  // -----------------------------------------------------------------------

  it("handles OPTIONS preflight for /api/ routes", async () => {
    const req = mockReq("OPTIONS", "/api/payments");
    const res = mockRes();
    const url = new URL(req.url!, "http://localhost:3000");
    const handled = await handleRestApiRequest(deps, req, res, url);
    expect(handled).toBe(true);
    expect(res._status).toBe(204);
  });

  // -----------------------------------------------------------------------
  // GET /api/payments/:id
  // -----------------------------------------------------------------------

  describe("GET /api/payments/:id", () => {
    it("returns payment and group info", async () => {
      const payment = makePayment();
      const group = makeGroup();
      vi.mocked(orchestrator.getPaymentStatus).mockResolvedValueOnce({
        payment,
        group,
        groupPayments: [payment],
      });

      const req = mockReq("GET", "/api/payments/PAY-TEST-001");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      const handled = await handleRestApiRequest(deps, req, res, url);

      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.payment.nexus_payment_id).toBe("PAY-TEST-001");
      expect(body.payment.status).toBe("ESCROWED");
      expect(body.group.group_id).toBe("GRP-TEST-001");
      expect(body.group_payments).toHaveLength(1);
    });

    it("returns 404 when not found", async () => {
      vi.mocked(orchestrator.getPaymentStatus).mockResolvedValueOnce({
        payment: null,
        group: null,
        groupPayments: [],
      });

      const req = mockReq("GET", "/api/payments/PAY-NOPE");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(404);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("excludes sensitive fields from response", async () => {
      const payment = makePayment();
      vi.mocked(orchestrator.getPaymentStatus).mockResolvedValueOnce({
        payment,
        group: null,
        groupPayments: [],
      });

      const req = mockReq("GET", "/api/payments/PAY-TEST-001");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      const body = JSON.parse(res._body);
      // Should NOT include quote_payload or iso_metadata
      expect(body.payment.quote_payload).toBeUndefined();
      expect(body.payment.iso_metadata).toBeUndefined();
      // Should include basic fields
      expect(body.payment.nexus_payment_id).toBe("PAY-TEST-001");
      expect(body.payment.merchant_did).toBe("did:nexus:20250407:test");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/payments?group_id=...
  // -----------------------------------------------------------------------

  describe("GET /api/payments (query params)", () => {
    it("queries by group_id", async () => {
      const group = makeGroup();
      const payment = makePayment();
      vi.mocked(orchestrator.getPaymentStatus).mockResolvedValueOnce({
        payment: null,
        group,
        groupPayments: [payment],
      });

      const req = mockReq("GET", "/api/payments?group_id=GRP-TEST-001");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(200);
      expect(orchestrator.getPaymentStatus).toHaveBeenCalledWith({
        nexusPaymentId: undefined,
        merchantOrderRef: undefined,
        groupId: "GRP-TEST-001",
      });
    });

    it("queries by merchant_order_ref", async () => {
      const payment = makePayment();
      vi.mocked(orchestrator.getPaymentStatus).mockResolvedValueOnce({
        payment,
        group: null,
        groupPayments: [],
      });

      const req = mockReq("GET", "/api/payments?merchant_order_ref=FLT-001");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(200);
      expect(orchestrator.getPaymentStatus).toHaveBeenCalledWith({
        nexusPaymentId: undefined,
        merchantOrderRef: "FLT-001",
        groupId: undefined,
      });
    });

    it("returns 400 when no query params", async () => {
      const req = mockReq("GET", "/api/payments");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe("MISSING_PARAMS");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/agents
  // -----------------------------------------------------------------------

  describe("GET /api/agents", () => {
    it("returns all agents as JSON", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:nexus:20250407:a", name: "Agent A" }),
        makeMerchant({ merchant_did: "did:nexus:20250407:b", name: "Agent B" }),
      ]);

      const req = mockReq("GET", "/api/agents");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.agents).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.agents[0].merchant_did).toBeDefined();
      expect(body.agents[0].name).toBeDefined();
      expect(body.agents[0].tools).toBeDefined();
    });

    it("filters by query", async () => {
      merchantRepo.seed([
        makeMerchant({
          merchant_did: "did:nexus:20250407:flight",
          name: "FlightBot",
          description: "Book flights",
        }),
        makeMerchant({
          merchant_did: "did:nexus:20250407:hotel",
          name: "HotelBot",
          description: "Book hotels",
        }),
      ]);

      const req = mockReq("GET", "/api/agents?query=hotel");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      const body = JSON.parse(res._body);
      expect(body.agents).toHaveLength(1);
      expect(body.agents[0].name).toBe("HotelBot");
    });

    it("filters by category", async () => {
      merchantRepo.seed([
        makeMerchant({
          merchant_did: "did:nexus:20250407:flight",
          name: "Flight",
          category: "travel.flights",
        }),
        makeMerchant({
          merchant_did: "did:nexus:20250407:food",
          name: "Food",
          category: "food.delivery",
        }),
      ]);

      const req = mockReq("GET", "/api/agents?category=travel");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      const body = JSON.parse(res._body);
      expect(body.agents).toHaveLength(1);
      expect(body.agents[0].name).toBe("Flight");
    });

    it("respects limit", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:a", name: "A" }),
        makeMerchant({ merchant_did: "did:b", name: "B" }),
        makeMerchant({ merchant_did: "did:c", name: "C" }),
      ]);

      const req = mockReq("GET", "/api/agents?limit=2");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      const body = JSON.parse(res._body);
      expect(body.agents).toHaveLength(2);
      expect(body.limit).toBe(2);
    });

    it("returns empty array when no agents", async () => {
      const req = mockReq("GET", "/api/agents");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      const body = JSON.parse(res._body);
      expect(body.agents).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it("includes star counts", async () => {
      merchantRepo.seed([
        makeMerchant({ merchant_did: "did:nexus:20250407:popular" }),
      ]);
      await starRepo.addStar("did:nexus:20250407:popular", "0x1111");
      await starRepo.addStar("did:nexus:20250407:popular", "0x2222");

      const req = mockReq("GET", "/api/agents");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      const body = JSON.parse(res._body);
      expect(body.agents[0].stars).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/agents/:did/skill
  // -----------------------------------------------------------------------

  describe("GET /api/agents/:did/skill", () => {
    it("returns skill.md content as markdown", async () => {
      merchantRepo.seed(
        makeMerchant({ merchant_did: "did:nexus:20250407:test" }),
      );
      const skillContent = "---\nname: test\n---\n# My Skill";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(skillContent, { status: 200 }),
      );

      const req = mockReq("GET", "/api/agents/did:nexus:20250407:test/skill");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(200);
      expect(res._headers["Content-Type"]).toContain("text/markdown");
      expect(res._body).toContain("# My Skill");
    });

    it("returns 404 for unknown agent", async () => {
      const req = mockReq("GET", "/api/agents/did:nexus:20250407:nope/skill");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(404);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe("AGENT_NOT_FOUND");
    });

    it("returns 404 when no skill_md_url", async () => {
      merchantRepo.seed(
        makeMerchant({
          merchant_did: "did:nexus:20250407:noskill",
          skill_md_url: null,
        }),
      );

      const req = mockReq(
        "GET",
        "/api/agents/did:nexus:20250407:noskill/skill",
      );
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(404);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe("NO_SKILL");
    });

    it("returns 502 when upstream fetch fails", async () => {
      merchantRepo.seed(
        makeMerchant({ merchant_did: "did:nexus:20250407:test" }),
      );
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );

      const req = mockReq("GET", "/api/agents/did:nexus:20250407:test/skill");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._status).toBe(502);
      const body = JSON.parse(res._body);
      expect(body.error.code).toBe("SKILL_FETCH_FAILED");
    });
  });

  // -----------------------------------------------------------------------
  // Rate Limiting
  // -----------------------------------------------------------------------

  describe("rate limiting", () => {
    it("adds rate limit headers to responses", async () => {
      vi.mocked(orchestrator.getPaymentStatus).mockResolvedValueOnce({
        payment: makePayment(),
        group: null,
        groupPayments: [],
      });

      const req = mockReq("GET", "/api/payments/PAY-TEST-001");
      const res = mockRes();
      const url = new URL(req.url!, "http://localhost:3000");
      await handleRestApiRequest(deps, req, res, url);

      expect(res._headers["X-RateLimit-Limit"]).toBeDefined();
      expect(res._headers["X-RateLimit-Remaining"]).toBeDefined();
      expect(res._headers["X-RateLimit-Reset"]).toBeDefined();
    });
  });
});
