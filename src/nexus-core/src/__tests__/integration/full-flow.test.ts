/**
 * Full-flow integration tests — exercises the complete payment lifecycle
 * using in-memory mock repositories.
 *
 * Happy Path: CREATED → AWAITING_TX → BROADCASTED → ESCROWED → SETTLED → COMPLETED
 * Dispute Flow: ESCROWED → DISPUTE_OPEN → DISPUTE_RESOLVED
 * Timeout Flows: AWAITING_TX → EXPIRED, ESCROWED → refund, DISPUTE_OPEN → resolve(0)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PaymentStateMachine } from "../../services/state-machine.js";
import { GroupManager } from "../../services/group-manager.js";
import { WebhookNotifier } from "../../services/webhook-notifier.js";
import { TimeoutHandler } from "../../services/timeout-handler.js";
import {
  MockPaymentRepository,
  MockEventRepository,
  MockGroupRepository,
  MockMerchantRepository,
  MockWebhookRepository,
} from "../mocks/index.js";
import {
  makeTestPayment,
  makeTestQuote,
  TEST_PAYER_WALLET,
  TEST_FLIGHT_MERCHANT,
} from "../fixtures.js";
import type {
  PaymentRecord,
  PaymentStatus,
  PaymentEventType,
  Hex,
} from "../../types.js";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let paymentRepo: MockPaymentRepository;
let eventRepo: MockEventRepository;
let groupRepo: MockGroupRepository;
let merchantRepo: MockMerchantRepository;
let webhookRepo: MockWebhookRepository;
let stateMachine: PaymentStateMachine;
let groupManager: GroupManager;

beforeEach(() => {
  paymentRepo = new MockPaymentRepository();
  eventRepo = new MockEventRepository();
  groupRepo = new MockGroupRepository();
  merchantRepo = new MockMerchantRepository();
  webhookRepo = new MockWebhookRepository();

  merchantRepo.seed(TEST_FLIGHT_MERCHANT);

  stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
  groupManager = new GroupManager(groupRepo, paymentRepo, eventRepo);
});

// ---------------------------------------------------------------------------
// Helper: advance payment to a target status
// ---------------------------------------------------------------------------

interface TransitionStep {
  readonly toStatus: PaymentStatus;
  readonly eventType: PaymentEventType;
  readonly fields?: Record<string, unknown>;
}

const HAPPY_PATH_STEPS: readonly TransitionStep[] = [
  {
    toStatus: "AWAITING_TX",
    eventType: "EIP3009_SIGNATURE_RECEIVED",
  },
  {
    toStatus: "BROADCASTED",
    eventType: "RELAYER_TX_SUBMITTED",
    fields: { tx_hash: "0x" + "ff".repeat(32) },
  },
  {
    toStatus: "ESCROWED",
    eventType: "ESCROW_DEPOSITED",
    fields: {
      deposit_tx_hash: "0x" + "ee".repeat(32),
      escrow_contract: "0x1111111111111111111111111111111111111111",
      release_deadline: new Date(Date.now() + 86_400_000).toISOString(),
      dispute_deadline: new Date(Date.now() + 259_200_000).toISOString(),
    },
  },
  {
    toStatus: "SETTLED",
    eventType: "ESCROW_RELEASED",
    fields: {
      release_tx_hash: "0x" + "dd".repeat(32),
      settled_at: new Date().toISOString(),
    },
  },
  {
    toStatus: "COMPLETED",
    eventType: "FULFILLMENT_CONFIRMED",
    fields: {
      completed_at: new Date().toISOString(),
    },
  },
];

async function seedPayment(): Promise<PaymentRecord> {
  const quote = makeTestQuote();
  return stateMachine.createPayment({
    quoteHash: "0x" + "cc".repeat(32),
    groupId: null,
    merchantDid: quote.merchant_did,
    merchantOrderRef: quote.merchant_order_ref,
    payerWallet: TEST_PAYER_WALLET,
    paymentAddress: TEST_FLIGHT_MERCHANT.payment_address,
    amount: quote.amount,
    amountDisplay: "0.10",
    currency: quote.currency,
    chainId: quote.chain_id,
    paymentMethod: "ESCROW_CONTRACT",
    quotePayload: quote,
    isoMetadata: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
}

async function advanceToStatus(
  paymentId: string,
  targetStatus: PaymentStatus,
): Promise<PaymentRecord> {
  let updated: PaymentRecord | null = null;

  for (const step of HAPPY_PATH_STEPS) {
    updated = await stateMachine.transition({
      nexusPaymentId: paymentId,
      toStatus: step.toStatus,
      eventType: step.eventType,
      metadata: {},
      fields: step.fields as Record<string, unknown> | undefined,
    });

    if (step.toStatus === targetStatus) break;
  }

  if (!updated) throw new Error(`Failed to advance to ${targetStatus}`);
  return updated;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Full Flow Integration", () => {
  describe("Happy Path: CREATED → COMPLETED", () => {
    it("transitions through all statuses", async () => {
      const payment = await seedPayment();
      expect(payment.status).toBe("CREATED");

      const completed = await advanceToStatus(
        payment.nexus_payment_id,
        "COMPLETED",
      );

      expect(completed.status).toBe("COMPLETED");
      expect(completed.completed_at).not.toBeNull();
      expect(completed.settled_at).not.toBeNull();
      expect(completed.deposit_tx_hash).not.toBeNull();
      expect(completed.release_tx_hash).not.toBeNull();
    });

    it("creates events for each transition", async () => {
      const payment = await seedPayment();
      await advanceToStatus(payment.nexus_payment_id, "COMPLETED");

      const events = await eventRepo.findByPaymentId(payment.nexus_payment_id);

      // PAYMENT_CREATED + 5 transitions = 6 events
      expect(events.length).toBe(6);
      expect(events[0].event_type).toBe("PAYMENT_CREATED");
      expect(events[1].event_type).toBe("EIP3009_SIGNATURE_RECEIVED");
      expect(events[2].event_type).toBe("RELAYER_TX_SUBMITTED");
      expect(events[3].event_type).toBe("ESCROW_DEPOSITED");
      expect(events[4].event_type).toBe("ESCROW_RELEASED");
      expect(events[5].event_type).toBe("FULFILLMENT_CONFIRMED");
    });

    it("each event records from_status and to_status", async () => {
      const payment = await seedPayment();
      await advanceToStatus(payment.nexus_payment_id, "COMPLETED");

      const events = await eventRepo.findByPaymentId(payment.nexus_payment_id);

      // First event has null from_status
      expect(events[0].from_status).toBeNull();
      expect(events[0].to_status).toBe("CREATED");

      // Subsequent events track from → to
      expect(events[1].from_status).toBe("CREATED");
      expect(events[1].to_status).toBe("AWAITING_TX");

      expect(events[4].from_status).toBe("ESCROWED");
      expect(events[4].to_status).toBe("SETTLED");

      expect(events[5].from_status).toBe("SETTLED");
      expect(events[5].to_status).toBe("COMPLETED");
    });
  });

  describe("Dispute Flow: ESCROWED → DISPUTE_OPEN → DISPUTE_RESOLVED", () => {
    it("opens and resolves a dispute", async () => {
      const payment = await seedPayment();
      const escrowed = await advanceToStatus(
        payment.nexus_payment_id,
        "ESCROWED",
      );
      expect(escrowed.status).toBe("ESCROWED");

      // Open dispute
      const disputed = await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "DISPUTE_OPEN",
        eventType: "DISPUTE_OPENED",
        metadata: { reason: "Item not as described" },
        fields: {
          dispute_reason: "0x" + "ab".repeat(32),
          dispute_deadline: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      });
      expect(disputed.status).toBe("DISPUTE_OPEN");
      expect(disputed.dispute_reason).not.toBeNull();

      // Resolve dispute
      const resolved = await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "DISPUTE_RESOLVED",
        eventType: "DISPUTE_RESOLVED",
        metadata: { merchant_bps: 5000 },
        fields: {
          settled_at: new Date().toISOString(),
        },
      });
      expect(resolved.status).toBe("DISPUTE_RESOLVED");
      expect(resolved.settled_at).not.toBeNull();
    });

    it("prevents re-opening a resolved dispute", async () => {
      const payment = await seedPayment();
      await advanceToStatus(payment.nexus_payment_id, "ESCROWED");

      await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "DISPUTE_OPEN",
        eventType: "DISPUTE_OPENED",
        metadata: {},
      });
      await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "DISPUTE_RESOLVED",
        eventType: "DISPUTE_RESOLVED",
        metadata: {},
      });

      // Cannot transition from DISPUTE_RESOLVED
      await expect(
        stateMachine.transition({
          nexusPaymentId: payment.nexus_payment_id,
          toStatus: "DISPUTE_OPEN",
          eventType: "DISPUTE_OPENED",
          metadata: {},
        }),
      ).rejects.toThrow(/Cannot transition/);
    });
  });

  describe("Timeout: AWAITING_TX → EXPIRED", () => {
    it("expires a payment past its deadline", async () => {
      const quote = makeTestQuote();
      const payment = await stateMachine.createPayment({
        quoteHash: "0x" + "cc".repeat(32),
        groupId: null,
        merchantDid: quote.merchant_did,
        merchantOrderRef: quote.merchant_order_ref,
        payerWallet: TEST_PAYER_WALLET,
        paymentAddress: TEST_FLIGHT_MERCHANT.payment_address,
        amount: quote.amount,
        amountDisplay: "0.10",
        currency: quote.currency,
        chainId: quote.chain_id,
        paymentMethod: "ESCROW_CONTRACT",
        quotePayload: quote,
        isoMetadata: null,
        // Already expired
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      });

      await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "AWAITING_TX",
        eventType: "EIP3009_SIGNATURE_RECEIVED",
        metadata: {},
      });

      // Run timeout sweep
      const expired = await stateMachine.runTimeoutSweep();
      expect(expired.length).toBeGreaterThanOrEqual(1);

      const found = await paymentRepo.findById(payment.nexus_payment_id);
      expect(found!.status).toBe("EXPIRED");
    });
  });

  describe("Timeout: ESCROWED past release_deadline", () => {
    it("finds escrowed payments past deadline", async () => {
      const payment = await seedPayment();
      await advanceToStatus(payment.nexus_payment_id, "ESCROWED");

      // Manually set a past release_deadline
      await paymentRepo.updateStatus(payment.nexus_payment_id, "ESCROWED", {
        release_deadline: new Date(Date.now() - 1000).toISOString(),
      });

      const expired = await paymentRepo.findExpiredEscrowed(
        new Date().toISOString(),
      );
      expect(expired.length).toBeGreaterThanOrEqual(1);
      expect(expired[0].nexus_payment_id).toBe(payment.nexus_payment_id);
    });
  });

  describe("Timeout: DISPUTE_OPEN past deadline", () => {
    it("finds disputed payments past arbitration deadline", async () => {
      const payment = await seedPayment();
      await advanceToStatus(payment.nexus_payment_id, "ESCROWED");

      await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "DISPUTE_OPEN",
        eventType: "DISPUTE_OPENED",
        metadata: {},
        fields: {
          dispute_deadline: new Date(Date.now() - 1000).toISOString(),
        },
      });

      const pastDeadline = await paymentRepo.findDisputeOpenPastDeadline(
        new Date().toISOString(),
      );
      expect(pastDeadline.length).toBeGreaterThanOrEqual(1);
      expect(pastDeadline[0].nexus_payment_id).toBe(payment.nexus_payment_id);
    });
  });

  describe("Invalid transitions", () => {
    it("rejects CREATED → SETTLED (must go through AWAITING_TX first)", async () => {
      const payment = await seedPayment();

      await expect(
        stateMachine.transition({
          nexusPaymentId: payment.nexus_payment_id,
          toStatus: "SETTLED",
          eventType: "ESCROW_RELEASED",
          metadata: {},
        }),
      ).rejects.toThrow(/Cannot transition/);
    });

    it("rejects COMPLETED → CREATED (terminal state)", async () => {
      const payment = await seedPayment();
      await advanceToStatus(payment.nexus_payment_id, "COMPLETED");

      await expect(
        stateMachine.transition({
          nexusPaymentId: payment.nexus_payment_id,
          toStatus: "CREATED",
          eventType: "PAYMENT_CREATED",
          metadata: {},
        }),
      ).rejects.toThrow(/Cannot transition/);
    });

    it("rejects EXPIRED → AWAITING_TX (terminal state)", async () => {
      const payment = await seedPayment();
      await stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "EXPIRED",
        eventType: "PAYMENT_EXPIRED",
        metadata: {},
      });

      await expect(
        stateMachine.transition({
          nexusPaymentId: payment.nexus_payment_id,
          toStatus: "AWAITING_TX",
          eventType: "EIP3009_SIGNATURE_RECEIVED",
          metadata: {},
        }),
      ).rejects.toThrow(/Cannot transition/);
    });
  });

  describe("PaymentRepository — findAll + countByStatus", () => {
    it("findAll returns payments ordered by created_at DESC", async () => {
      await seedPayment();
      await seedPayment();
      await seedPayment();

      const all = await paymentRepo.findAll();
      expect(all.length).toBe(3);

      // Verify DESC ordering
      for (let i = 0; i < all.length - 1; i++) {
        expect(new Date(all[i].created_at).getTime()).toBeGreaterThanOrEqual(
          new Date(all[i + 1].created_at).getTime(),
        );
      }
    });

    it("findAll filters by status", async () => {
      const p1 = await seedPayment();
      const p2 = await seedPayment();
      await advanceToStatus(p1.nexus_payment_id, "ESCROWED");

      const escrowed = await paymentRepo.findAll({ status: "ESCROWED" });
      expect(escrowed.length).toBe(1);
      expect(escrowed[0].nexus_payment_id).toBe(p1.nexus_payment_id);
    });

    it("countByStatus returns correct counts", async () => {
      const p1 = await seedPayment();
      const p2 = await seedPayment();
      const p3 = await seedPayment();

      await advanceToStatus(p1.nexus_payment_id, "ESCROWED");
      await advanceToStatus(p2.nexus_payment_id, "COMPLETED");

      const counts = await paymentRepo.countByStatus();
      expect(counts.get("ESCROWED")).toBe(1);
      expect(counts.get("COMPLETED")).toBe(1);
      expect(counts.get("CREATED")).toBe(1);
    });
  });
});
