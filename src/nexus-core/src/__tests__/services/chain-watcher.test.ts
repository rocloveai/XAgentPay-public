import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Hex } from "viem";

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
import { makeTestPayment } from "../fixtures.js";
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
};

const PAYMENT_ID_BYTES32 = ("0x" + "aa".repeat(32)) as Hex;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChainWatcher", () => {
  let paymentRepo: MockPaymentRepository;
  let eventRepo: MockEventRepository;
  let groupRepo: MockGroupRepository;
  let stateMachine: PaymentStateMachine;
  let groupManager: GroupManager;
  let watcher: ChainWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepo = new MockPaymentRepository();
    eventRepo = new MockEventRepository();
    groupRepo = new MockGroupRepository();
    stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
    groupManager = new GroupManager(groupRepo, paymentRepo, eventRepo);
    watcher = new ChainWatcher(
      TEST_CONFIG,
      paymentRepo,
      stateMachine,
      groupManager,
      null,
    );
  });

  it("initializes lastProcessedBlock on first poll", async () => {
    mockGetBlockNumber.mockResolvedValueOnce(100n);

    await watcher.pollOnce();

    // First poll just sets the baseline, no getLogs call
    expect(mockGetLogs).not.toHaveBeenCalled();
  });

  it("skips when no new blocks", async () => {
    mockGetBlockNumber.mockResolvedValueOnce(100n);
    await watcher.pollOnce(); // init

    mockGetBlockNumber.mockResolvedValueOnce(100n);
    await watcher.pollOnce();

    expect(mockGetLogs).not.toHaveBeenCalled();
  });

  it("processes Deposited event → ESCROWED transition", async () => {
    // Seed a BROADCASTED payment
    const payment = makeTestPayment({
      status: "BROADCASTED",
      payment_id_bytes32: PAYMENT_ID_BYTES32,
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
    // Force status to BROADCASTED
    await paymentRepo.updateStatus(payment.nexus_payment_id, "BROADCASTED", {
      payment_id_bytes32: PAYMENT_ID_BYTES32,
    });

    // First poll to init
    mockGetBlockNumber.mockResolvedValueOnce(100n);
    await watcher.pollOnce();

    // Second poll with new block and Deposited event
    mockGetBlockNumber.mockResolvedValueOnce(101n);
    mockGetLogs.mockResolvedValueOnce([
      {
        eventName: "Deposited",
        args: {
          paymentId: PAYMENT_ID_BYTES32,
          payer: payment.payer_wallet,
          merchant: payment.payment_address,
          amount: 100000n,
          orderRef: "0x" + "bb".repeat(32),
        },
        transactionHash: "0x" + "ff".repeat(32),
        blockNumber: 101n,
      },
    ]);

    await watcher.pollOnce();

    const updated = await paymentRepo.findById(payment.nexus_payment_id);
    expect(updated?.status).toBe("ESCROWED");
    expect(updated?.deposit_tx_hash).toBe("0x" + "ff".repeat(32));
  });

  it("processes Released event → SETTLED transition", async () => {
    const payment = makeTestPayment({
      status: "ESCROWED",
      payment_id_bytes32: PAYMENT_ID_BYTES32,
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
    });

    mockGetBlockNumber.mockResolvedValueOnce(200n);
    await watcher.pollOnce();

    mockGetBlockNumber.mockResolvedValueOnce(201n);
    mockGetLogs.mockResolvedValueOnce([
      {
        eventName: "Released",
        args: {
          paymentId: PAYMENT_ID_BYTES32,
          merchant: payment.payment_address,
          merchantAmount: 99700n,
          feeAmount: 300n,
        },
        transactionHash: "0x" + "ee".repeat(32),
        blockNumber: 201n,
      },
    ]);

    await watcher.pollOnce();

    const updated = await paymentRepo.findById(payment.nexus_payment_id);
    expect(updated?.status).toBe("SETTLED");
    expect(updated?.release_tx_hash).toBe("0x" + "ee".repeat(32));
    expect(updated?.protocol_fee).toBe("300");
  });

  it("processes Refunded event → REFUNDED transition", async () => {
    const payment = makeTestPayment({
      status: "ESCROWED",
      payment_id_bytes32: PAYMENT_ID_BYTES32,
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
    });

    mockGetBlockNumber.mockResolvedValueOnce(300n);
    await watcher.pollOnce();

    mockGetBlockNumber.mockResolvedValueOnce(301n);
    mockGetLogs.mockResolvedValueOnce([
      {
        eventName: "Refunded",
        args: {
          paymentId: PAYMENT_ID_BYTES32,
          payer: payment.payer_wallet,
          amount: 100000n,
        },
        transactionHash: "0x" + "dd".repeat(32),
        blockNumber: 301n,
      },
    ]);

    await watcher.pollOnce();

    const updated = await paymentRepo.findById(payment.nexus_payment_id);
    expect(updated?.status).toBe("REFUNDED");
    expect(updated?.refund_tx_hash).toBe("0x" + "dd".repeat(32));
  });

  it("skips unknown paymentId without crashing", async () => {
    mockGetBlockNumber.mockResolvedValueOnce(400n);
    await watcher.pollOnce();

    mockGetBlockNumber.mockResolvedValueOnce(401n);
    mockGetLogs.mockResolvedValueOnce([
      {
        eventName: "Deposited",
        args: {
          paymentId: ("0x" + "99".repeat(32)) as Hex,
          payer: "0x1234567890abcdef1234567890abcdef12345678",
          merchant: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
          amount: 100000n,
          orderRef: "0x" + "bb".repeat(32),
        },
        transactionHash: "0x" + "ff".repeat(32),
        blockNumber: 401n,
      },
    ]);

    // Should not throw
    await watcher.pollOnce();
  });

  it("start/stop manages interval timer", () => {
    watcher.start();
    watcher.start(); // idempotent
    watcher.stop();
    watcher.stop(); // idempotent
  });
});
