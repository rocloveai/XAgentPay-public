import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hex } from "viem";
import { TimeoutHandler } from "../../services/timeout-handler.js";
import { PaymentStateMachine } from "../../services/state-machine.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import { makeTestPayment } from "../fixtures.js";

// ---------------------------------------------------------------------------
// Mock relayer
// ---------------------------------------------------------------------------

const mockSubmitRefund = vi.fn();

const mockRelayer = {
  submitDeposit: vi.fn(),
  submitRelease: vi.fn(),
  submitRefund: mockSubmitRefund,
};

const PAYMENT_ID_BYTES32 = ("0x" + "aa".repeat(32)) as Hex;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TimeoutHandler", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let stateMachine: PaymentStateMachine;
  let handler: TimeoutHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
    handler = new TimeoutHandler(
      mockRelayer as never,
      paymentRepo,
      stateMachine,
      60000,
    );
  });

  describe("sweepOnce", () => {
    it("submits refund for expired ESCROWED payments", async () => {
      // Insert an ESCROWED payment with expired release_deadline
      const payment = makeTestPayment({
        status: "ESCROWED",
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        release_deadline: new Date(Date.now() - 60000).toISOString(),
      });
      await paymentRepo.insert({
        nexus_payment_id: payment.nexus_payment_id,
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
      await paymentRepo.updateStatus(payment.nexus_payment_id, "ESCROWED", {
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        release_deadline: new Date(Date.now() - 60000).toISOString(),
      });

      mockSubmitRefund.mockResolvedValueOnce({
        txHash: "0x" + "ff".repeat(32),
        blockNumber: 100n,
        status: "success",
      });

      await handler.sweepOnce();

      expect(mockSubmitRefund).toHaveBeenCalledWith(PAYMENT_ID_BYTES32);
    });

    it("does nothing when no expired payments exist", async () => {
      await handler.sweepOnce();
      expect(mockSubmitRefund).not.toHaveBeenCalled();
    });

    it("does not crash when relayer fails", async () => {
      const payment = makeTestPayment({
        status: "ESCROWED",
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        release_deadline: new Date(Date.now() - 60000).toISOString(),
      });
      await paymentRepo.insert({
        nexus_payment_id: payment.nexus_payment_id,
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
      await paymentRepo.updateStatus(payment.nexus_payment_id, "ESCROWED", {
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        release_deadline: new Date(Date.now() - 60000).toISOString(),
      });

      mockSubmitRefund.mockRejectedValueOnce(new Error("gas estimation failed"));

      // Should not throw
      await handler.sweepOnce();
    });

    it("expires AWAITING_TX payments via stateMachine", async () => {
      const payment = makeTestPayment({
        status: "CREATED",
        expires_at: new Date(Date.now() - 60000).toISOString(),
      });
      await paymentRepo.insert({
        nexus_payment_id: payment.nexus_payment_id,
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
        expires_at: new Date(Date.now() - 60000).toISOString(),
      });

      await handler.sweepOnce();

      const updated = await paymentRepo.findById(payment.nexus_payment_id);
      expect(updated?.status).toBe("EXPIRED");
    });

    it("skips ESCROWED payment without payment_id_bytes32", async () => {
      const payment = makeTestPayment({
        status: "ESCROWED",
        release_deadline: new Date(Date.now() - 60000).toISOString(),
      });
      await paymentRepo.insert({
        nexus_payment_id: payment.nexus_payment_id,
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
      await paymentRepo.updateStatus(payment.nexus_payment_id, "ESCROWED", {
        release_deadline: new Date(Date.now() - 60000).toISOString(),
      });

      await handler.sweepOnce();

      expect(mockSubmitRefund).not.toHaveBeenCalled();
    });
  });

  describe("start / stop", () => {
    it("starts and stops the interval timer", () => {
      handler.start();
      handler.start(); // idempotent
      handler.stop();
      handler.stop(); // idempotent
    });
  });
});
