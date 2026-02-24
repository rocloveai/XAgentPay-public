import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { WebhookNotifier } from "../../services/webhook-notifier.js";
import { MockWebhookRepository } from "../mocks/mock-webhook-repo.js";
import { MockMerchantRepository } from "../mocks/mock-merchant-repo.js";
import { makeTestPayment, TEST_FLIGHT_MERCHANT } from "../fixtures.js";
import type { WebhookEventType } from "../../types.js";

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebhookNotifier", () => {
  let webhookRepo: MockWebhookRepository;
  let merchantRepo: MockMerchantRepository;
  let notifier: WebhookNotifier;

  beforeEach(() => {
    vi.clearAllMocks();
    webhookRepo = new MockWebhookRepository();
    merchantRepo = new MockMerchantRepository();
    merchantRepo.seed(TEST_FLIGHT_MERCHANT);
    notifier = new WebhookNotifier(webhookRepo, merchantRepo);
  });

  describe("notify", () => {
    it("delivers webhook successfully and marks as delivered", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      const payment = makeTestPayment({ status: "ESCROWED" });
      await notifier.notify(payment, "payment.escrowed");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(TEST_FLIGHT_MERCHANT.webhook_url);
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");

      // Verify HMAC signature includes timestamp
      const body = options.body;
      const timestamp = options.headers["X-Nexus-Timestamp"];
      expect(timestamp).toBeDefined();
      const expectedHmac = createHmac(
        "sha256",
        TEST_FLIGHT_MERCHANT.webhook_secret!,
      )
        .update(`${timestamp}.${body}`)
        .digest("hex");
      expect(options.headers["X-Nexus-Signature"]).toBe(
        `sha256=${expectedHmac}`,
      );
    });

    it("marks as failed on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const payment = makeTestPayment({ status: "ESCROWED" });
      await notifier.notify(payment, "payment.escrowed");

      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("skips merchant without webhook_url", async () => {
      const noWebhookMerchant = {
        ...TEST_FLIGHT_MERCHANT,
        merchant_did: "did:nexus:20250407:no_webhook",
        webhook_url: null,
        webhook_secret: null,
      };
      merchantRepo.seed(noWebhookMerchant);

      const payment = makeTestPayment({
        status: "ESCROWED",
        merchant_did: "did:nexus:20250407:no_webhook",
      });
      await notifier.notify(payment, "payment.escrowed");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("handles fetch error gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const payment = makeTestPayment({ status: "ESCROWED" });

      // Should not throw
      await notifier.notify(payment, "payment.escrowed");
    });

    it("includes correct payload structure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      const payment = makeTestPayment({
        status: "SETTLED",
        tx_hash: "0x" + "ff".repeat(32),
        block_number: 42,
        block_timestamp: "2026-01-01T00:00:00.000Z",
      });
      await notifier.notify(payment, "payment.settled");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event_type).toBe("payment.settled");
      expect(body.event_id).toMatch(/^WHEVT-/);
      expect(body.data.nexus_payment_id).toBe(payment.nexus_payment_id);
      expect(body.data.merchant_order_ref).toBe(payment.merchant_order_ref);
      expect(body.data.status).toBe("SETTLED");
      expect(body.data.settlement).toBeDefined();
      expect(body.data.settlement.tx_hash).toBe(payment.tx_hash);
    });
  });

  describe("retrySweep", () => {
    it("retries pending deliveries whose next_retry_at has passed", async () => {
      // First delivery fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      });

      const payment = makeTestPayment({ status: "ESCROWED" });
      await notifier.notify(payment, "payment.escrowed");

      // The failed delivery was scheduled with next_retry_at in the future.
      // Fast-forward by manually updating the retry time in the repo to the past.
      const farFuture = new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const pendingLogs = await webhookRepo.findPendingRetries(farFuture);
      expect(pendingLogs.length).toBe(1);

      // Manually set next_retry_at to past so retrySweep will pick it up
      await webhookRepo.markFailed(
        pendingLogs[0].log_id,
        503,
        "Service Unavailable",
        new Date(Date.now() - 1000).toISOString(),
      );

      // Now retry succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });

      await notifier.retrySweep();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("startRetryLoop / stopRetryLoop", () => {
    it("starts and stops the retry interval", () => {
      notifier.startRetryLoop(60000);
      notifier.startRetryLoop(60000); // idempotent
      notifier.stopRetryLoop();
      notifier.stopRetryLoop(); // idempotent
    });
  });
});
