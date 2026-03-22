import { describe, it, expect, beforeEach } from "vitest";
import { GroupManager } from "../../services/group-manager.js";
import { MockGroupRepository } from "../mocks/mock-group-repo.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import { XAgentError } from "../../errors.js";
import {
  makeTestQuote,
  TEST_FLIGHT_MERCHANT,
  TEST_HOTEL_MERCHANT,
  TEST_PAYER_WALLET,
} from "../fixtures.js";

describe("GroupManager", () => {
  let groupRepo: MockGroupRepository;
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let gm: GroupManager;

  beforeEach(() => {
    groupRepo = new MockGroupRepository();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    gm = new GroupManager(groupRepo, paymentRepo, eventRepo);
  });

  describe("createGroup", () => {
    it("creates a group with one quote (N=1)", async () => {
      const quote = makeTestQuote({ amount: "100000" });
      const result = await gm.createGroup({
        quotes: [quote],
        merchants: [TEST_FLIGHT_MERCHANT],
        quoteHashes: ["0x" + "aa".repeat(32)],
        payerWallet: TEST_PAYER_WALLET,
        paymentMethod: "ESCROW_CONTRACT",
      });

      expect(result.group.group_id).toMatch(/^GRP-/);
      expect(result.group.total_amount).toBe("100000");
      expect(result.group.payment_count).toBe(1);
      expect(result.group.status).toBe("GROUP_CREATED");
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].group_id).toBe(result.group.group_id);
    });

    it("creates a group with two quotes (aggregated)", async () => {
      const flightQuote = makeTestQuote({
        merchant_did: "did:xagent:20250407:demo_flight",
        amount: "530000000",
      });
      const hotelQuote = makeTestQuote({
        merchant_did: "did:xagent:20250407:demo_hotel",
        amount: "100100000",
      });

      const result = await gm.createGroup({
        quotes: [flightQuote, hotelQuote],
        merchants: [TEST_FLIGHT_MERCHANT, TEST_HOTEL_MERCHANT],
        quoteHashes: ["0x" + "bb".repeat(32), "0x" + "cc".repeat(32)],
        payerWallet: TEST_PAYER_WALLET,
        paymentMethod: "ESCROW_CONTRACT",
      });

      expect(result.group.total_amount).toBe("630100000");
      expect(result.group.payment_count).toBe(2);
      expect(result.payments).toHaveLength(2);

      // Both payments belong to the group
      expect(result.payments[0].group_id).toBe(result.group.group_id);
      expect(result.payments[1].group_id).toBe(result.group.group_id);

      // Amounts are correct
      expect(result.payments[0].amount).toBe("530000000");
      expect(result.payments[1].amount).toBe("100100000");
    });

    it("throws for empty quotes", async () => {
      await expect(
        gm.createGroup({
          quotes: [],
          merchants: [],
          quoteHashes: [],
          payerWallet: TEST_PAYER_WALLET,
          paymentMethod: "ESCROW_CONTRACT",
        }),
      ).rejects.toThrow(XAgentError);
    });

    it("throws for mismatched quotes/merchants", async () => {
      const quote = makeTestQuote();
      await expect(
        gm.createGroup({
          quotes: [quote],
          merchants: [TEST_FLIGHT_MERCHANT, TEST_HOTEL_MERCHANT],
          quoteHashes: ["0x" + "aa".repeat(32)],
          payerWallet: TEST_PAYER_WALLET,
          paymentMethod: "ESCROW_CONTRACT",
        }),
      ).rejects.toThrow(XAgentError);
    });
  });

  describe("getGroupDetail", () => {
    it("returns null for unknown group", async () => {
      const result = await gm.getGroupDetail("GRP-nonexistent");
      expect(result).toBeNull();
    });

    it("returns group with payments", async () => {
      const quote = makeTestQuote({ amount: "100000" });
      const created = await gm.createGroup({
        quotes: [quote],
        merchants: [TEST_FLIGHT_MERCHANT],
        quoteHashes: ["0x" + "dd".repeat(32)],
        payerWallet: TEST_PAYER_WALLET,
        paymentMethod: "ESCROW_CONTRACT",
      });

      const detail = await gm.getGroupDetail(created.group.group_id);
      expect(detail).not.toBeNull();
      expect(detail!.group.group_id).toBe(created.group.group_id);
      expect(detail!.payments).toHaveLength(1);
    });
  });

  describe("confirmGroupDeposit", () => {
    it("returns null for unknown group", async () => {
      const result = await gm.confirmGroupDeposit("GRP-nonexistent", "0xabc");
      expect(result).toBeNull();
    });

    it("transitions all payments to ESCROWED", async () => {
      const flightQuote = makeTestQuote({
        merchant_did: "did:xagent:20250407:demo_flight",
        amount: "100000",
      });
      const hotelQuote = makeTestQuote({
        merchant_did: "did:xagent:20250407:demo_hotel",
        amount: "200000",
      });

      const created = await gm.createGroup({
        quotes: [flightQuote, hotelQuote],
        merchants: [TEST_FLIGHT_MERCHANT, TEST_HOTEL_MERCHANT],
        quoteHashes: ["0x" + "ee".repeat(32), "0x" + "ff".repeat(32)],
        payerWallet: TEST_PAYER_WALLET,
        paymentMethod: "ESCROW_CONTRACT",
      });

      // All payments start as CREATED
      for (const p of created.payments) {
        expect(p.status).toBe("CREATED");
      }

      const txHash = "0x" + "ab".repeat(32);
      const result = await gm.confirmGroupDeposit(
        created.group.group_id,
        txHash,
      );

      expect(result).not.toBeNull();
      expect(result!.group.status).toBe("GROUP_ESCROWED");

      // All payments should now be ESCROWED
      for (const p of result!.payments) {
        expect(p.status).toBe("ESCROWED");
      }
    });

    it("skips payments already in ESCROWED status", async () => {
      const quote = makeTestQuote({ amount: "100000" });
      const created = await gm.createGroup({
        quotes: [quote],
        merchants: [TEST_FLIGHT_MERCHANT],
        quoteHashes: ["0x" + "11".repeat(32)],
        payerWallet: TEST_PAYER_WALLET,
        paymentMethod: "ESCROW_CONTRACT",
      });

      // Manually transition to ESCROWED first
      await paymentRepo.updateStatus(
        created.payments[0].xagent_payment_id,
        "ESCROWED",
      );

      // Should succeed without error (skips already-escrowed)
      const result = await gm.confirmGroupDeposit(
        created.group.group_id,
        "0x" + "cd".repeat(32),
      );

      expect(result).not.toBeNull();
      expect(result!.group.status).toBe("GROUP_ESCROWED");
    });
  });

  describe("syncGroupStatus", () => {
    it("returns null for unknown group", async () => {
      const result = await gm.syncGroupStatus("GRP-nonexistent");
      expect(result).toBeNull();
    });
  });
});
