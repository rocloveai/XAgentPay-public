import type { PaymentRepository } from "../../db/interfaces/payment-repo.js";
import type {
  PaymentRecord,
  PaymentStatus,
  CreatePaymentParams,
} from "../../types.js";

export class MockPaymentRepository implements PaymentRepository {
  private readonly store = new Map<string, PaymentRecord>();

  clear(): void {
    this.store.clear();
  }

  async insert(params: CreatePaymentParams): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    const record: PaymentRecord = {
      xagent_payment_id: params.xagent_payment_id,
      group_id: params.group_id,
      quote_hash: params.quote_hash,
      merchant_did: params.merchant_did,
      merchant_order_ref: params.merchant_order_ref,
      payer_wallet: params.payer_wallet,
      payment_address: params.payment_address,
      amount: params.amount,
      amount_display: params.amount_display,
      currency: params.currency,
      chain_id: params.chain_id,
      status: "CREATED",
      payment_method: params.payment_method,
      tx_hash: null,
      block_number: null,
      block_timestamp: null,
      quote_payload: params.quote_payload,
      iso_metadata: params.iso_metadata,
      expires_at: params.expires_at,
      settled_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
      escrow_contract: null,
      payment_id_bytes32: null,
      eip3009_nonce: null,
      deposit_tx_hash: null,
      release_tx_hash: null,
      refund_tx_hash: null,
      release_deadline: null,
      dispute_deadline: null,
      protocol_fee: null,
      dispute_reason: null,
    };
    this.store.set(params.xagent_payment_id, record);
    return record;
  }

  async findById(xagentPaymentId: string): Promise<PaymentRecord | null> {
    return this.store.get(xagentPaymentId) ?? null;
  }

  async findByOrderRef(
    merchantOrderRef: string,
  ): Promise<PaymentRecord | null> {
    for (const r of this.store.values()) {
      if (r.merchant_order_ref === merchantOrderRef) return r;
    }
    return null;
  }

  async findByQuoteHash(quoteHash: string): Promise<PaymentRecord | null> {
    for (const r of this.store.values()) {
      if (
        r.quote_hash === quoteHash &&
        r.status !== "EXPIRED" &&
        r.status !== "TX_FAILED"
      ) {
        return r;
      }
    }
    return null;
  }

  async findByGroupId(groupId: string): Promise<readonly PaymentRecord[]> {
    const results: PaymentRecord[] = [];
    for (const r of this.store.values()) {
      if (r.group_id === groupId) {
        results.push(r);
      }
    }
    return results;
  }

  async updateStatus(
    xagentPaymentId: string,
    newStatus: PaymentStatus,
    fields?: Partial<
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
      >
    >,
  ): Promise<PaymentRecord | null> {
    const existing = this.store.get(xagentPaymentId);
    if (!existing) return null;

    const updated: PaymentRecord = {
      ...existing,
      ...fields,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    this.store.set(xagentPaymentId, updated);
    return updated;
  }

  async findExpiredAwaiting(now: string): Promise<readonly PaymentRecord[]> {
    const cutoff = new Date(now).getTime();
    const results: PaymentRecord[] = [];
    for (const r of this.store.values()) {
      if (
        (r.status === "CREATED" || r.status === "AWAITING_TX") &&
        new Date(r.expires_at).getTime() <= cutoff
      ) {
        results.push(r);
      }
    }
    return results;
  }

  async findExpiredEscrowed(now: string): Promise<readonly PaymentRecord[]> {
    const cutoff = new Date(now).getTime();
    const results: PaymentRecord[] = [];
    for (const r of this.store.values()) {
      if (
        r.status === "ESCROWED" &&
        r.release_deadline != null &&
        new Date(r.release_deadline).getTime() <= cutoff
      ) {
        results.push(r);
      }
    }
    return results;
  }

  async findByPaymentIdBytes32(bytes32: string): Promise<PaymentRecord | null> {
    for (const r of this.store.values()) {
      if (r.payment_id_bytes32 === bytes32) return r;
    }
    return null;
  }

  async findDisputeOpenPastDeadline(
    now: string,
  ): Promise<readonly PaymentRecord[]> {
    const cutoff = new Date(now).getTime();
    const results: PaymentRecord[] = [];
    for (const r of this.store.values()) {
      if (
        r.status === "DISPUTE_OPEN" &&
        r.dispute_deadline != null &&
        new Date(r.dispute_deadline).getTime() <= cutoff
      ) {
        results.push(r);
      }
    }
    return results;
  }

  async findAll(params?: {
    status?: PaymentStatus;
    limit?: number;
    offset?: number;
  }): Promise<readonly PaymentRecord[]> {
    let results = [...this.store.values()];

    if (params?.status) {
      results = results.filter((r) => r.status === params.status);
    }

    // Sort by created_at DESC
    results.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  async findByMerchant(params: {
    merchantDid: string;
    since?: string;
    status?: PaymentStatus;
    limit?: number;
  }): Promise<readonly PaymentRecord[]> {
    let results = [...this.store.values()].filter(
      (r) => r.merchant_did === params.merchantDid,
    );

    if (params.since) {
      const cutoff = new Date(params.since).getTime();
      results = results.filter(
        (r) => new Date(r.created_at).getTime() >= cutoff,
      );
    }

    if (params.status) {
      results = results.filter((r) => r.status === params.status);
    }

    results.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return results.slice(0, params.limit ?? 200);
  }

  async countByStatus(): Promise<ReadonlyMap<PaymentStatus, number>> {
    const counts = new Map<PaymentStatus, number>();
    for (const r of this.store.values()) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    return counts;
  }

  async sumTotalAmount(): Promise<string> {
    let total = 0n;
    for (const r of this.store.values()) {
      total += BigInt(r.amount);
    }
    return total.toString();
  }

  async hasNonTerminalPayments(): Promise<boolean> {
    const terminal = new Set([
      "COMPLETED",
      "EXPIRED",
      "TX_FAILED",
      "RISK_REJECTED",
      "REFUNDED",
      "DISPUTE_RESOLVED",
    ]);
    for (const r of this.store.values()) {
      if (!terminal.has(r.status)) return true;
    }
    return false;
  }
}
