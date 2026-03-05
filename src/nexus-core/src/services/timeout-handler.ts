/**
 * xNexus Core — Timeout Handler.
 *
 * Periodically scans for expired escrows and submits on-chain refunds
 * via the Relayer. Also delegates to StateMachine.runTimeoutSweep()
 * for AWAITING_TX expirations.
 */
import type { Hex } from "viem";
import { type NexusRelayer, OnChainEscrowStatus } from "./relayer.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import type { PaymentStateMachine } from "./state-machine.js";
import type { GroupManager } from "./group-manager.js";
import type { WebhookNotifier } from "./webhook-notifier.js";
import type { PaymentRecord } from "../types.js";

export class TimeoutHandler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(
    private readonly relayer: NexusRelayer,
    private readonly paymentRepo: PaymentRepository,
    private readonly stateMachine: PaymentStateMachine,
    private readonly groupManager: GroupManager,
    private readonly webhookNotifier: WebhookNotifier | null,
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

    // 1b. Notify merchants of expired payments
    if (this.webhookNotifier && expiredPayments.length > 0) {
      for (const payment of expiredPayments) {
        this.webhookNotifier
          .notify(payment, "payment.expired")
          .catch((err) =>
            console.error(
              `[TimeoutHandler] Webhook failed for ${payment.nexus_payment_id}:`,
              err instanceof Error ? err.message : err,
            ),
          );
      }
    }

    // 1c. Sync group status for any groups with newly-expired payments
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
        // Check on-chain state to avoid infinite retry loops
        await this.syncFromChainState(payment);
      }
    }

    // 3. Handle expired DISPUTE_OPEN — auto-resolve to 100% payer refund
    //    (same chain-state sync applies to dispute resolution failures below)
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
        await this.syncFromChainState(payment);
      }
    }
  }

  /**
   * When an on-chain refund/resolve call fails, read the actual on-chain
   * escrow state and sync the DB accordingly. This prevents infinite retry
   * loops for payments whose escrow no longer exists or was already processed.
   */
  private async syncFromChainState(payment: PaymentRecord): Promise<void> {
    try {
      const chainStatus = await this.relayer.getEscrowStatus(
        payment.payment_id_bytes32 as Hex,
      );

      const id = payment.nexus_payment_id;

      if (
        chainStatus === OnChainEscrowStatus.NONE ||
        chainStatus === OnChainEscrowStatus.REFUNDED
      ) {
        // Escrow doesn't exist or was already refunded — sync DB to REFUNDED
        console.error(
          `[TimeoutHandler] On-chain status=${chainStatus} for ${id}, transitioning to REFUNDED`,
        );
        await this.stateMachine.transition({
          nexusPaymentId: id,
          toStatus: "REFUNDED",
          eventType: "ESCROW_REFUNDED",
          metadata: {
            reason: "chain_state_sync",
            onChainStatus: chainStatus,
          },
        });
      } else if (chainStatus === OnChainEscrowStatus.RELEASED) {
        // Already released on-chain — sync DB to SETTLED
        console.error(
          `[TimeoutHandler] On-chain status=RELEASED for ${id}, transitioning to SETTLED`,
        );
        await this.stateMachine.transition({
          nexusPaymentId: id,
          toStatus: "SETTLED",
          eventType: "ESCROW_RELEASED",
          metadata: {
            reason: "chain_state_sync",
            onChainStatus: chainStatus,
          },
        });
      } else if (
        chainStatus >= OnChainEscrowStatus.RESOLVED_TO_MERCHANT &&
        chainStatus <= OnChainEscrowStatus.RESOLVED_SPLIT
      ) {
        // Already resolved on-chain — transition through dispute flow
        console.error(
          `[TimeoutHandler] On-chain status=${chainStatus} for ${id}, transitioning to DISPUTE_RESOLVED`,
        );
        // May need to go through DISPUTE_OPEN first if current status is ESCROWED
        if (payment.status === "ESCROWED") {
          await this.stateMachine.transition({
            nexusPaymentId: id,
            toStatus: "DISPUTE_OPEN",
            eventType: "DISPUTE_OPENED",
            metadata: { reason: "chain_state_sync" },
          });
        }
        await this.stateMachine.transition({
          nexusPaymentId: id,
          toStatus: "DISPUTE_RESOLVED",
          eventType: "DISPUTE_RESOLVED",
          metadata: {
            reason: "chain_state_sync",
            onChainStatus: chainStatus,
          },
        });
      }
      // DEPOSITED or DISPUTED — genuine on-chain state, will retry next sweep
    } catch (syncErr) {
      console.error(
        `[TimeoutHandler] Chain state sync failed for ${payment.nexus_payment_id}:`,
        syncErr instanceof Error ? syncErr.message : syncErr,
      );
    }
  }
}
