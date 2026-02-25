import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock viem — must be before NexusRelayer import
// ---------------------------------------------------------------------------

const mockGetBalance = vi.fn();

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: () => ({
      getBalance: mockGetBalance,
      waitForTransactionReceipt: vi.fn(),
    }),
    createWalletClient: () => ({
      account: { address: "0xRelayerAddress" },
      writeContract: vi.fn(),
    }),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: () => ({
    address: "0xRelayerAddress",
    type: "local",
  }),
}));

import { NexusRelayer } from "../../services/relayer.js";
import type { NexusCoreConfig } from "../../config.js";

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
};

describe("NexusRelayer — balance methods", () => {
  let relayer: NexusRelayer;

  beforeEach(() => {
    vi.clearAllMocks();
    relayer = new NexusRelayer(TEST_CONFIG);
  });

  describe("getAddress", () => {
    it("returns the wallet account address", () => {
      const address = relayer.getAddress();
      expect(address).toBe("0xRelayerAddress");
    });
  });

  describe("getRelayerBalance", () => {
    it("returns native balance from public client", async () => {
      mockGetBalance.mockResolvedValueOnce(5_000_000_000_000_000_000n);

      const balance = await relayer.getRelayerBalance();

      expect(balance).toBe(5_000_000_000_000_000_000n);
      expect(mockGetBalance).toHaveBeenCalledWith({
        address: "0xRelayerAddress",
      });
    });

    it("propagates RPC errors", async () => {
      mockGetBalance.mockRejectedValueOnce(new Error("RPC timeout"));

      await expect(relayer.getRelayerBalance()).rejects.toThrow("RPC timeout");
    });
  });
});
