/**
 * xNexus Core — Chain Watcher.
 *
 * Polls the NexusPayEscrow contract for on-chain events and drives
 * payment state transitions via the StateMachine.
 *
 * Improvements over v1:
 *  - Auto-release: once all payments in a group reach ESCROWED, the relayer
 *    automatically calls release() on each one (demo / coreOperator mode).
 *  - Chain-state reconciliation: a separate sweep reads getEscrow() directly
 *    from the contract for all DB-ESCROWED payments, catching events missed
 *    by eth_getLogs (known reliability issue on XLayer).
 *  - getLogs retry with exponential back-off and reduced MAX_BLOCK_RANGE.
 *  - Faster default poll interval (8 s instead of 15 s).
 */
import {
  createPublicClient,
  http,
  type PublicClient,
  type Hex,
  type Log,
  type Chain,
  type HttpTransport,
} from "viem";
import type { NexusCoreConfig } from "../config.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import type { KVRepository } from "../db/interfaces/kv-repo.js";
import { createLogger } from "../logger.js";
import type {
  PaymentRecord,
  PaymentStatus,
  PaymentEventType,
} from "../types.js";
import { NEXUS_PAY_ESCROW_EVENTS, NEXUS_PAY_ESCROW_ABI } from "../abi/nexus-pay-escrow.js";
import { buildPlatonChain, type NexusRelayer, OnChainEscrowStatus } from "./relayer.js";
import type { PaymentStateMachine } from "./state-machine.js";
import type { GroupManager } from "./group-manager.js";
import type { WebhookNotifier } from "./webhook-notifier.js";

// ---------------------------------------------------------------------------
// Event → State mapping
// ---------------------------------------------------------------------------

interface EventMapping {
  readonly toStatus: PaymentStatus;
  readonly eventType: PaymentEventType;
}

const EVENT_MAP: Readonly<Record<string, EventMapping>> = {
  Deposited: { toStatus: "ESCROWED", eventType: "ESCROW_DEPOSITED" },
  Released: { toStatus: "SETTLED", eventType: "ESCROW_RELEASED" },
  Refunded: { toStatus: "REFUNDED", eventType: "ESCROW_REFUNDED" },
  Disputed: { toStatus: "DISPUTE_OPEN", eventType: "DISPUTE_OPENED" },
  Resolved: { toStatus: "DISPUTE_RESOLVED", eventType: "DISPUTE_RESOLVED" },
};

const STATUS_TO_WEBHOOK: Readonly<Record<string, string>> = {
  ESCROWED: "payment.escrowed",
  SETTLED: "payment.settled",
  REFUNDED: "payment.refunded",
  EXPIRED: "payment.expired",
  DISPUTE_OPEN: "dispute.opened",
  DISPUTE_RESOLVED: "dispute.resolved",
  COMPLETED: "payment.completed",
};

// ---------------------------------------------------------------------------
// ChainWatcher
// ---------------------------------------------------------------------------

/** Smaller range avoids XLayer RPC timeouts on eth_getLogs */
const MAX_BLOCK_RANGE = 200n;
/** How many getLogs retries before giving up on a range */
const GETLOGS_MAX_RETRIES = 3;
/** How often to run the chain-state reconciliation sweep (every N poll ticks) */
const RECONCILE_EVERY_N_POLLS = 3;

const KV_KEY_LAST_BLOCK = "chain_watcher.last_processed_block";
const cwLog = createLogger("ChainWatcher");

export class ChainWatcher {
  private readonly client: PublicClient<HttpTransport, Chain>;
  private readonly escrowAddress: Hex;
  private readonly intervalMs: number;
  private lastProcessedBlock: bigint;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private inflightPoll: Promise<void> | null = null;
  private pollCount = 0;

  constructor(
    private readonly config: NexusCoreConfig,
    private readonly paymentRepo: PaymentRepository,
    private readonly stateMachine: PaymentStateMachine,
    private readonly groupManager: GroupManager,
    private readonly webhookNotifier: WebhookNotifier | null = null,
    private readonly kvRepo: KVRepository | null = null,
    /** Optional relayer — enables auto-release after all-ESCROWED group */
    private readonly relayer: NexusRelayer | null = null,
  ) {
    const chain = buildPlatonChain(config);
    this.client = createPublicClient({ chain, transport: http(config.rpcUrl) });
    this.escrowAddress = config.escrowContract as Hex;
    this.intervalMs = config.watcherIntervalMs;
    this.lastProcessedBlock = 0n;
  }

  async start(): Promise<void> {
    if (this.timer) return;

    if (this.kvRepo) {
      try {
        const saved = await this.kvRepo.get(KV_KEY_LAST_BLOCK);
        if (saved) {
          this.lastProcessedBlock = BigInt(saved);
          cwLog.info("Restored block progress", { block: saved });
        }
      } catch (err) {
        cwLog.warn("Failed to load persisted block, starting from 0", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    cwLog.info("Starting", {
      interval: this.intervalMs,
      contract: this.escrowAddress,
      resumeBlock: this.lastProcessedBlock.toString(),
      autoRelease: this.relayer !== null,
    });

    this.timer = setInterval(() => {
      const poll = this.pollOnce().catch((err) =>
        cwLog.error("poll error", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      this.inflightPoll = poll;
      poll.finally(() => {
        if (this.inflightPoll === poll) this.inflightPoll = null;
      });
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inflightPoll) await this.inflightPoll;
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    this.pollCount++;

    try {
      const latestBlock = await this.client.getBlockNumber();

      if (this.lastProcessedBlock === 0n) {
        this.lastProcessedBlock = latestBlock;
        cwLog.info("First poll — starting from current block", {
          block: latestBlock.toString(),
        });
        // On first poll, immediately reconcile existing ESCROWED payments
        await this.reconcileEscrowedPayments();
        return;
      }

      if (latestBlock <= this.lastProcessedBlock) return;

      const fromBlock = this.lastProcessedBlock + 1n;
      const toBlock =
        latestBlock > fromBlock + MAX_BLOCK_RANGE - 1n
          ? fromBlock + MAX_BLOCK_RANGE - 1n
          : latestBlock;

      const logs = await this.getLogsWithRetry(fromBlock, toBlock);

      for (const entry of logs) {
        const eventName = (entry as { eventName?: string }).eventName;
        if (eventName === "BatchDeposited") {
          await this.processBatchDeposited(entry);
        } else {
          await this.processLog(entry);
        }
      }

      this.lastProcessedBlock = toBlock;

      if (this.kvRepo) {
        this.kvRepo
          .set(KV_KEY_LAST_BLOCK, toBlock.toString())
          .catch((err) =>
            cwLog.warn("Failed to persist block progress", {
              block: toBlock.toString(),
              error: err instanceof Error ? err.message : String(err),
            }),
          );
      }

      // Periodic chain-state reconciliation (catches missed getLogs events)
      if (this.pollCount % RECONCILE_EVERY_N_POLLS === 0) {
        await this.reconcileEscrowedPayments();
      }
    } finally {
      this.polling = false;
    }
  }

  // ---------------------------------------------------------------------------
  // getLogs with retry + exponential back-off
  // ---------------------------------------------------------------------------

  private async getLogsWithRetry(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    let lastError: unknown;
    for (let attempt = 0; attempt < GETLOGS_MAX_RETRIES; attempt++) {
      try {
        const logs = await this.client.getLogs({
          address: this.escrowAddress,
          events: NEXUS_PAY_ESCROW_EVENTS,
          fromBlock,
          toBlock,
        });
        if (attempt > 0) {
          cwLog.info("getLogs succeeded after retry", { attempt, fromBlock: fromBlock.toString() });
        }
        return logs;
      } catch (err) {
        lastError = err;
        const backoffMs = 500 * Math.pow(2, attempt);
        cwLog.warn("getLogs failed, retrying", {
          attempt,
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          backoffMs,
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    cwLog.error("getLogs failed after all retries, skipping range", {
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return [];
  }

  // ---------------------------------------------------------------------------
  // Chain-state reconciliation: query getEscrow() directly for DB-ESCROWED payments
  // ---------------------------------------------------------------------------

  /**
   * For every payment whose DB status is ESCROWED, read the actual on-chain
   * escrow status.  If the chain shows RELEASED (or REFUNDED), transition the
   * DB immediately — this heals state when eth_getLogs misses Release events.
   */
  async reconcileEscrowedPayments(): Promise<void> {
    let escrowedPayments: readonly PaymentRecord[];
    try {
      escrowedPayments = await this.paymentRepo.findAll({ status: "ESCROWED", limit: 100 });
    } catch (err) {
      cwLog.warn("reconcile: failed to fetch ESCROWED payments", {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (escrowedPayments.length === 0) return;
    cwLog.info("reconcile: checking ESCROWED payments against chain", {
      count: escrowedPayments.length,
    });

    for (const payment of escrowedPayments) {
      if (!payment.payment_id_bytes32) continue;
      try {
        const onChainStatus = await this.readEscrowStatus(payment.payment_id_bytes32 as Hex);

        if (onChainStatus === OnChainEscrowStatus.RELEASED) {
          cwLog.info("reconcile: chain shows RELEASED, healing DB", {
            paymentId: payment.nexus_payment_id,
          });
          await this.stateMachine.transition({
            nexusPaymentId: payment.nexus_payment_id,
            toStatus: "SETTLED",
            eventType: "ESCROW_RELEASED",
            metadata: { reason: "chain_state_reconcile" },
            fields: { settled_at: new Date().toISOString(), tx_hash: null },
          });
          if (payment.group_id) {
            await this.groupManager.syncGroupStatus(payment.group_id);
          }
        } else if (onChainStatus === OnChainEscrowStatus.REFUNDED) {
          cwLog.info("reconcile: chain shows REFUNDED, healing DB", {
            paymentId: payment.nexus_payment_id,
          });
          await this.stateMachine.transition({
            nexusPaymentId: payment.nexus_payment_id,
            toStatus: "REFUNDED",
            eventType: "ESCROW_REFUNDED",
            metadata: { reason: "chain_state_reconcile" },
          });
          if (payment.group_id) {
            await this.groupManager.syncGroupStatus(payment.group_id);
          }
        }
      } catch (err) {
        cwLog.warn("reconcile: error checking payment", {
          paymentId: payment.nexus_payment_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async readEscrowStatus(paymentIdBytes32: Hex): Promise<number> {
    try {
      const result = await this.client.readContract({
        address: this.escrowAddress,
        abi: NEXUS_PAY_ESCROW_ABI,
        functionName: "getEscrow",
        args: [paymentIdBytes32],
      }) as readonly unknown[];
      // EscrowStatus is the 9th field (index 8) in the returned tuple
      return Number(result[8] ?? 0);
    } catch {
      return OnChainEscrowStatus.NONE;
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-release: trigger release() after all payments in a group are ESCROWED
  // ---------------------------------------------------------------------------

  /**
   * If the relayer is configured and every payment in a group is ESCROWED,
   * submit a release() tx for each one.  This enables full auto-settlement
   * in the demo/coreOperator flow without needing merchant confirmation.
   */
  private async maybeAutoRelease(groupId: string): Promise<void> {
    if (!this.relayer) return;

    try {
      const payments = await this.paymentRepo.findByGroupId(groupId);
      if (payments.length === 0) return;

      // Only auto-release when ALL payments in the group are ESCROWED
      const allEscrowed = payments.every((p) => p.status === "ESCROWED");
      if (!allEscrowed) return;

      cwLog.info("auto-release: all payments ESCROWED, releasing group", {
        groupId,
        count: payments.length,
      });

      for (const payment of payments) {
        if (!payment.payment_id_bytes32) {
          cwLog.warn("auto-release: payment has no payment_id_bytes32, skipping", {
            paymentId: payment.nexus_payment_id,
          });
          continue;
        }
        try {
          const result = await this.relayer.submitRelease(
            payment.payment_id_bytes32 as Hex,
          );
          cwLog.info("auto-release: release submitted", {
            paymentId: payment.nexus_payment_id,
            txHash: result.txHash,
          });
        } catch (err) {
          cwLog.error("auto-release: submitRelease failed", {
            paymentId: payment.nexus_payment_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      cwLog.error("auto-release: unexpected error", {
        groupId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Event processors
  // ---------------------------------------------------------------------------

  private async processLog(log: Log): Promise<void> {
    const eventName = (log as { eventName?: string }).eventName;
    if (!eventName) return;

    const mapping = EVENT_MAP[eventName];
    if (!mapping) return;

    const args = (log as { args?: Record<string, unknown> }).args ?? {};
    const paymentIdBytes32 = args.paymentId as Hex | undefined;
    if (!paymentIdBytes32) return;

    const payment = await this.paymentRepo.findByPaymentIdBytes32(paymentIdBytes32);
    if (!payment) {
      cwLog.warn("Unknown paymentId, skipping", { paymentIdBytes32 });
      return;
    }

    const fields = this.extractFields(eventName, args, log, payment);

    try {
      const updated = await this.stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: mapping.toStatus,
        eventType: mapping.eventType,
        metadata: {
          tx_hash: log.transactionHash,
          block_number: log.blockNumber?.toString(),
          event_name: eventName,
        },
        fields,
      });

      if (updated.group_id) {
        await this.groupManager.syncGroupStatus(updated.group_id);

        // After a Deposited event makes this payment ESCROWED, check if we
        // should auto-release the whole group.
        if (mapping.toStatus === "ESCROWED") {
          await this.maybeAutoRelease(updated.group_id);
        }
      }

      if (this.webhookNotifier) {
        const webhookEventType = STATUS_TO_WEBHOOK[mapping.toStatus];
        if (webhookEventType) {
          this.webhookNotifier
            .notify(
              updated,
              webhookEventType as import("../types.js").WebhookEventType,
            )
            .catch((err) =>
              cwLog.error("webhook notify error", {
                error: err instanceof Error ? err.message : String(err),
              }),
            );

          // Push real-time notification to Telegram order panel (Eva's bot)
          if (this.config.telegramNotifyUrl) {
            fetch(this.config.telegramNotifyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                group_id: updated.group_id,
                merchant_order_ref: updated.merchant_order_ref,
                status: updated.status,
                event_type: webhookEventType,
              }),
              signal: AbortSignal.timeout(8_000),
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      cwLog.error(`Failed to process ${eventName}`, {
        paymentId: payment.nexus_payment_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * BatchDeposited — emitted by batchDepositApprove() after all individual
   * Deposited events.  We use it as a signal to run a reconcile pass
   * (catching any Deposited events that getLogs may have missed) and to
   * trigger auto-release if all payments are already ESCROWED.
   */
  private async processBatchDeposited(log: Log): Promise<void> {
    const args = (log as { args?: Record<string, unknown> }).args ?? {};
    const payer = args.payer as string | undefined;
    const paymentCount = args.paymentCount as bigint | undefined;

    cwLog.info("BatchDeposited event", {
      payer,
      paymentCount: paymentCount?.toString(),
      txHash: log.transactionHash,
    });

    // Run a reconciliation pass: any payments for this payer that are
    // still CREATED/UNPAID but are now DEPOSITED on-chain will be healed.
    await this.reconcileEscrowedPayments();
  }

  private extractFields(
    eventName: string,
    args: Record<string, unknown>,
    log: Log,
    _payment: PaymentRecord,
  ): Record<string, unknown> {
    const now = new Date().toISOString();

    switch (eventName) {
      case "Deposited":
        return {
          deposit_tx_hash: log.transactionHash,
          escrow_contract: this.escrowAddress,
          release_deadline: new Date(
            Date.now() + this.config.releaseTimeoutS * 1000,
          ).toISOString(),
          dispute_deadline: new Date(
            Date.now() + this.config.disputeWindowS * 1000,
          ).toISOString(),
        };

      case "Released": {
        const feeAmount = args.feeAmount as bigint | undefined;
        return {
          release_tx_hash: log.transactionHash,
          settled_at: now,
          protocol_fee: feeAmount?.toString() ?? null,
          tx_hash: log.transactionHash,
          block_number: log.blockNumber ? Number(log.blockNumber) : null,
          block_timestamp: now,
        };
      }

      case "Refunded":
        return { refund_tx_hash: log.transactionHash };

      case "Disputed": {
        const reason = args.reason as Hex | undefined;
        return {
          dispute_reason: reason ?? null,
          dispute_deadline: new Date(
            Date.now() + this.config.arbitrationTimeoutS * 1000,
          ).toISOString(),
        };
      }

      case "Resolved":
        return { settled_at: now };

      default:
        return {};
    }
  }
}
