import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentStateMachine } from "../../services/state-machine.js";
import { WebhookNotifier } from "../../services/webhook-notifier.js";
import {
  MockPaymentRepository,
  MockEventRepository,
  MockWebhookRepository,
  MockMerchantRepository,
} from "../mocks/index.js";
import { makeTestPayment, TEST_FLIGHT_MERCHANT } from "../fixtures.js";
import type { PaymentRecord, Hex } from "../../types.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("nexus_confirm_fulfillment logic", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let stateMachine: PaymentStateMachine;
  let webhookNotifier: WebhookNotifier;

  beforeEach(() => {
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);

    const webhookRepo = new MockWebhookRepository();
    const merchantRepo = new MockMerchantRepository();
    merchantRepo.seed(TEST_FLIGHT_MERCHANT);
    webhookNotifier = new WebhookNotifier(webhookRepo, merchantRepo);
  });

  // ── Helper to seed payment at a given status ──
  async function seedPayment(
    overrides: Partial<PaymentRecord> = {},
  ): Promise<PaymentRecord> {
    const payment = makeTestPayment({
      payment_id_bytes32: ("0x" + "aa".repeat(32)) as Hex,
      eip3009_nonce: ("0x" + "bb".repeat(32)) as Hex,
      ...overrides,
    });
    await paymentRepo.insert({
      nexus_payment_id: payment.nexus_payment_id,
      group_id: payment.group_id,
      quote_hash: payment.quote_hash,
      merchant_did: payment.merchant_did,
      merchant_order_ref: payment.merchant_order_ref,
      payer_wallet: payment.payer_wallet,
      payment_address: payment.payment_address,
      amount: payment.amount,
      amount_display: payment.amount_display,
      currency: payment.currency,
      chain_id: payment.chain_id,
      payment_method: payment.payment_method,
      quote_payload: payment.quote_payload,
      iso_metadata: payment.iso_metadata,
      expires_at: payment.expires_at,
    });

    // Override status + fields directly
    if (overrides.status && overrides.status !== "CREATED") {
      await paymentRepo.updateStatus(
        payment.nexus_payment_id,
        overrides.status,
        {
          payment_id_bytes32: overrides.payment_id_bytes32 ?? null,
          settled_at: overrides.settled_at ?? null,
          completed_at: overrides.completed_at ?? null,
        },
      );
    }
    return (await paymentRepo.findById(payment.nexus_payment_id))!;
  }

  describe("SETTLED → COMPLETED", () => {
    it("transitions to COMPLETED and sets completed_at", async () => {
      const payment = await seedPayment({ status: "SETTLED" });

      const updated = await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "COMPLETED",
        eventType: "FULFILLMENT_CONFIRMED",
        metadata: { fulfillment_proof: "https://proof.example.com" },
        fields: { completed_at: new Date().toISOString() },
      });

      expect(updated.status).toBe("COMPLETED");
      expect(updated.completed_at).not.toBeNull();
    });

    it("stores fulfillment_proof in event metadata", async () => {
      const payment = await seedPayment({ status: "SETTLED" });

      await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "COMPLETED",
        eventType: "FULFILLMENT_CONFIRMED",
        metadata: { fulfillment_proof: "0xdeadbeef" },
        fields: { completed_at: new Date().toISOString() },
      });

      const events = await eventRepo.findByPaymentId(payment.nexus_payment_id);
      const fulfillmentEvent = events.find(
        (e) => e.event_type === "FULFILLMENT_CONFIRMED",
      );
      expect(fulfillmentEvent).toBeDefined();
      expect(fulfillmentEvent!.metadata.fulfillment_proof).toBe("0xdeadbeef");
    });
  });

  describe("CREATED → rejected", () => {
    it("rejects transition from CREATED", async () => {
      const payment = await seedPayment({ status: "CREATED" });

      await expect(
        stateMachine.transition({
          nexusPaymentId: payment.nexus_payment_id,
          toStatus: "COMPLETED",
          eventType: "FULFILLMENT_CONFIRMED",
          metadata: {},
        }),
      ).rejects.toThrow(/Cannot transition/);
    });
  });

  describe("non-existent payment", () => {
    it("rejects when payment does not exist", async () => {
      await expect(
        stateMachine.transition({
          nexusPaymentId: "PAY-does-not-exist",
          toStatus: "COMPLETED",
          eventType: "FULFILLMENT_CONFIRMED",
          metadata: {},
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("ESCROWED without bytes32", () => {
    it("payment without payment_id_bytes32 can still be looked up", async () => {
      const payment = await seedPayment({
        status: "ESCROWED",
        payment_id_bytes32: null,
      });

      // The tool-level logic checks for bytes32 before calling relayer
      // Here we verify the payment exists but has null bytes32
      const found = await paymentRepo.findById(payment.nexus_payment_id);
      expect(found).not.toBeNull();
      expect(found!.payment_id_bytes32).toBeNull();
    });
  });

  describe("webhook notification", () => {
    it("can send payment.completed webhook after transition", async () => {
      const payment = await seedPayment({ status: "SETTLED" });

      const updated = await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "COMPLETED",
        eventType: "FULFILLMENT_CONFIRMED",
        metadata: {},
        fields: { completed_at: new Date().toISOString() },
      });

      // Webhook notifier should accept payment.completed event type
      const notifySpy = vi.spyOn(webhookNotifier, "notify");
      await webhookNotifier.notify(updated, "payment.completed");

      expect(notifySpy).toHaveBeenCalledWith(updated, "payment.completed");
    });
  });
});
