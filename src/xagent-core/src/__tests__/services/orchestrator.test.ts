import { describe, it, expect, beforeEach } from "vitest";
import { NexusOrchestrator } from "../../services/orchestrator.js";
import { MockMerchantRepository } from "../mocks/mock-merchant-repo.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import { MockGroupRepository } from "../mocks/mock-group-repo.js";
import { MockKVRepository } from "../mocks/mock-kv-repo.js";
import { NexusError, SecurityError } from "../../errors.js";
import {
  makeTestQuote,
  TEST_FLIGHT_MERCHANT,
  TEST_HOTEL_MERCHANT,
  TEST_PAYER_WALLET,
  TEST_RELAYER_PRIVATE_KEY,
} from "../fixtures.js";
import type { NexusCoreConfig } from "../../config.js";

const TEST_CONFIG: NexusCoreConfig = {
  databaseUrl: "",
  escrowContract: "0x0000000000000000000000000000000000000001",
  chainId: 20250407,
  chainName: "PlatON Devnet",
  usdcAddress: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
  usdcDecimals: 6,
  protocolFeeBps: 30,
  releaseTimeoutS: 86400,
  disputeWindowS: 259200,
  port: 4000,
  rpcUrl: "https://devnet3openapi.platon.network/rpc",
  relayerPrivateKey: TEST_RELAYER_PRIVATE_KEY,
  watcherIntervalMs: 15000,
  timeoutSweepIntervalMs: 60000,
  webhookRetryIntervalMs: 30000,
  arbitrationTimeoutS: 604800,
  portalToken: "",
  baseUrl: "http://localhost:4000",
};

describe("NexusOrchestrator", () => {
  let merchantRepo: MockMerchantRepository;
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let groupRepo: MockGroupRepository;
  let kvRepo: MockKVRepository;
  let orchestrator: NexusOrchestrator;

  beforeEach(() => {
    merchantRepo = new MockMerchantRepository();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    groupRepo = new MockGroupRepository();

    merchantRepo.seed([TEST_FLIGHT_MERCHANT, TEST_HOTEL_MERCHANT]);

    kvRepo = new MockKVRepository();

    orchestrator = new NexusOrchestrator(
      merchantRepo,
      paymentRepo,
      eventRepo,
      groupRepo,
      kvRepo,
      TEST_CONFIG,
    );
  });

  describe("orchestratePayment", () => {
    it("throws for empty quotes", async () => {
      await expect(
        orchestrator.orchestratePayment({
          quotes: [],
          payerWallet: TEST_PAYER_WALLET,
        }),
      ).rejects.toThrow(NexusError);
    });

    it("throws for unknown merchant DID", async () => {
      const quote = makeTestQuote({
        merchant_did: "did:nexus:unknown",
        expiry: Math.floor(Date.now() / 1000) + 600,
      });

      await expect(
        orchestrator.orchestratePayment({
          quotes: [quote],
          payerWallet: TEST_PAYER_WALLET,
        }),
      ).rejects.toThrow(SecurityError);
    });

    it("throws for expired quote", async () => {
      const quote = makeTestQuote({
        merchant_did: TEST_FLIGHT_MERCHANT.merchant_did,
        expiry: Math.floor(Date.now() / 1000) - 60,
      });

      await expect(
        orchestrator.orchestratePayment({
          quotes: [quote],
          payerWallet: TEST_PAYER_WALLET,
        }),
      ).rejects.toThrow(SecurityError);
    });
  });

  describe("getPaymentStatus", () => {
    it("returns null payment for unknown id", async () => {
      const result = await orchestrator.getPaymentStatus({
        xagentPaymentId: "PAY-unknown",
      });
      expect(result.payment).toBeNull();
    });

    it("returns null group for unknown group_id", async () => {
      const result = await orchestrator.getPaymentStatus({
        groupId: "GRP-unknown",
      });
      expect(result.group).toBeNull();
    });
  });

  describe("getGroupStatus", () => {
    it("returns null for unknown group", async () => {
      const result = await orchestrator.getGroupStatus("GRP-unknown");
      expect(result.group).toBeNull();
      expect(result.payments).toHaveLength(0);
    });
  });
});
