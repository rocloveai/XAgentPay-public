/**
 * NexusPay Core — Timeout Handler.
 *
 * Periodically scans for expired escrows and submits on-chain refunds
 * via the Relayer. Also delegates to StateMachine.runTimeoutSweep()
 * for AWAITING_TX expirations.
 */
import type { Hex } from "viem";
import type { NexusRelayer } from "./relayer.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import type { PaymentStateMachine } from "./state-machine.js";
import type { GroupManager } from "./group-manager.js";

export class TimeoutHandler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(
    private readonly relayer: NexusRelayer,
    private readonly paymentRepo: PaymentRepository,
    private readonly stateMachine: PaymentStateMachine,
    private readonly groupManager: GroupManager,
    intervalMs: number,
  ) {
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.timer) return;
    console.error(`[TimeoutHandler] Starting (interval=${this.intervalMs}ms)`);
    this.timer = setInterval(() => {
      this.sweepOnce().catch((err) =>
        console.error("[TimeoutHandler] sweep error:", err),
      );
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sweepOnce(): Promise<void> {
    // Quick check: skip all scans if no active payments exist
    const hasActive = await this.paymentRepo.hasNonTerminalPayments();
    if (!hasActive) return;

    // 1. Handle AWAITING_TX timeouts (state machine only, no chain tx)
    const expiredPayments = await this.stateMachine.runTimeoutSweep();

    // 1b. Sync group status for any groups with newly-expired payments
    const affectedGroupIds = new Set(
      expiredPayments
        .map((p) => p.group_id)
        .filter((id): id is string => id !== null),
    );
    for (const groupId of affectedGroupIds) {
      try {
        await this.groupManager.syncGroupStatus(groupId);
      } catch (err) {
        console.error(
          `[TimeoutHandler] Failed to sync group ${groupId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // 2. Handle expired ESCROWED payments — submit on-chain refund
    const now = new Date().toISOString();
    const expiredEscrowed = await this.paymentRepo.findExpiredEscrowed(now);

    for (const payment of expiredEscrowed) {
      if (!payment.payment_id_bytes32) {
        console.error(
          `[TimeoutHandler] ESCROWED payment ${payment.nexus_payment_id} has no payment_id_bytes32, skipping`,
        );
        continue;
      }

      try {
        await this.relayer.submitRefund(payment.payment_id_bytes32 as Hex);
        // ChainWatcher will handle the Refunded event and transition state
      } catch (err) {
        console.error(
          `[TimeoutHandler] Refund submission failed for ${payment.nexus_payment_id}:`,
          err instanceof Error ? err.message : err,
        );
        // Will retry on next sweep
      }
    }

    // 3. Handle expired DISPUTE_OPEN — auto-resolve to 100% payer refund
    const expiredDisputes =
      await this.paymentRepo.findDisputeOpenPastDeadline(now);

    for (const payment of expiredDisputes) {
      if (!payment.payment_id_bytes32) continue;
      try {
        await this.relayer.submitResolve(payment.payment_id_bytes32 as Hex, 0);
        // ChainWatcher will handle Resolved event → DISPUTE_RESOLVED
      } catch (err) {
        console.error(
          `[TimeoutHandler] Auto-resolve failed for ${payment.nexus_payment_id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}
