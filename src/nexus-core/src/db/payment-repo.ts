import { getPool } from "./pool.js";
import type { PaymentRepository } from "./interfaces/payment-repo.js";
import type {
  PaymentRecord,
  PaymentStatus,
  PaymentMethod,
  NexusQuotePayload,
  IsoMetadata,
  CreatePaymentParams,
} from "../types.js";

function rowToPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    nexus_payment_id: row.nexus_payment_id as string,
    group_id: (row.group_id as string) ?? null,
    quote_hash: row.quote_hash as string,
    merchant_did: row.merchant_did as string,
    merchant_order_ref: row.merchant_order_ref as string,
    payer_wallet: (row.payer_wallet as string) ?? null,
    payment_address: row.payment_address as string,
    amount: row.amount as string,
    amount_display: row.amount_display as string,
    currency: row.currency as string,
    chain_id: row.chain_id as number,
    status: row.status as PaymentStatus,
    payment_method: row.payment_method as PaymentMethod,
    tx_hash: (row.tx_hash as string) ?? null,
    block_number: row.block_number != null ? Number(row.block_number) : null,
    block_timestamp:
      row.block_timestamp != null ? String(row.block_timestamp) : null,
    quote_payload: row.quote_payload as unknown as NexusQuotePayload,
    iso_metadata: (row.iso_metadata as unknown as IsoMetadata) ?? null,
    expires_at: String(row.expires_at),
    settled_at: row.settled_at != null ? String(row.settled_at) : null,
    completed_at: row.completed_at != null ? String(row.completed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    escrow_contract: (row.escrow_contract as string) ?? null,
    payment_id_bytes32: (row.payment_id_bytes32 as string) ?? null,
    eip3009_nonce: (row.eip3009_nonce as string) ?? null,
    deposit_tx_hash: (row.deposit_tx_hash as string) ?? null,
    release_tx_hash: (row.release_tx_hash as string) ?? null,
    refund_tx_hash: (row.refund_tx_hash as string) ?? null,
    release_deadline:
      row.release_deadline != null ? String(row.release_deadline) : null,
    dispute_deadline:
      row.dispute_deadline != null ? String(row.dispute_deadline) : null,
    protocol_fee: (row.protocol_fee as string) ?? null,
    dispute_reason: (row.dispute_reason as string) ?? null,
  };
}

const ALLOWED_UPDATE_COLUMNS = new Set([
  "tx_hash",
  "block_number",
  "block_timestamp",
  "settled_at",
  "completed_at",
  "escrow_contract",
  "payment_id_bytes32",
  "eip3009_nonce",
  "deposit_tx_hash",
  "release_tx_hash",
  "refund_tx_hash",
  "release_deadline",
  "dispute_deadline",
  "protocol_fee",
  "dispute_reason",
]);

export class NeonPaymentRepository implements PaymentRepository {
  async insert(params: CreatePaymentParams): Promise<PaymentRecord> {
    const sql = getPool();
    const now = new Date().toISOString();
    const rows = await sql(
      `INSERT INTO payments (
        nexus_payment_id, group_id, quote_hash, merchant_did, merchant_order_ref,
        payer_wallet, payment_address, amount, amount_display,
        currency, chain_id, status, payment_method,
        quote_payload, iso_metadata, expires_at,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        'CREATED', $12, $13::jsonb, $14::jsonb, $15::timestamptz,
        $16::timestamptz, $17::timestamptz
      ) RETURNING *`,
      [
        params.nexus_payment_id,
        params.group_id,
        params.quote_hash,
        params.merchant_did,
        params.merchant_order_ref,
        params.payer_wallet,
        params.payment_address,
        params.amount,
        params.amount_display,
        params.currency,
        params.chain_id,
        params.payment_method,
        JSON.stringify(params.quote_payload),
        params.iso_metadata ? JSON.stringify(params.iso_metadata) : null,
        params.expires_at,
        now,
        now,
      ],
    );
    return rowToPayment(rows[0]);
  }

  async findById(nexusPaymentId: string): Promise<PaymentRecord | null> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments WHERE nexus_payment_id = $1`,
      [nexusPaymentId],
    );
    return rows.length > 0 ? rowToPayment(rows[0]) : null;
  }

  async findByOrderRef(
    merchantOrderRef: string,
  ): Promise<PaymentRecord | null> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments WHERE merchant_order_ref = $1
       ORDER BY created_at DESC LIMIT 1`,
      [merchantOrderRef],
    );
    return rows.length > 0 ? rowToPayment(rows[0]) : null;
  }

  async findByQuoteHash(quoteHash: string): Promise<PaymentRecord | null> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments WHERE quote_hash = $1
       AND status NOT IN ('EXPIRED', 'TX_FAILED')
       LIMIT 1`,
      [quoteHash],
    );
    return rows.length > 0 ? rowToPayment(rows[0]) : null;
  }

  async findByGroupId(groupId: string): Promise<readonly PaymentRecord[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments WHERE group_id = $1
       ORDER BY created_at ASC`,
      [groupId],
    );
    return rows.map(rowToPayment);
  }

  async updateStatus(
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
  ): Promise<PaymentRecord | null> {
    const sql = getPool();
    const now = new Date().toISOString();

    // Build SET clause dynamically for optional fields
    const setClauses = ["status = $1", "updated_at = $2::timestamptz"];
    const values: unknown[] = [newStatus, now];
    let paramIdx = 3;

    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          if (!ALLOWED_UPDATE_COLUMNS.has(key)) continue;
          const suffix =
            key.endsWith("_at") ||
            key === "block_timestamp" ||
            key === "release_deadline" ||
            key === "dispute_deadline"
              ? "::timestamptz"
              : "";
          setClauses.push(`${key} = $${paramIdx}${suffix}`);
          values.push(value);
          paramIdx++;
        }
      }
    }

    values.push(nexusPaymentId);

    const rows = await sql(
      `UPDATE payments SET ${setClauses.join(", ")}
       WHERE nexus_payment_id = $${paramIdx}
       RETURNING *`,
      values,
    );
    return rows.length > 0 ? rowToPayment(rows[0]) : null;
  }

  async findExpiredAwaiting(now: string): Promise<readonly PaymentRecord[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments
       WHERE status IN ('CREATED', 'AWAITING_TX')
         AND expires_at <= $1::timestamptz`,
      [now],
    );
    return rows.map(rowToPayment);
  }

  async findExpiredEscrowed(now: string): Promise<readonly PaymentRecord[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments
       WHERE status = 'ESCROWED'
         AND release_deadline IS NOT NULL
         AND release_deadline <= $1::timestamptz`,
      [now],
    );
    return rows.map(rowToPayment);
  }

  async findByPaymentIdBytes32(bytes32: string): Promise<PaymentRecord | null> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments WHERE payment_id_bytes32 = $1 LIMIT 1`,
      [bytes32],
    );
    return rows.length > 0 ? rowToPayment(rows[0]) : null;
  }

  async findDisputeOpenPastDeadline(
    now: string,
  ): Promise<readonly PaymentRecord[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payments
       WHERE status = 'DISPUTE_OPEN'
         AND dispute_deadline IS NOT NULL
         AND dispute_deadline <= $1::timestamptz`,
      [now],
    );
    return rows.map(rowToPayment);
  }

  async findAll(params?: {
    status?: PaymentStatus;
    limit?: number;
    offset?: number;
  }): Promise<readonly PaymentRecord[]> {
    const sql = getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (params?.status) {
      conditions.push(`status = $${paramIdx}`);
      values.push(params.status);
      paramIdx++;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    values.push(limit, offset);

    const rows = await sql(
      `SELECT * FROM payments ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      values,
    );
    return rows.map(rowToPayment);
  }

  async countByStatus(): Promise<ReadonlyMap<PaymentStatus, number>> {
    const sql = getPool();
    const rows = await sql(
      `SELECT status, COUNT(*)::int AS count FROM payments GROUP BY status`,
    );
    const result = new Map<PaymentStatus, number>();
    for (const row of rows) {
      result.set(row.status as PaymentStatus, row.count as number);
    }
    return result;
  }

  async sumTotalAmount(): Promise<string> {
    const sql = getPool();
    const rows = await sql(
      `SELECT COALESCE(SUM(amount::numeric), 0)::text AS total FROM payments`,
    );
    return rows[0].total as string;
  }
}
