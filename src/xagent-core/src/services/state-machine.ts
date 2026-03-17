/**
 * XAgent Core — Payment state machine.
 *
 * Manages individual payment lifecycle transitions.
 */
import { randomUUID } from "node:crypto";
import type {
  PaymentRecord,
  PaymentStatus,
  PaymentEventType,
  XAgentQuotePayload,
  PaymentMethod,
  IsoMetadata,
  CreatePaymentParams,
  CreateEventParams,
} from "../types.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import type { EventRepository } from "../db/interfaces/event-repo.js";
import { VALID_TRANSITIONS, TERMINAL_STATUSES } from "../constants.js";
import { InvalidTransitionError, XAgentError } from "../errors.js";

export interface CreatePaymentInput {
  readonly quoteHash: string;
  readonly groupId: string | null;
  readonly merchantDid: string;
  readonly merchantOrderRef: string;
  readonly payerWallet: string;
  readonly paymentAddress: string;
  readonly amount: string;
  readonly amountDisplay: string;
  readonly currency: string;
  readonly chainId: number;
  readonly paymentMethod: PaymentMethod;
  readonly quotePayload: XAgentQuotePayload;
  readonly isoMetadata: IsoMetadata | null;
  readonly expiresAt: string;
}

export interface TransitionInput {
  readonly xagentPaymentId: string;
  readonly toStatus: PaymentStatus;
  readonly eventType: PaymentEventType;
  readonly metadata?: Record<string, unknown>;
  readonly fields?: Partial<
    Pick<
      PaymentRecord,
      | "tx_hash"
      | "block_number"
      | "block_timestamp"
      | "settled_at"
      | "completed_at"
      | "escrow_contract"
      | "payment_id_bytes32"
      | "eip3009_nonce"
      | "deposit_tx_hash"
      | "release_tx_hash"
      | "refund_tx_hash"
      | "release_deadline"
      | "dispute_deadline"
      | "protocol_fee"
      | "dispute_reason"
      // ACP (ERC-8183) fields
      | "acp_contract"
      | "acp_job_id"
      | "acp_deliverable"
      | "acp_submit_tx_hash"
      | "acp_complete_tx_hash"
    >
  >;
}

export class PaymentStateMachine {
  constructor(
    private readonly paymentRepo: PaymentRepository,
    private readonly eventRepo: EventRepository,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const xagentPaymentId = `PAY-${randomUUID()}`;

    const params: CreatePaymentParams = {
      xagent_payment_id: xagentPaymentId,
      group_id: input.groupId,
      quote_hash: input.quoteHash,
      merchant_did: input.merchantDid,
      merchant_order_ref: input.merchantOrderRef,
      payer_wallet: input.payerWallet,
      payment_address: input.paymentAddress,
      amount: input.amount,
      amount_display: input.amountDisplay,
      currency: input.currency,
      chain_id: input.chainId,
      payment_method: input.paymentMethod,
      quote_payload: input.quotePayload,
      iso_metadata: input.isoMetadata,
      expires_at: input.expiresAt,
    };

    const payment = await this.paymentRepo.insert(params);

    const eventParams: CreateEventParams = {
      event_id: `EVT-${randomUUID()}`,
      xagent_payment_id: xagentPaymentId,
      event_type: "PAYMENT_CREATED",
      from_status: null,
      to_status: "CREATED",
      metadata: {},
    };
    await this.eventRepo.append(eventParams);

    return payment;
  }

  async transition(input: TransitionInput): Promise<PaymentRecord> {
    const payment = await this.paymentRepo.findById(input.xagentPaymentId);
    if (!payment) {
      throw new XAgentError("PAYMENT_NOT_FOUND", "Payment not found", {
        xagentPaymentId: input.xagentPaymentId,
      });
    }

    const allowed = VALID_TRANSITIONS.get(payment.status);
    if (!allowed || !allowed.has(input.toStatus)) {
      throw new InvalidTransitionError(payment.status, input.toStatus, {
        xagentPaymentId: input.xagentPaymentId,
      });
    }

    const updated = await this.paymentRepo.updateStatus(
      input.xagentPaymentId,
      input.toStatus,
      input.fields,
    );
    if (!updated) {
      throw new XAgentError("UPDATE_FAILED", "Status update failed", {
        xagentPaymentId: input.xagentPaymentId,
      });
    }

    const eventParams: CreateEventParams = {
      event_id: `EVT-${randomUUID()}`,
      xagent_payment_id: input.xagentPaymentId,
      event_type: input.eventType,
      from_status: payment.status,
      to_status: input.toStatus,
      metadata: input.metadata ?? {},
    };
    await this.eventRepo.append(eventParams);

    return updated;
  }

  async getPayment(xagentPaymentId: string): Promise<PaymentRecord | null> {
    return this.paymentRepo.findById(xagentPaymentId);
  }

  async runTimeoutSweep(): Promise<readonly PaymentRecord[]> {
    const now = new Date().toISOString();
    const expired = await this.paymentRepo.findExpiredAwaiting(now);
    const results: PaymentRecord[] = [];

    for (const payment of expired) {
      if (TERMINAL_STATUSES.has(payment.status)) continue;
      try {
        const updated = await this.transition({
          xagentPaymentId: payment.xagent_payment_id,
          toStatus: "EXPIRED",
          eventType: "PAYMENT_EXPIRED",
          metadata: { reason: "timeout_sweep" },
        });
        results.push(updated);
      } catch {
        // Skip payments that can't transition (race condition)
      }
    }

    return results;
  }
}
