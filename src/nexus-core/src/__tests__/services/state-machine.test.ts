import { describe, it, expect, beforeEach } from "vitest";
import { PaymentStateMachine } from "../../services/state-machine.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import { InvalidTransitionError, NexusError } from "../../errors.js";
import { makeTestQuote, TEST_PAYER_WALLET } from "../fixtures.js";

describe("PaymentStateMachine", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let sm: PaymentStateMachine;

  beforeEach(() => {
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    sm = new PaymentStateMachine(paymentRepo, eventRepo);
  });

  describe("createPayment", () => {
    it("creates a payment in CREATED status", async () => {
      const quote = makeTestQuote();
      const payment = await sm.createPayment({
        quoteHash: "0x" + "aa".repeat(32),
        groupId: null,
        merchantDid: quote.merchant_did,
        merchantOrderRef: quote.merchant_order_ref,
        payerWallet: TEST_PAYER_WALLET,
        paymentAddress: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
        amount: quote.amount,
        amountDisplay: "0.10",
        currency: "USDC",
        chainId: 20250407,
        paymentMethod: "ESCROW_CONTRACT",
        quotePayload: quote,
        isoMetadata: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      expect(payment.status).toBe("CREATED");
      expect(payment.nexus_payment_id).toMatch(/^PAY-/);
      expect(payment.group_id).toBeNull();
    });

    it("creates a payment with group_id", async () => {
      const quote = makeTestQuote();
      const payment = await sm.createPayment({
        quoteHash: "0x" + "bb".repeat(32),
        groupId: "GRP-test-1",
        merchantDid: quote.merchant_did,
        merchantOrderRef: quote.merchant_order_ref,
        payerWallet: TEST_PAYER_WALLET,
        paymentAddress: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
        amount: quote.amount,
        amountDisplay: "0.10",
        currency: "USDC",
        chainId: 20250407,
        paymentMethod: "ESCROW_CONTRACT",
        quotePayload: quote,
        isoMetadata: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      expect(payment.group_id).toBe("GRP-test-1");
    });
  });

  describe("transition", () => {
    it("transitions CREATED → AWAITING_TX", async () => {
      const quote = makeTestQuote();
      const payment = await sm.createPayment({
        quoteHash: "0x" + "cc".repeat(32),
        groupId: null,
        merchantDid: quote.merchant_did,
        merchantOrderRef: quote.merchant_order_ref,
        payerWallet: TEST_PAYER_WALLET,
        paymentAddress: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
        amount: quote.amount,
        amountDisplay: "0.10",
        currency: "USDC",
        chainId: 20250407,
        paymentMethod: "ESCROW_CONTRACT",
        quotePayload: quote,
        isoMetadata: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      const updated = await sm.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "AWAITING_TX",
        eventType: "PAYMENT_FINALIZED",
      });

      expect(updated.status).toBe("AWAITING_TX");
    });

    it("rejects invalid transitions", async () => {
      const quote = makeTestQuote();
      const payment = await sm.createPayment({
        quoteHash: "0x" + "dd".repeat(32),
        groupId: null,
        merchantDid: quote.merchant_did,
        merchantOrderRef: quote.merchant_order_ref,
        payerWallet: TEST_PAYER_WALLET,
        paymentAddress: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
        amount: quote.amount,
        amountDisplay: "0.10",
        currency: "USDC",
        chainId: 20250407,
        paymentMethod: "ESCROW_CONTRACT",
        quotePayload: quote,
        isoMetadata: null,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

      await expect(
        sm.transition({
          nexusPaymentId: payment.nexus_payment_id,
          toStatus: "COMPLETED",
          eventType: "FULFILLMENT_CONFIRMED",
        }),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it("throws when payment not found", async () => {
      await expect(
        sm.transition({
          nexusPaymentId: "PAY-nonexistent",
          toStatus: "AWAITING_TX",
          eventType: "PAYMENT_FINALIZED",
        }),
      ).rejects.toThrow(NexusError);
    });
  });

  describe("getPayment", () => {
    it("returns null for unknown payment", async () => {
      const result = await sm.getPayment("PAY-unknown");
      expect(result).toBeNull();
    });
  });
});
