import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleCheckoutRequest, type CheckoutDeps } from "../checkout.js";
import {
  MockPaymentRepository,
  MockEventRepository,
  MockGroupRepository,
  MockKVRepository,
} from "./mocks/index.js";
import { makeTestPayment, makeTestGroup, makeTestQuote } from "./fixtures.js";
import { PaymentStateMachine } from "../services/state-machine.js";
import { GroupManager } from "../services/group-manager.js";
import type { WebhookNotifier } from "../services/webhook-notifier.js";
import type { NexusCoreConfig } from "../config.js";
import type { IncomingMessage, ServerResponse } from "node:http";

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
  baseUrl: "http://localhost:4000",
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Checkout", () => {
  let groupRepo: MockGroupRepository;
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let stateMachine: PaymentStateMachine;
  let kvRepo: MockKVRepository;
  let deps: CheckoutDeps;

  const GROUP_ID = "GRP-test-checkout-1";

  beforeEach(async () => {
    groupRepo = new MockGroupRepository();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    kvRepo = new MockKVRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);

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

    // Seed instruction (includes group signature fields)
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
          merchant_address: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
          amount_uint256: "200000",
          amount_display: "0.20",
          summary: "Test flight",
          payment_id_bytes32: "0x" + "a1".repeat(32),
          order_ref_bytes32: "0x" + "b2".repeat(32),
          merchant_did_bytes32: "0x" + "c3".repeat(32),
          context_hash: "0x" + "d4".repeat(32),
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
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
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
          validBefore: String(Date.now() + 86400 * 1000),
          nonce: "0x" + "cc".repeat(32),
        },
      },
      nexus_group_sig: "0x" + "ee".repeat(65),
      core_operator_address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    });

    deps = {
      groupRepo,
      paymentRepo,
      stateMachine,
      groupManager: new GroupManager(groupRepo, paymentRepo, eventRepo),
      webhookNotifier: makeMockWebhookNotifier(),
      kvRepo,
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
      expect(res.body).toContain("xNexus Checkout");
      expect(res.body).toContain("tailwind");
    });

    it("includes wallet address validation in rendered HTML", async () => {
      const { req, url } = makeReq("GET", `/checkout/${GROUP_ID}`);
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.body).toContain("wrong-wallet");
      expect(res.body).toContain("expected-wallet");
      expect(res.body).toContain("Wrong wallet connected");
      expect(res.body).toContain("toLowerCase()");
    });

    it("includes group signature validation in rendered HTML", async () => {
      const { req, url } = makeReq("GET", `/checkout/${GROUP_ID}`);
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.body).toContain("nexus_group_sig");
      expect(res.body).toContain("core_operator_address");
      expect(res.body).toContain("Missing group signature");
      expect(res.body).toContain("Group sig verified");
    });

    it("uses batchDepositWithGroupApproval in checkout HTML", async () => {
      const { req, url } = makeReq("GET", `/checkout/${GROUP_ID}`);
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.body).toContain("batchDepositWithGroupApproval");
      expect(res.body).toContain("encodeBatchDepositWithGroupApproval");
      expect(res.body).toContain("groupIdBytes32");
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

    it("returns instruction with nexus_group_sig and core_operator_address", async () => {
      const { req, url } = makeReq("GET", `/api/checkout/${GROUP_ID}`);
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      const data = JSON.parse(res.body);
      expect(data.instruction.nexus_group_sig).toBeDefined();
      expect(data.instruction.nexus_group_sig).toMatch(/^0x/);
      expect(data.instruction.core_operator_address).toBeDefined();
      expect(data.instruction.core_operator_address).toMatch(/^0x/);
    });

    it("returns precomputed hash fields in payment details", async () => {
      const { req, url } = makeReq("GET", `/api/checkout/${GROUP_ID}`);
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      const data = JSON.parse(res.body);
      const payment = data.instruction.payments[0];
      expect(payment.payment_id_bytes32).toMatch(/^0x/);
      expect(payment.order_ref_bytes32).toMatch(/^0x/);
      expect(payment.merchant_did_bytes32).toMatch(/^0x/);
      expect(payment.context_hash).toMatch(/^0x/);
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

  describe("POST /api/checkout/:groupId/confirm", () => {
    it("returns 202 when receipt not yet available (tx pending)", async () => {
      const body = JSON.stringify({ tx_hash: "0xabc123def456" });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/confirm`,
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
      expect(res.statusCode).toBe(202);

      const data = JSON.parse(res.body);
      expect(data.tx_hash).toBe("0xabc123def456");
      expect(data.status).toBe("awaiting_confirmation");
      expect(data.group_id).toBe(GROUP_ID);

      // Payment should NOT be transitioned to ESCROWED yet
      const payment = await paymentRepo.findById("PAY-checkout-1");
      expect(payment?.status).toBe("CREATED");

      // Group should stay GROUP_CREATED (not transition to AWAITING_TX)
      // so user can retry if the tx gets dropped
      const group = await groupRepo.findById(GROUP_ID);
      expect(group?.status).toBe("GROUP_CREATED");
    });

    it("returns 409 when group already paid", async () => {
      // Update both payment and group to ESCROWED so syncGroupStatus stays consistent
      await paymentRepo.updateStatus("PAY-checkout-1", "ESCROWED");
      await groupRepo.updateStatus(GROUP_ID, "GROUP_ESCROWED");

      const body = JSON.stringify({ tx_hash: "0xabc123def456" });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/confirm`,
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

    it("returns 400 when missing tx_hash", async () => {
      const body = JSON.stringify({ something: "else" });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/confirm`,
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
      expect(data.error).toContain("tx_hash");
    });

    it("returns 400 when tx_hash does not start with 0x", async () => {
      const body = JSON.stringify({ tx_hash: "abc123" });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${GROUP_ID}/confirm`,
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
      expect(data.error).toContain("tx_hash");
    });

    it("returns 404 for nonexistent group", async () => {
      const body = JSON.stringify({ tx_hash: "0xabc123def456" });
      const { req, url } = makeReq(
        "POST",
        "/api/checkout/GRP-nonexistent/confirm",
        body,
      );
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(404);
    });
  });

  describe("OPTIONS /api/checkout/:groupId/confirm", () => {
    it("returns CORS headers with 204", async () => {
      const { req, url } = makeReq(
        "OPTIONS",
        `/api/checkout/${GROUP_ID}/confirm`,
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

  describe("token-protected checkout URLs", () => {
    const TOKEN_ID = "tok_abcdef1234567890abcdef1234567890";

    beforeEach(async () => {
      // Store a valid token mapping
      await kvRepo.set(
        `checkout:token:${TOKEN_ID}`,
        JSON.stringify({
          groupId: GROUP_ID,
          expiresAt: Date.now() + 60 * 60 * 1000,
        }),
      );
    });

    it("GET /checkout/:token resolves token to group and returns HTML", async () => {
      const { req, url } = makeReq("GET", `/checkout/${TOKEN_ID}`);
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
      expect(res.body).toContain("xNexus Checkout");
    });

    it("GET /api/checkout/:token resolves token and returns JSON", async () => {
      const { req, url } = makeReq("GET", `/api/checkout/${TOKEN_ID}`);
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
      expect(data.group.group_id).toBe(GROUP_ID);
      expect(data.instruction).toBeDefined();
    });

    it("POST /api/checkout/:token/confirm resolves token and returns 202 (pending)", async () => {
      const body = JSON.stringify({ tx_hash: "0xdeadbeef" });
      const { req, url } = makeReq(
        "POST",
        `/api/checkout/${TOKEN_ID}/confirm`,
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
      expect(res.statusCode).toBe(202);
      const data = JSON.parse(res.body);
      expect(data.group_id).toBe(GROUP_ID);
      expect(data.status).toBe("awaiting_confirmation");
    });

    it("returns 404 for expired token", async () => {
      const expiredToken = "tok_expired000000000000000000000000";
      await kvRepo.set(
        `checkout:token:${expiredToken}`,
        JSON.stringify({
          groupId: GROUP_ID,
          expiresAt: Date.now() - 1000, // already expired
        }),
      );

      const { req, url } = makeReq("GET", `/api/checkout/${expiredToken}`);
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(404);
      const data = JSON.parse(res.body);
      expect(data.error).toContain("invalid or expired");
    });

    it("returns 404 for unknown token", async () => {
      const { req, url } = makeReq(
        "GET",
        "/api/checkout/tok_doesnotexist00000000000000000000",
      );
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for HTML checkout with expired token", async () => {
      const expiredToken = "tok_htmlexpired0000000000000000000";
      await kvRepo.set(
        `checkout:token:${expiredToken}`,
        JSON.stringify({
          groupId: GROUP_ID,
          expiresAt: Date.now() - 5000,
        }),
      );

      const { req, url } = makeReq("GET", `/checkout/${expiredToken}`);
      const res = makeRes();
      await handleCheckoutRequest(
        deps,
        req,
        res as unknown as ServerResponse,
        url,
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toContain("Invalid or Expired");
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
