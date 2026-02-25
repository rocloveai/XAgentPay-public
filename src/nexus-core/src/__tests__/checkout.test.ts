import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleCheckoutRequest, type CheckoutDeps } from "../checkout.js";
import {
  MockPaymentRepository,
  MockEventRepository,
  MockGroupRepository,
} from "./mocks/index.js";
import { makeTestPayment, makeTestGroup, makeTestQuote } from "./fixtures.js";
import { PaymentStateMachine } from "../services/state-machine.js";
import type { WebhookNotifier } from "../services/webhook-notifier.js";
import type { NexusRelayer, RelayerTxResult } from "../services/relayer.js";
import type { NexusCoreConfig } from "../config.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Hex } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers — minimal mock HTTP objects (same pattern as portal.test.ts)
// ---------------------------------------------------------------------------

function makeReq(
  method: string,
  path: string,
  body?: string,
): { req: IncomingMessage; url: URL } {
  const req = {
    method,
    url: path,
    headers: { host: "localhost:4000", "content-type": "application/json" },
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "data" && body) {
        handler(Buffer.from(body));
      }
      if (event === "end") {
        handler();
      }
      return req;
    }),
  } as unknown as IncomingMessage;
  const url = new URL(path, "http://localhost:4000");
  return { req, url };
}

interface MockRes {
  statusCode: number;
  readonly headers: Record<string, string>;
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
      if (headers) {
        Object.assign(res.headers, headers);
      }
    },
    end(body?: string) {
      res.body = body ?? "";
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Mock relayer
// ---------------------------------------------------------------------------

function makeMockRelayer(): NexusRelayer {
  return {
    submitDeposit: vi.fn().mockResolvedValue({
      txHash: "0xabc123" as Hex,
      blockNumber: 42n,
      status: "success",
    } satisfies RelayerTxResult),
    submitRelease: vi.fn(),
    submitResolve: vi.fn(),
    submitRefund: vi.fn(),
    getAddress: vi
      .fn()
      .mockReturnValue("0xf7EA5d3f0Bf8185c4f3C2F405D9a71009CF4D920"),
    getRelayerBalance: vi.fn().mockResolvedValue(1000000000000000000n),
  } as unknown as NexusRelayer;
}

// ---------------------------------------------------------------------------
// Mock webhook notifier
// ---------------------------------------------------------------------------

function makeMockWebhookNotifier(): WebhookNotifier {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
    startRetryLoop: vi.fn(),
    stopRetryLoop: vi.fn(),
    retrySweep: vi.fn(),
  } as unknown as WebhookNotifier;
}

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const testConfig: NexusCoreConfig = {
  databaseUrl: "",
  escrowContract: "0xC1aF5ea6e661cB815DB166549178314E6BCfc3CF",
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
  portalToken: "",
  baseUrl: "",
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Checkout", () => {
  let groupRepo: MockGroupRepository;
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let stateMachine: PaymentStateMachine;
  let deps: CheckoutDeps;
  let relayer: NexusRelayer;

  const GROUP_ID = "GRP-test-checkout-1";

  beforeEach(async () => {
    groupRepo = new MockGroupRepository();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
    relayer = makeMockRelayer();

    // Seed a group
    await groupRepo.insert({
      group_id: GROUP_ID,
      payer_wallet: "0x1234567890abcdef1234567890abcdef12345678",
      total_amount: "200000",
      total_amount_display: "0.20",
      currency: "USDC",
      chain_id: 20250407,
      payment_count: 1,
    });

    // Seed a payment
    const quote = makeTestQuote();
    await paymentRepo.insert({
      nexus_payment_id: "PAY-checkout-1",
      group_id: GROUP_ID,
      quote_hash: "0x" + "aa".repeat(32),
      merchant_did: "did:nexus:20250407:demo_flight",
      merchant_order_ref: "FLT-CHECKOUT-1",
      payer_wallet: "0x1234567890abcdef1234567890abcdef12345678",
      payment_address: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
      amount: "200000",
      amount_display: "0.20",
      currency: "USDC",
      chain_id: 20250407,
      payment_method: "ESCROW_CONTRACT",
      quote_payload: quote,
      iso_metadata: null,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    // Set escrow fields on the payment
    await paymentRepo.updateStatus("PAY-checkout-1", "CREATED", {
      payment_id_bytes32: "0x" + "bb".repeat(32),
      eip3009_nonce: "0x" + "cc".repeat(32),
    });

    // Seed instruction
    await groupRepo.updateInstruction(GROUP_ID, {
      group_id: GROUP_ID,
      chain_id: 20250407,
      escrow_contract: "0xC1aF5ea6e661cB815DB166549178314E6BCfc3CF",
      total_amount_uint256: "200000",
      total_amount_display: "0.20",
      payments: [
        {
          nexus_payment_id: "PAY-checkout-1",
          merchant_did: "did:nexus:20250407:demo_flight",
          merchant_order_ref: "FLT-CHECKOUT-1",
          amount_display: "0.20",
          summary: "Test flight",
        },
      ],
      eip3009_sign_data: {
        domain: {
          name: "USD Coin",
          version: "1",
          chainId: 20250407,
          verifyingContract: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
        },
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: {
          from: "0x1234567890abcdef1234567890abcdef12345678",
          to: "0xC1aF5ea6e661cB815DB166549178314E6BCfc3CF",
          value: "200000",
          validAfter: "0",
          validBefore: String(Math.floor(Date.now() / 1000) + 86400),
          nonce: "0x" + "cc".repeat(32),
        },
      },
    });

    deps = {
      groupRepo,
      paymentRepo,
      stateMachine,
      relayer,
      webhookNotifier: makeMockWebhookNotifier(),
      config: testConfig,
    };
  });

  describe("GET /checkout/:groupId", () => {
    it("returns HTML with 200 for existing group", async () => {
      const { req, url } = makeReq("GET", `/checkout/${GROUP_ID}`);
      const res = makeRes();
      const handled = await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
      expect(res.headers["Content-Type"]).toContain("text/html");
      expect(res.body).toContain("NexusPay Checkout");
      expect(res.body).toContain("tailwind");
    });

    it("returns 404 for nonexistent group", async () => {
      const { req, url } = makeReq("GET", "/checkout/GRP-nonexistent");
      const res = makeRes();
      const handled = await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/checkout/:groupId", () => {
    it("returns JSON with group, payments, and instruction", async () => {
      const { req, url } = makeReq("GET", `/api/checkout/${GROUP_ID}`);
      const res = makeRes();
      const handled = await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(data.group).toBeDefined();
      expect(data.group.group_id).toBe(GROUP_ID);
      expect(data.payments).toBeDefined();
      expect(Array.isArray(data.payments)).toBe(true);
      expect(data.instruction).toBeDefined();
      expect(data.instruction.eip3009_sign_data).toBeDefined();
    });

    it("returns 404 for nonexistent group", async () => {
      const { req, url } = makeReq("GET", "/api/checkout/GRP-nonexistent");
      const res = makeRes();
      const handled = await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when no instruction stored", async () => {
      // Create a group without instruction
      await groupRepo.insert({
        group_id: "GRP-no-instruction",
        payer_wallet: "0x1234567890abcdef1234567890abcdef12345678",
        total_amount: "100000",
        total_amount_display: "0.10",
        currency: "USDC",
        chain_id: 20250407,
        payment_count: 1,
      });

      const { req, url } = makeReq("GET", "/api/checkout/GRP-no-instruction");
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toContain("No instruction");
    });
  });

  describe("POST /api/checkout/:groupId/submit", () => {
    it("submits valid signature and calls relayer", async () => {
      const body = JSON.stringify({
        v: 27,
        r: "0x" + "aa".repeat(32),
        s: "0x" + "bb".repeat(32),
      });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/submit`,
        body,
      );
      const res = makeRes();
      const handled = await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);

      const data = JSON.parse(res.body);
      expect(data.tx_hash).toBe("0xabc123");
      expect(data.status).toBe("submitted");
      expect(relayer.submitDeposit).toHaveBeenCalledTimes(1);
    });

    it("returns 503 when relayer not configured", async () => {
      const noRelayerDeps = { ...deps, relayer: null };
      const body = JSON.stringify({
        v: 27,
        r: "0x" + "aa".repeat(32),
        s: "0x" + "bb".repeat(32),
      });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/submit`,
        body,
      );
      const res = makeRes();
      await handleCheckoutRequest(
        noRelayerDeps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(503);
      const data = JSON.parse(res.body);
      expect(data.error).toContain("Relayer not configured");
    });

    it("returns 409 when group already paid", async () => {
      await groupRepo.updateStatus(GROUP_ID, "GROUP_ESCROWED");

      const body = JSON.stringify({
        v: 27,
        r: "0x" + "aa".repeat(32),
        s: "0x" + "bb".repeat(32),
      });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/submit`,
        body,
      );
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(409);
      const data = JSON.parse(res.body);
      expect(data.error).toContain("GROUP_ESCROWED");
    });

    it("returns 400 when missing v/r/s", async () => {
      const body = JSON.stringify({ v: 27 });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/submit`,
        body,
      );
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.body);
      expect(data.error).toContain("Missing required fields");
    });
  });

  describe("OPTIONS /api/checkout/:groupId/submit", () => {
    it("returns CORS headers with 204", async () => {
      const { req, url } = makeReq(
        "OPTIONS",
        `/api/checkout/${GROUP_ID}/submit`,
      );
      const res = makeRes();
      const handled = await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(204);
      expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
      expect(res.headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
      expect(res.headers["Access-Control-Allow-Methods"]).toContain("POST");
    });
  });

  describe("unhandled routes", () => {
    it("returns false for unknown paths", async () => {
      const { req, url } = makeReq("GET", "/unknown");
      const res = makeRes();
      const handled = await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(handled).toBe(false);
    });
  });
});
