import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hex } from "viem";
import { TimeoutHandler } from "../../services/timeout-handler.js";
import { PaymentStateMachine } from "../../services/state-machine.js";
import { GroupManager } from "../../services/group-manager.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import { MockGroupRepository } from "../mocks/mock-group-repo.js";
import { makeTestPayment } from "../fixtures.js";

// ---------------------------------------------------------------------------
// Mock relayer
// ---------------------------------------------------------------------------

const mockSubmitRefund = vi.fn();
const mockSubmitResolve = vi.fn();

const mockRelayer = {
  submitRelease: vi.fn(),
  submitRefund: mockSubmitRefund,
  submitResolve: mockSubmitResolve,
};

const PAYMENT_ID_BYTES32 = ("0x" + "aa".repeat(32)) as Hex;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TimeoutHandler", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let groupRepo: MockGroupRepository;
  let stateMachine: PaymentStateMachine;
  let groupManager: GroupManager;
  let handler: TimeoutHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    groupRepo = new MockGroupRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
    groupManager = new GroupManager(groupRepo, paymentRepo, eventRepo);
    handler = new TimeoutHandler(
      mockRelayer as never,
      paymentRepo,
      stateMachine,
      groupManager,
      null, // webhookNotifier
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
      await paymentRepo.updateStatus(payment.xagent_payment_id, "ESCROWED", {
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
      await paymentRepo.updateStatus(payment.xagent_payment_id, "ESCROWED", {
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        release_deadline: new Date(Date.now() - 60000).toISOString(),
      });

      mockSubmitRefund.mockRejectedValueOnce(
        new Error("gas estimation failed"),
      );

      // Should not throw
      await handler.sweepOnce();
    });

    it("expires AWAITING_TX payments via stateMachine", async () => {
      const payment = makeTestPayment({
        status: "CREATED",
        expires_at: new Date(Date.now() - 60000).toISOString(),
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
        expires_at: new Date(Date.now() - 60000).toISOString(),
      });

      await handler.sweepOnce();

      const updated = await paymentRepo.findById(payment.xagent_payment_id);
      expect(updated?.status).toBe("EXPIRED");
    });

    it("submits resolve for expired DISPUTE_OPEN payments", async () => {
      const payment = makeTestPayment({
        status: "ESCROWED",
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        dispute_deadline: new Date(Date.now() - 60000).toISOString(),
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
      await paymentRepo.updateStatus(payment.xagent_payment_id, "DISPUTE_OPEN", {
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        dispute_deadline: new Date(Date.now() - 60000).toISOString(),
        dispute_reason: "0x" + "ab".repeat(32),
      });

      mockSubmitResolve.mockResolvedValueOnce({
        txHash: "0x" + "ff".repeat(32),
        blockNumber: 200n,
        status: "success",
      });

      await handler.sweepOnce();

      expect(mockSubmitResolve).toHaveBeenCalledWith(PAYMENT_ID_BYTES32, 0);
    });

    it("does not resolve DISPUTE_OPEN that has not expired", async () => {
      const payment = makeTestPayment({
        status: "ESCROWED",
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        dispute_deadline: new Date(Date.now() + 600000).toISOString(),
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
      await paymentRepo.updateStatus(payment.xagent_payment_id, "DISPUTE_OPEN", {
        payment_id_bytes32: PAYMENT_ID_BYTES32,
        dispute_deadline: new Date(Date.now() + 600000).toISOString(),
        dispute_reason: "0x" + "ab".repeat(32),
      });

      await handler.sweepOnce();

      expect(mockSubmitResolve).not.toHaveBeenCalled();
    });

    it("skips ESCROWED payment without payment_id_bytes32", async () => {
      const payment = makeTestPayment({
        status: "ESCROWED",
        release_deadline: new Date(Date.now() - 60000).toISOString(),
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
      await paymentRepo.updateStatus(payment.xagent_payment_id, "ESCROWED", {
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
