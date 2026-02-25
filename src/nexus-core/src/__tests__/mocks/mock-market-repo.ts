import type { MarketRepository } from "../../db/interfaces/market-repo.js";
import type {
  MarketAgentRecord,
  AgentHealthStatus,
  RegisterAgentParams,
} from "../../types.js";

const DEFAULT_RECORD: Omit<MarketAgentRecord, "agent_id" | "name" | "description" | "category" | "skill_md_url" | "health_url"> = {
  mcp_endpoint: null,
  merchant_did: null,
  skill_name: null,
  skill_version: null,
  skill_protocol: null,
  skill_tools: [],
  currencies: ["USDC"],
  chain_id: null,
  health_status: "UNKNOWN",
  last_health_check: null,
  last_health_latency_ms: null,
  consecutive_failures: 0,
  is_verified: false,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export class MockMarketRepository implements MarketRepository {
  private readonly store = new Map<string, MarketAgentRecord>();

  clear(): void {
    this.store.clear();
  }

  seed(records: MarketAgentRecord | readonly MarketAgentRecord[]): void {
    const list = Array.isArray(records) ? records : [records];
    for (const r of list) {
      this.store.set(r.agent_id, r);
    }
  }

  async findById(agentId: string): Promise<MarketAgentRecord | null> {
    const r = this.store.get(agentId);
    if (!r || !r.is_active) return null;
    return r;
  }

  async listAll(
    filters?: { category?: string; status?: AgentHealthStatus },
  ): Promise<readonly MarketAgentRecord[]> {
    let agents = [...this.store.values()].filter((a) => a.is_active);
    if (filters?.category) {
      agents = agents.filter((a) => a.category.startsWith(filters.category!));
    }
    if (filters?.status) {
      agents = agents.filter((a) => a.health_status === filters.status);
    }
    return agents.sort((a, b) => {
      if (a.health_status === "ONLINE" && b.health_status !== "ONLINE") return -1;
      if (b.health_status === "ONLINE" && a.health_status !== "ONLINE") return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async insert(
    params: RegisterAgentParams & { agent_id: string },
  ): Promise<MarketAgentRecord> {
    const now = new Date().toISOString();
    const record: MarketAgentRecord = {
      ...DEFAULT_RECORD,
      agent_id: params.agent_id,
      name: params.name,
      description: params.description,
      category: params.category,
      skill_md_url: params.skill_md_url,
      health_url: params.health_url,
      mcp_endpoint: params.mcp_endpoint ?? null,
      merchant_did: params.merchant_did ?? null,
      created_at: now,
      updated_at: now,
    };
    this.store.set(params.agent_id, record);
    return record;
  }

  async updateHealth(
    agentId: string,
    status: AgentHealthStatus,
    latencyMs: number | null,
    failures: number,
  ): Promise<void> {
    const existing = this.store.get(agentId);
    if (!existing) return;
    this.store.set(agentId, {
      ...existing,
      health_status: status,
      last_health_check: new Date().toISOString(),
      last_health_latency_ms: latencyMs,
      consecutive_failures: failures,
      updated_at: new Date().toISOString(),
    });
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
    const existing = this.store.get(agentId);
    if (!existing) return;
    this.store.set(agentId, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(metadata).filter(([, v]) => v !== undefined),
      ),
      updated_at: new Date().toISOString(),
    } as MarketAgentRecord);
  }

  async deactivate(agentId: string): Promise<void> {
    const existing = this.store.get(agentId);
    if (!existing) return;
    this.store.set(agentId, {
      ...existing,
      is_active: false,
      updated_at: new Date().toISOString(),
    });
  }
}
