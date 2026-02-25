import type {
  PaymentRecord,
  PaymentStatus,
  CreatePaymentParams,
} from "../../types.js";

export interface PaymentRepository {
  /** Insert a new payment record. Returns the full record. */
  insert(params: CreatePaymentParams): Promise<PaymentRecord>;

  /** Find by nexus_payment_id. Returns null if not found. */
  findById(nexusPaymentId: string): Promise<PaymentRecord | null>;

  /** Find by merchant_order_ref. Returns null if not found. */
  findByOrderRef(merchantOrderRef: string): Promise<PaymentRecord | null>;

  /** Find by quote_hash (only active payments). Returns null if not found. */
  findByQuoteHash(quoteHash: string): Promise<PaymentRecord | null>;

  /** Find all payments belonging to a group. */
  findByGroupId(groupId: string): Promise<readonly PaymentRecord[]>;

  /**
   * Transition payment status atomically.
   * Returns new record on success, null if payment not found.
   */
  updateStatus(
    nexusPaymentId: string,
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
  ): Promise<PaymentRecord | null>;

  /** Find payments in AWAITING_TX that have expired. */
  findExpiredAwaiting(now: string): Promise<readonly PaymentRecord[]>;

  /** Find ESCROWED payments past their release_deadline. */
  findExpiredEscrowed(now: string): Promise<readonly PaymentRecord[]>;

  /** Find by on-chain payment_id_bytes32. */
  findByPaymentIdBytes32(bytes32: string): Promise<PaymentRecord | null>;

  /** Find DISPUTE_OPEN payments past their arbitration deadline. */
  findDisputeOpenPastDeadline(now: string): Promise<readonly PaymentRecord[]>;

  /** List payments with optional status filter, ordered by created_at DESC. */
  findAll(params?: {
    status?: PaymentStatus;
    limit?: number;
    offset?: number;
  }): Promise<readonly PaymentRecord[]>;

  /** Count payments grouped by status. */
  countByStatus(): Promise<ReadonlyMap<PaymentStatus, number>>;
}
