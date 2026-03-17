import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hex } from "viem";
import { keccak256, toHex } from "viem";
import { PaymentStateMachine } from "../../services/state-machine.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import { makeTestPayment } from "../fixtures.js";

const PAYMENT_ID_BYTES32 = ("0x" + "aa".repeat(32)) as Hex;

describe("Dispute flow", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let stateMachine: PaymentStateMachine;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
  });

  // Helper to insert a payment and set it to a given status
  async function insertPayment(
    overrides: Partial<Parameters<typeof makeTestPayment>[0]> = {},
  ) {
    const payment = makeTestPayment({
      payment_id_bytes32: PAYMENT_ID_BYTES32,
      dispute_deadline: new Date(Date.now() + 600000).toISOString(),
      ...overrides,
    });
    await paymentRepo.insert({
      xagent_payment_id: payment.xagent_payment_id,
      group_id: null,
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
      iso_metadata: null,
      expires_at: payment.expires_at,
    });
    if (payment.status !== "CREATED") {
      await paymentRepo.updateStatus(payment.xagent_payment_id, payment.status, {
        payment_id_bytes32: payment.payment_id_bytes32,
        dispute_deadline: payment.dispute_deadline,
        dispute_reason: payment.dispute_reason,
      });
    }
    return payment;
  }

  describe("xagent_dispute_payment logic", () => {
    it("ESCROWED → DISPUTE_OPEN with reason bytes32", async () => {
      const payment = await insertPayment({ status: "ESCROWED" });
      const reason = "Product not as described";
      const reasonBytes32 = keccak256(toHex(reason));

      const updated = await stateMachine.transition({
        xagentPaymentId: payment.xagent_payment_id,
        toStatus: "DISPUTE_OPEN",
        eventType: "DISPUTE_OPENED",
        metadata: { reason, reason_bytes32: reasonBytes32 },
        fields: { dispute_reason: reasonBytes32 },
      });

      expect(updated.status).toBe("DISPUTE_OPEN");
      expect(updated.dispute_reason).toBe(reasonBytes32);
    });

    it("rejects dispute for non-ESCROWED payment", async () => {
      const payment = await insertPayment({ status: "CREATED" });

      await expect(
        stateMachine.transition({
          xagentPaymentId: payment.xagent_payment_id,
          toStatus: "DISPUTE_OPEN",
          eventType: "DISPUTE_OPENED",
        }),
      ).rejects.toThrow(/Cannot transition/);
    });

    it("rejects dispute for non-existent payment", async () => {
      await expect(
        stateMachine.transition({
          xagentPaymentId: "PAY-nonexistent",
          toStatus: "DISPUTE_OPEN",
          eventType: "DISPUTE_OPENED",
        }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("xagent_resolve_dispute logic", () => {
    it("DISPUTE_OPEN → DISPUTE_RESOLVED via state machine", async () => {
      const payment = await insertPayment({
        status: "DISPUTE_OPEN",
        dispute_reason: "0x" + "ab".repeat(32),
      });

      const updated = await stateMachine.transition({
        xagentPaymentId: payment.xagent_payment_id,
        toStatus: "DISPUTE_RESOLVED",
        eventType: "DISPUTE_RESOLVED",
        metadata: { merchant_bps: 5000 },
        fields: { settled_at: new Date().toISOString() },
      });

      expect(updated.status).toBe("DISPUTE_RESOLVED");
      expect(updated.settled_at).not.toBeNull();
    });

    it("rejects resolve for non-DISPUTE_OPEN payment", async () => {
      const payment = await insertPayment({ status: "ESCROWED" });

      await expect(
        stateMachine.transition({
          xagentPaymentId: payment.xagent_payment_id,
          toStatus: "DISPUTE_RESOLVED",
          eventType: "DISPUTE_RESOLVED",
        }),
      ).rejects.toThrow(/Cannot transition/);
    });

    it("DISPUTE_RESOLVED is a terminal state", async () => {
      const payment = await insertPayment({
        status: "DISPUTE_OPEN",
        dispute_reason: "0x" + "ab".repeat(32),
      });

      await stateMachine.transition({
        xagentPaymentId: payment.xagent_payment_id,
        toStatus: "DISPUTE_RESOLVED",
        eventType: "DISPUTE_RESOLVED",
      });

      // Cannot transition further
      await expect(
        stateMachine.transition({
          xagentPaymentId: payment.xagent_payment_id,
          toStatus: "SETTLED",
          eventType: "ESCROW_RELEASED",
        }),
      ).rejects.toThrow(/Cannot transition/);
    });
  });
});
