import { getPool } from "./pool.js";
import type { MarketRepository } from "./interfaces/market-repo.js";
import type {
  MarketAgentRecord,
  AgentHealthStatus,
  RegisterAgentParams,
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

function rowToAgent(row: Record<string, unknown>): MarketAgentRecord {
  return {
    agent_id: row.agent_id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as string,
    skill_md_url: row.skill_md_url as string,
    health_url: row.health_url as string,
    mcp_endpoint: (row.mcp_endpoint as string) ?? null,
    merchant_did: (row.merchant_did as string) ?? null,
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
    is_verified: row.is_verified as boolean,
    is_active: row.is_active as boolean,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class NeonMarketRepository implements MarketRepository {
  async findById(agentId: string): Promise<MarketAgentRecord | null> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM market_agents WHERE agent_id = $1 AND is_active = TRUE`,
      [agentId],
    );
    return rows.length > 0 ? rowToAgent(rows[0]) : null;
  }

  async listAll(
    filters?: { category?: string; status?: AgentHealthStatus },
  ): Promise<readonly MarketAgentRecord[]> {
    const sql = getPool();
    const conditions: string[] = ["is_active = TRUE"];
    const params: unknown[] = [];

    if (filters?.category) {
      params.push(filters.category);
      conditions.push(`category = $${params.length}`);
    }
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`health_status = $${params.length}`);
    }

    const where = conditions.join(" AND ");
    const rows = await sql(
      `SELECT * FROM market_agents
       WHERE ${where}
       ORDER BY health_status = 'ONLINE' DESC, name ASC`,
      params,
    );
    return rows.map(rowToAgent);
  }

  async insert(
    params: RegisterAgentParams & { agent_id: string },
  ): Promise<MarketAgentRecord> {
    const sql = getPool();
    const rows = await sql(
      `INSERT INTO market_agents
         (agent_id, name, description, category, skill_md_url, health_url, mcp_endpoint, merchant_did)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        params.agent_id,
        params.name,
        params.description,
        params.category,
        params.skill_md_url,
        params.health_url,
        params.mcp_endpoint ?? null,
        params.merchant_did ?? null,
      ],
    );
    return rowToAgent(rows[0]);
  }

  async updateHealth(
    agentId: string,
    status: AgentHealthStatus,
    latencyMs: number | null,
    failures: number,
  ): Promise<void> {
    const sql = getPool();
    await sql(
      `UPDATE market_agents
       SET health_status = $2,
           last_health_check = NOW(),
           last_health_latency_ms = $3,
           consecutive_failures = $4,
           updated_at = NOW()
       WHERE agent_id = $1`,
      [agentId, status, latencyMs, failures],
    );
  }

  async updateSkillMetadata(
    agentId: string,
    metadata: Partial<
      Pick<
        MarketAgentRecord,
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
    const params: unknown[] = [agentId];

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
      `UPDATE market_agents SET ${sets.join(", ")} WHERE agent_id = $1`,
      params,
    );
  }

  async deactivate(agentId: string): Promise<void> {
    const sql = getPool();
    await sql(
      `UPDATE market_agents SET is_active = FALSE, updated_at = NOW() WHERE agent_id = $1`,
      [agentId],
    );
  }
}
