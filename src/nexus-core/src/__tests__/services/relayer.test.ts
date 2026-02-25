import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hex } from "viem";

// ---------------------------------------------------------------------------
// Mock viem — must be before NexusRelayer import
// ---------------------------------------------------------------------------

const mockWriteContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn();

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: () => ({
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
    }),
    createWalletClient: () => ({
      writeContract: mockWriteContract,
    }),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: () => ({
    address: "0xRelayerAddress",
    type: "local",
  }),
}));

import {
  NexusRelayer,
  RETRY_DELAYS_MS,
  type DepositParams,
} from "../../services/relayer.js";
import { RelayerError } from "../../errors.js";
import type { NexusCoreConfig } from "../../config.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: NexusCoreConfig = {
  databaseUrl: "",
  escrowContract: "0x1111111111111111111111111111111111111111",
  chainId: 20250407,
  chainName: "PlatON Devnet",
  usdcAddress: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
  usdcDecimals: 6,
  protocolFeeBps: 30,
  releaseTimeoutS: 86400,
  disputeWindowS: 259200,
  port: 4000,
  rpcUrl: "https://devnet3openapi.platon.network/rpc",
  relayerPrivateKey: "0x" + "ab".repeat(32),
  watcherIntervalMs: 15000,
  timeoutSweepIntervalMs: 60000,
  webhookRetryIntervalMs: 30000,
  arbitrationTimeoutS: 604800,
  portalToken: "",
};

const DEPOSIT_PARAMS: DepositParams = {
  paymentId: ("0x" + "aa".repeat(32)) as Hex,
  from: "0x1234567890abcdef1234567890abcdef12345678" as Hex,
  merchant: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1" as Hex,
  amount: 100000n,
  orderRef: ("0x" + "bb".repeat(32)) as Hex,
  merchantDid: ("0x" + "cc".repeat(32)) as Hex,
  contextHash: ("0x" + "dd".repeat(32)) as Hex,
  validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now() / 1000) + 1800),
  nonce: ("0x" + "ee".repeat(32)) as Hex,
  v: 27,
  r: ("0x" + "11".repeat(32)) as Hex,
  s: ("0x" + "22".repeat(32)) as Hex,
};

const TX_HASH = "0x" + "ff".repeat(32);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NexusRelayer", () => {
  let relayer: NexusRelayer;
  let originalDelays: number[];

  beforeEach(() => {
    vi.clearAllMocks();
    // Override retry delays to 0 for fast tests
    originalDelays = [...RETRY_DELAYS_MS];
    RETRY_DELAYS_MS[0] = 0;
    RETRY_DELAYS_MS[1] = 0;
    RETRY_DELAYS_MS[2] = 0;
    relayer = new NexusRelayer(TEST_CONFIG);
  });

  afterEach(() => {
    // Restore original delays
    RETRY_DELAYS_MS[0] = originalDelays[0];
    RETRY_DELAYS_MS[1] = originalDelays[1];
    RETRY_DELAYS_MS[2] = originalDelays[2];
  });

  it("throws if RELAYER_PRIVATE_KEY is missing", () => {
    expect(
      () => new NexusRelayer({ ...TEST_CONFIG, relayerPrivateKey: "" }),
    ).toThrow(RelayerError);
  });

  describe("submitDeposit", () => {
    it("submits deposit and returns success result", async () => {
      mockWriteContract.mockResolvedValueOnce(TX_HASH);
      mockWaitForTransactionReceipt.mockResolvedValueOnce({
        status: "success",
        blockNumber: 42n,
      });

      const result = await relayer.submitDeposit(DEPOSIT_PARAMS);

      expect(result.txHash).toBe(TX_HASH);
      expect(result.blockNumber).toBe(42n);
      expect(result.status).toBe("success");
      expect(mockWriteContract).toHaveBeenCalledOnce();
    });

    it("throws immediately on reverted transaction (no retry)", async () => {
      mockWriteContract.mockResolvedValueOnce(TX_HASH);
      mockWaitForTransactionReceipt.mockResolvedValueOnce({
        status: "reverted",
        blockNumber: 43n,
      });

      await expect(relayer.submitDeposit(DEPOSIT_PARAMS)).rejects.toThrow(
        RelayerError,
      );
      // Only 1 attempt — reverts are not retried
      expect(mockWriteContract).toHaveBeenCalledOnce();
    });

    it("retries on submission failure and succeeds", async () => {
      mockWriteContract
        .mockRejectedValueOnce(new Error("nonce too low"))
        .mockResolvedValueOnce(TX_HASH);
      mockWaitForTransactionReceipt.mockResolvedValueOnce({
        status: "success",
        blockNumber: 44n,
      });

      const result = await relayer.submitDeposit(DEPOSIT_PARAMS);

      expect(result.status).toBe("success");
      expect(mockWriteContract).toHaveBeenCalledTimes(2);
    });

    it("throws after all retries exhausted", async () => {
      mockWriteContract.mockRejectedValue(new Error("persistent error"));

      await expect(relayer.submitDeposit(DEPOSIT_PARAMS)).rejects.toThrow(
        /retries exhausted/,
      );
      // 1 initial + 3 retries = 4 attempts
      expect(mockWriteContract).toHaveBeenCalledTimes(4);
    });
  });

  describe("submitRelease", () => {
    it("submits release and returns success result", async () => {
      const paymentId = ("0x" + "aa".repeat(32)) as Hex;
      mockWriteContract.mockResolvedValueOnce(TX_HASH);
      mockWaitForTransactionReceipt.mockResolvedValueOnce({
        status: "success",
        blockNumber: 50n,
      });

      const result = await relayer.submitRelease(paymentId);

      expect(result.txHash).toBe(TX_HASH);
      expect(result.status).toBe("success");
    });
  });

  describe("submitRefund", () => {
    it("submits refund and returns success result", async () => {
      const paymentId = ("0x" + "aa".repeat(32)) as Hex;
      mockWriteContract.mockResolvedValueOnce(TX_HASH);
      mockWaitForTransactionReceipt.mockResolvedValueOnce({
        status: "success",
        blockNumber: 60n,
      });

      const result = await relayer.submitRefund(paymentId);

      expect(result.txHash).toBe(TX_HASH);
      expect(result.status).toBe("success");
      expect(result.blockNumber).toBe(60n);
    });
  });

  describe("submitResolve", () => {
    it("submits resolve and returns success result", async () => {
      const paymentId = ("0x" + "aa".repeat(32)) as Hex;
      mockWriteContract.mockResolvedValueOnce(TX_HASH);
      mockWaitForTransactionReceipt.mockResolvedValueOnce({
        status: "success",
        blockNumber: 70n,
      });

      const result = await relayer.submitResolve(paymentId, 5000);

      expect(result.txHash).toBe(TX_HASH);
      expect(result.status).toBe("success");
      expect(result.blockNumber).toBe(70n);
      expect(mockWriteContract).toHaveBeenCalledOnce();
    });

    it("throws immediately on reverted transaction (no retry)", async () => {
      const paymentId = ("0x" + "aa".repeat(32)) as Hex;
      mockWriteContract.mockResolvedValueOnce(TX_HASH);
      mockWaitForTransactionReceipt.mockResolvedValueOnce({
        status: "reverted",
        blockNumber: 71n,
      });

      await expect(relayer.submitResolve(paymentId, 0)).rejects.toThrow(
        RelayerError,
      );
      expect(mockWriteContract).toHaveBeenCalledOnce();
    });
  });
});
