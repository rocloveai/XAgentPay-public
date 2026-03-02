import { getPool } from "./pool.js";
import type { MerchantRepository } from "./interfaces/merchant-repo.js";
import type {
  MerchantRecord,
  AgentHealthStatus,
  RegisterMerchantParams,
} from "../types.js";

function parseJsonb<T>(val: unknown, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

function rowToMerchant(row: Record<string, unknown>): MerchantRecord {
  return {
    merchant_did: row.merchant_did as string,
    name: row.name as string,
    signer_address: row.signer_address as string,
    payment_address: row.payment_address as string,
    webhook_url: (row.webhook_url as string) ?? null,
    webhook_secret: (row.webhook_secret as string) ?? null,
    description: (row.description as string) ?? "",
    category: (row.category as string) ?? "general",
    skill_md_url: (row.skill_md_url as string) ?? null,
    health_url: (row.health_url as string) ?? null,
    mcp_endpoint: (row.mcp_endpoint as string) ?? null,
    skill_name: (row.skill_name as string) ?? null,
    skill_version: (row.skill_version as string) ?? null,
    skill_protocol: (row.skill_protocol as string) ?? null,
    skill_tools: parseJsonb(row.skill_tools, []),
    currencies: parseJsonb(row.currencies, ["USDC"]),
    chain_id: row.chain_id != null ? Number(row.chain_id) : null,
    health_status: (row.health_status as AgentHealthStatus) ?? "UNKNOWN",
    last_health_check: row.last_health_check
      ? String(row.last_health_check)
      : null,
    last_health_latency_ms:
      row.last_health_latency_ms != null
        ? Number(row.last_health_latency_ms)
        : null,
    consecutive_failures: Number(row.consecutive_failures ?? 0),
    is_verified: (row.is_verified as boolean) ?? false,
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

  async listForMarket(filters?: {
    category?: string;
    status?: AgentHealthStatus;
  }): Promise<readonly MerchantRecord[]> {
    const sql = getPool();
    const conditions: string[] = [
      "is_active = TRUE",
      "skill_md_url IS NOT NULL",
    ];
    const params: unknown[] = [];

    if (filters?.category) {
      params.push(filters.category);
      conditions.push(`category LIKE $${params.length} || '%'`);
    }
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`health_status = $${params.length}`);
    }

    const where = conditions.join(" AND ");
    const rows = await sql(
      `SELECT * FROM merchant_registry
       WHERE ${where}
       ORDER BY health_status = 'ONLINE' DESC, name ASC`,
      params,
    );
    return rows.map(rowToMerchant);
  }

  async register(params: RegisterMerchantParams): Promise<MerchantRecord> {
    const sql = getPool();
    const rows = await sql(
      `INSERT INTO merchant_registry
         (merchant_did, name, description, category, signer_address, payment_address,
          skill_md_url, health_url, webhook_url, webhook_secret, mcp_endpoint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (merchant_did) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         signer_address = EXCLUDED.signer_address,
         payment_address = EXCLUDED.payment_address,
         skill_md_url = EXCLUDED.skill_md_url,
         health_url = EXCLUDED.health_url,
         webhook_url = COALESCE(EXCLUDED.webhook_url, merchant_registry.webhook_url),
         webhook_secret = COALESCE(EXCLUDED.webhook_secret, merchant_registry.webhook_secret),
         mcp_endpoint = COALESCE(EXCLUDED.mcp_endpoint, merchant_registry.mcp_endpoint),
         is_active = TRUE,
         updated_at = NOW()
       RETURNING *`,
      [
        params.merchant_did,
        params.name,
        params.description,
        params.category,
        params.signer_address,
        params.payment_address,
        params.skill_md_url,
        params.health_url,
        params.webhook_url ?? null,
        params.webhook_secret ?? null,
        params.mcp_endpoint ?? null,
      ],
    );
    return rowToMerchant(rows[0]);
  }

  async updateHealth(
    merchantDid: string,
    status: AgentHealthStatus,
    latencyMs: number | null,
    failures: number,
  ): Promise<void> {
    const sql = getPool();
    await sql(
      `UPDATE merchant_registry
       SET health_status = $2,
           last_health_check = NOW(),
           last_health_latency_ms = $3,
           consecutive_failures = $4,
           updated_at = NOW()
       WHERE merchant_did = $1`,
      [merchantDid, status, latencyMs, failures],
    );
  }

  async updateSkillMetadata(
    merchantDid: string,
    metadata: Partial<
      Pick<
        MerchantRecord,
        | "skill_name"
        | "skill_version"
        | "skill_protocol"
        | "skill_tools"
        | "currencies"
        | "chain_id"
        | "mcp_endpoint"
      >
    >,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [merchantDid];

    const fields: [string, unknown][] = Object.entries(metadata).filter(
      ([, v]) => v !== undefined,
    );

    if (fields.length === 0) return;

    for (const [key, value] of fields) {
      params.push(
        key === "skill_tools" || key === "currencies"
          ? JSON.stringify(value)
          : value,
      );
      sets.push(`${key} = $${params.length}`);
    }

    sets.push("updated_at = NOW()");

    const sql = getPool();
    await sql(
      `UPDATE merchant_registry SET ${sets.join(", ")} WHERE merchant_did = $1`,
      params,
    );
  }

  async deactivate(merchantDid: string): Promise<void> {
    const sql = getPool();
    await sql(
      `UPDATE merchant_registry SET is_active = FALSE, updated_at = NOW() WHERE merchant_did = $1`,
      [merchantDid],
    );
  }
}
