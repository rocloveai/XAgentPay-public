import { getPool } from "./pool.js";
import type { MerchantRepository } from "./interfaces/merchant-repo.js";
import type { MerchantRecord } from "../types.js";

function rowToMerchant(row: Record<string, unknown>): MerchantRecord {
  return {
    merchant_did: row.merchant_did as string,
    name: row.name as string,
    signer_address: row.signer_address as string,
    payment_address: row.payment_address as string,
    webhook_url: (row.webhook_url as string) ?? null,
    webhook_secret: (row.webhook_secret as string) ?? null,
    is_active: row.is_active as boolean,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class NeonMerchantRepository implements MerchantRepository {
  async findByDid(merchantDid: string): Promise<MerchantRecord | null> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM merchant_registry
       WHERE merchant_did = $1 AND is_active = TRUE`,
      [merchantDid],
    );
    return rows.length > 0 ? rowToMerchant(rows[0]) : null;
  }

  async listAll(): Promise<readonly MerchantRecord[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM merchant_registry
       WHERE is_active = TRUE
       ORDER BY created_at ASC`,
    );
    return rows.map(rowToMerchant);
  }
}
