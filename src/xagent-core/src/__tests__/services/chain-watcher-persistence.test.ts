import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock viem
// ---------------------------------------------------------------------------

const mockGetBlockNumber = vi.fn();
const mockGetLogs = vi.fn();

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: () => ({
      getBlockNumber: mockGetBlockNumber,
      getLogs: mockGetLogs,
    }),
  };
});

import { ChainWatcher } from "../../services/chain-watcher.js";
import { PaymentStateMachine } from "../../services/state-machine.js";
import { GroupManager } from "../../services/group-manager.js";
import { MockPaymentRepository } from "../mocks/mock-payment-repo.js";
import { MockEventRepository } from "../mocks/mock-event-repo.js";
import { MockGroupRepository } from "../mocks/mock-group-repo.js";
import { MockKVRepository } from "../mocks/mock-kv-repo.js";
import type { XAgentCoreConfig } from "../../config.js";

const TEST_CONFIG: XAgentCoreConfig = {
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

describe("ChainWatcher persistence", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let groupRepo: MockGroupRepository;
  let stateMachine: PaymentStateMachine;
  let groupManager: GroupManager;
  let kvRepo: MockKVRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    groupRepo = new MockGroupRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
    groupManager = new GroupManager(groupRepo, paymentRepo, eventRepo);
    kvRepo = new MockKVRepository();
  });

  it("loads saved block number from kvRepo on start", async () => {
    await kvRepo.set("chain_watcher.last_processed_block", "500");

    const watcher = new ChainWatcher(
      TEST_CONFIG,
      paymentRepo,
      stateMachine,
      groupManager,
      null,
      kvRepo,
    );
    await watcher.start();

    // Poll with block 501 — should query logs from 501
    mockGetBlockNumber.mockResolvedValueOnce(501n);
    mockGetLogs.mockResolvedValueOnce([]);
    await watcher.pollOnce();

    expect(mockGetLogs).toHaveBeenCalledTimes(1);
    const callArgs = mockGetLogs.mock.calls[0][0];
    expect(callArgs.fromBlock).toBe(501n);

    watcher.stop();
  });

  it("persists block number after successful poll", async () => {
    const watcher = new ChainWatcher(
      TEST_CONFIG,
      paymentRepo,
      stateMachine,
      groupManager,
      null,
      kvRepo,
    );

    // First poll: init
    mockGetBlockNumber.mockResolvedValueOnce(100n);
    await watcher.pollOnce();

    // Second poll: process block 101
    mockGetBlockNumber.mockResolvedValueOnce(101n);
    mockGetLogs.mockResolvedValueOnce([]);
    await watcher.pollOnce();

    const saved = await kvRepo.get("chain_watcher.last_processed_block");
    expect(saved).toBe("101");
  });

  it("does not crash when kvRepo.set fails", async () => {
    const failingKvRepo = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockRejectedValue(new Error("DB write failed")),
    };

    const watcher = new ChainWatcher(
      TEST_CONFIG,
      paymentRepo,
      stateMachine,
      groupManager,
      null,
      failingKvRepo,
    );

    // Init
    mockGetBlockNumber.mockResolvedValueOnce(100n);
    await watcher.pollOnce();

    // Should not throw
    mockGetBlockNumber.mockResolvedValueOnce(101n);
    mockGetLogs.mockResolvedValueOnce([]);
    await watcher.pollOnce();
  });

  it("starts from block 0 when kvRepo has no saved value", async () => {
    const watcher = new ChainWatcher(
      TEST_CONFIG,
      paymentRepo,
      stateMachine,
      groupManager,
      null,
      kvRepo,
    );
    await watcher.start();

    // First poll sets baseline to current block
    mockGetBlockNumber.mockResolvedValueOnce(200n);
    await watcher.pollOnce();

    // No getLogs on first poll (baseline init)
    expect(mockGetLogs).not.toHaveBeenCalled();

    watcher.stop();
  });
});
