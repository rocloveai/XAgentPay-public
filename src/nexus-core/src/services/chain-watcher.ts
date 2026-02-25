/**
 * NexusPay Core — Chain Watcher.
 *
 * Polls the NexusPayEscrow contract for on-chain events and drives
 * payment state transitions via the StateMachine.
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
import { NEXUS_PAY_ESCROW_EVENTS } from "../abi/nexus-pay-escrow.js";
import { buildPlatonChain } from "./relayer.js";
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

// Webhook event type mapping by target status
const STATUS_TO_WEBHOOK: Readonly<Record<string, string>> = {
  ESCROWED: "payment.escrowed",
  SETTLED: "payment.settled",
  REFUNDED: "payment.refunded",
  DISPUTE_OPEN: "dispute.opened",
  DISPUTE_RESOLVED: "dispute.resolved",
  COMPLETED: "payment.completed",
};

// ---------------------------------------------------------------------------
// ChainWatcher
// ---------------------------------------------------------------------------

const MAX_BLOCK_RANGE = 1_000n;

const KV_KEY_LAST_BLOCK = "chain_watcher.last_processed_block";
const cwLog = createLogger("ChainWatcher");

export class ChainWatcher {
  private readonly client: PublicClient<HttpTransport, Chain>;
  private readonly escrowAddress: Hex;
  private readonly intervalMs: number;
  private lastProcessedBlock: bigint;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(
    private readonly config: NexusCoreConfig,
    private readonly paymentRepo: PaymentRepository,
    private readonly stateMachine: PaymentStateMachine,
    private readonly groupManager: GroupManager,
    private readonly webhookNotifier: WebhookNotifier | null = null,
    private readonly kvRepo: KVRepository | null = null,
  ) {
    const chain = buildPlatonChain(config);

    this.client = createPublicClient({ chain, transport: http(config.rpcUrl) });
    this.escrowAddress = config.escrowContract as Hex;
    this.intervalMs = config.watcherIntervalMs;
    this.lastProcessedBlock = 0n;
  }

  async start(): Promise<void> {
    if (this.timer) return;

    // Restore persisted block progress
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
    });
    this.timer = setInterval(() => {
      this.pollOnce().catch((err) =>
        cwLog.error("poll error", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const latestBlock = await this.client.getBlockNumber();

      if (this.lastProcessedBlock === 0n) {
        // First poll: start from current block (don't replay history)
        this.lastProcessedBlock = latestBlock;
        return;
      }

      if (latestBlock <= this.lastProcessedBlock) return;

      const fromBlock = this.lastProcessedBlock + 1n;
      // Chunk block range to avoid RPC limits
      const toBlock =
        latestBlock > fromBlock + MAX_BLOCK_RANGE - 1n
          ? fromBlock + MAX_BLOCK_RANGE - 1n
          : latestBlock;

      const logs = await this.client.getLogs({
        address: this.escrowAddress,
        events: NEXUS_PAY_ESCROW_EVENTS,
        fromBlock,
        toBlock,
      });

      for (const entry of logs) {
        await this.processLog(entry);
      }

      this.lastProcessedBlock = toBlock;

      // Persist block progress (fire-and-forget, failure is non-fatal)
      if (this.kvRepo) {
        try {
          await this.kvRepo.set(KV_KEY_LAST_BLOCK, toBlock.toString());
        } catch (err) {
          cwLog.warn("Failed to persist block progress", {
            block: toBlock.toString(),
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      this.polling = false;
    }
  }

  private async processLog(log: Log): Promise<void> {
    const eventName = (log as { eventName?: string }).eventName;
    if (!eventName) return;

    const mapping = EVENT_MAP[eventName];
    if (!mapping) return;

    const args = (log as { args?: Record<string, unknown> }).args ?? {};
    const paymentIdBytes32 = args.paymentId as Hex | undefined;
    if (!paymentIdBytes32) return;

    const payment =
      await this.paymentRepo.findByPaymentIdBytes32(paymentIdBytes32);
    if (!payment) {
      cwLog.warn("Unknown paymentId, skipping", {
        paymentIdBytes32,
      });
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

      // Sync group status if payment belongs to a group
      if (updated.group_id) {
        await this.groupManager.syncGroupStatus(updated.group_id);
      }

      // Send webhook notification
      if (this.webhookNotifier) {
        const webhookEventType = STATUS_TO_WEBHOOK[mapping.toStatus];
        if (webhookEventType) {
          await this.webhookNotifier
            .notify(
              updated,
              webhookEventType as import("../types.js").WebhookEventType,
            )
            .catch((err) =>
              cwLog.error("webhook notify error", {
                error: err instanceof Error ? err.message : String(err),
              }),
            );
        }
      }
    } catch (err) {
      cwLog.error(`Failed to process ${eventName}`, {
        paymentId: payment.nexus_payment_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
        const merchantAmount = args.merchantAmount as bigint | undefined;
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
        return {
          refund_tx_hash: log.transactionHash,
        };

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
        return {
          settled_at: now,
        };

      default:
        return {};
    }
  }
}
