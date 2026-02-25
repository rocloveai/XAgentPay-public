import { describe, it, expect, beforeEach } from "vitest";
import { handlePortalRequest, type PortalDeps } from "../portal.js";
import { MockPaymentRepository, MockEventRepository } from "./mocks/index.js";
import { MockGroupRepository } from "./mocks/mock-group-repo.js";
import { makeTestPayment } from "./fixtures.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Helpers — minimal mock HTTP objects
// ---------------------------------------------------------------------------

function makeReq(
  method: string,
  path: string,
  extraHeaders: Record<string, string> = {},
): { req: IncomingMessage; url: URL } {
  const req = {
    method,
    url: path,
    headers: { host: "localhost:4000", ...extraHeaders },
  } as unknown as IncomingMessage;
  const url = new URL(path, "http://localhost:4000");
  return { req, url };
}

interface MockRes {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  writeHead(status: number, headers?: Record<string, string>): void;
  end(body?: string): void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      (res as { statusCode: number }).statusCode = status;
      if (headers) {
        Object.assign(res.headers, headers);
      }
    },
    end(body?: string) {
      (res as { body: string }).body = body ?? "";
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Portal", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let deps: PortalDeps;

  beforeEach(async () => {
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();

    // Seed some test payments
    const p1 = makeTestPayment({ status: "CREATED" });
    await paymentRepo.insert({
      nexus_payment_id: p1.nexus_payment_id,
      group_id: p1.group_id,
      quote_hash: p1.quote_hash,
      merchant_did: p1.merchant_did,
      merchant_order_ref: p1.merchant_order_ref,
      payer_wallet: p1.payer_wallet,
      payment_address: p1.payment_address,
      amount: p1.amount,
      amount_display: p1.amount_display,
      currency: p1.currency,
      chain_id: p1.chain_id,
      payment_method: p1.payment_method,
      quote_payload: p1.quote_payload,
      iso_metadata: p1.iso_metadata,
      expires_at: p1.expires_at,
    });

    const p2 = makeTestPayment();
    await paymentRepo.insert({
      nexus_payment_id: p2.nexus_payment_id,
      group_id: p2.group_id,
      quote_hash: p2.quote_hash,
      merchant_did: p2.merchant_did,
      merchant_order_ref: p2.merchant_order_ref,
      payer_wallet: p2.payer_wallet,
      payment_address: p2.payment_address,
      amount: p2.amount,
      amount_display: p2.amount_display,
      currency: p2.currency,
      chain_id: p2.chain_id,
      payment_method: p2.payment_method,
      quote_payload: p2.quote_payload,
      iso_metadata: p2.iso_metadata,
      expires_at: p2.expires_at,
    });
    await paymentRepo.updateStatus(p2.nexus_payment_id, "ESCROWED");

    deps = {
      paymentRepo,
      eventRepo,
      groupRepo: new MockGroupRepository(),
      relayer: null,
      escrowContract: "0x1111111111111111111111111111111111111111",
      chainId: 20250407,
      version: "0.4.0",
      portalToken: "",
    };
  });

  describe("GET /", () => {
    it("returns HTML dashboard with 200", async () => {
      const { req, url } = makeReq("GET", "/");
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.headers["Content-Type"]).toContain("text/html");
      expect(res.body).toContain("Nexus Core");
      expect(res.body).toContain("tailwind");
    });
  });

  describe("GET /api/payments", () => {
    it("returns JSON array of payments", async () => {
      const { req, url } = makeReq("GET", "/api/payments");
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
    });

    it("filters by status", async () => {
      const { req, url } = makeReq("GET", "/api/payments?status=ESCROWED");
      const res = makeRes();
      await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      const data = JSON.parse(res.body);
      expect(data.length).toBe(1);
      expect(data[0].status).toBe("ESCROWED");
    });
  });

  describe("GET /api/payments/:id", () => {
    it("returns payment detail with events", async () => {
      const payments = await paymentRepo.findAll();
      const paymentId = payments[0].nexus_payment_id;

      const { req, url } = makeReq("GET", `/api/payments/${paymentId}`);
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(data.payment).toBeDefined();
      expect(data.payment.nexus_payment_id).toBe(paymentId);
      expect(Array.isArray(data.events)).toBe(true);
    });

    it("returns 404 for unknown payment", async () => {
      const { req, url } = makeReq("GET", "/api/payments/PAY-does-not-exist");
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/stats", () => {
    it("returns status counts and volume", async () => {
      const { req, url } = makeReq("GET", "/api/stats");
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(data.total).toBe(2);
      expect(data.counts).toBeDefined();
      expect(typeof data.total_volume).toBe("string");
      expect(typeof data.total_volume_display).toBe("string");
    });
  });

  describe("GET /api/relayer", () => {
    it("returns configured: false when relayer is null", async () => {
      const { req, url } = makeReq("GET", "/api/relayer");
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(data.configured).toBe(false);
    });
  });

  describe("unhandled routes", () => {
    it("returns false for unknown paths", async () => {
      const { req, url } = makeReq("GET", "/unknown");
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(false);
    });
  });

  describe("Bearer token auth", () => {
    it("returns 401 when portalToken is set and no header provided", async () => {
      const authedDeps = { ...deps, portalToken: "secret123" };
      const { req, url } = makeReq("GET", "/api/stats");
      const res = makeRes();
      const handled = await handlePortalRequest(
        authedDeps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 200 when portalToken is set and correct Bearer provided", async () => {
      const authedDeps = { ...deps, portalToken: "secret123" };
      const { req, url } = makeReq("GET", "/api/stats", {
        authorization: "Bearer secret123",
      });
      const res = makeRes();
      const handled = await handlePortalRequest(
        authedDeps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it("allows access when portalToken is empty (no auth required)", async () => {
      const { req, url } = makeReq("GET", "/api/stats");
      const res = makeRes();
      const handled = await handlePortalRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
    });
  });
});
