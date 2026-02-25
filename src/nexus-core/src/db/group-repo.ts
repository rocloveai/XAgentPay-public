import { getPool } from "./pool.js";
import type { GroupRepository } from "./interfaces/group-repo.js";
import type {
  PaymentGroupRecord,
  PaymentGroupStatus,
  CreateGroupParams,
} from "../types.js";

function rowToGroup(row: Record<string, unknown>): PaymentGroupRecord {
  return {
    group_id: row.group_id as string,
    payer_wallet: row.payer_wallet as string,
    total_amount: row.total_amount as string,
    total_amount_display: row.total_amount_display as string,
    currency: row.currency as string,
    chain_id: row.chain_id as number,
    status: row.status as PaymentGroupStatus,
    payment_count: Number(row.payment_count),
    tx_hash: (row.tx_hash as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class NeonGroupRepository implements GroupRepository {
  async insert(params: CreateGroupParams): Promise<PaymentGroupRecord> {
    const sql = getPool();
    const now = new Date().toISOString();
    const rows = await sql(
      `INSERT INTO payment_groups (
        group_id, payer_wallet, total_amount, total_amount_display,
        currency, chain_id, status, payment_count,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 'GROUP_CREATED', $7,
        $8::timestamptz, $9::timestamptz
      ) RETURNING *`,
      [
        params.group_id,
        params.payer_wallet,
        params.total_amount,
        params.total_amount_display,
        params.currency,
        params.chain_id,
        params.payment_count,
        now,
        now,
      ],
    );
    return rowToGroup(rows[0]);
  }

  async findById(groupId: string): Promise<PaymentGroupRecord | null> {
    const sql = getPool();
    const rows = await sql(`SELECT * FROM payment_groups WHERE group_id = $1`, [
      groupId,
    ]);
    return rows.length > 0 ? rowToGroup(rows[0]) : null;
  }

  async updateStatus(
    groupId: string,
    newStatus: PaymentGroupStatus,
    fields?: Partial<Pick<PaymentGroupRecord, "tx_hash">>,
  ): Promise<PaymentGroupRecord | null> {
    const sql = getPool();
    const now = new Date().toISOString();

    const setClauses = ["status = $1", "updated_at = $2::timestamptz"];
    const values: unknown[] = [newStatus, now];
    let paramIdx = 3;

    if (fields?.tx_hash !== undefined) {
      setClauses.push(`tx_hash = $${paramIdx}`);
      values.push(fields.tx_hash);
      paramIdx++;
    }

    values.push(groupId);

    const rows = await sql(
      `UPDATE payment_groups SET ${setClauses.join(", ")}
       WHERE group_id = $${paramIdx}
       RETURNING *`,
      values,
    );
    return rows.length > 0 ? rowToGroup(rows[0]) : null;
  }

  async findByPayer(
    payerWallet: string,
  ): Promise<readonly PaymentGroupRecord[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payment_groups
       WHERE payer_wallet = $1
       ORDER BY created_at DESC`,
      [payerWallet],
    );
    return rows.map(rowToGroup);
  }

  async updateInstruction(
    groupId: string,
    instruction: Record<string, unknown>,
  ): Promise<void> {
    const sql = getPool();
    await sql(
      `UPDATE payment_groups
       SET instruction = $2, updated_at = NOW()
       WHERE group_id = $1`,
      [groupId, JSON.stringify(instruction)],
    );
  }

  async findInstruction(
    groupId: string,
  ): Promise<Record<string, unknown> | null> {
    const sql = getPool();
    const rows = await sql(
      `SELECT instruction FROM payment_groups WHERE group_id = $1`,
      [groupId],
    );
    if (rows.length === 0) return null;
    const raw = rows[0].instruction;
    if (!raw) return null;
    return typeof raw === "string"
      ? JSON.parse(raw)
      : (raw as Record<string, unknown>);
  }
}
