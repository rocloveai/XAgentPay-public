import type { MerchantRepository } from "../../db/interfaces/merchant-repo.js";
import type {
  MerchantRecord,
  AgentHealthStatus,
  RegisterMerchantParams,
} from "../../types.js";

const MARKETPLACE_DEFAULTS: Omit<
  MerchantRecord,
  | "merchant_did"
  | "name"
  | "signer_address"
  | "payment_address"
  | "is_active"
  | "created_at"
  | "updated_at"
> = {
  webhook_url: null,
  webhook_secret: null,
  description: "",
  category: "general",
  skill_md_url: null,
  health_url: null,
  mcp_endpoint: null,
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
};

export class MockMerchantRepository implements MerchantRepository {
  private readonly store = new Map<string, MerchantRecord>();

  clear(): void {
    this.store.clear();
  }

  /** Seed one or more merchants for testing */
  seed(records: MerchantRecord | readonly MerchantRecord[]): void {
    const list = Array.isArray(records) ? records : [records];
    for (const r of list) {
      this.store.set(r.merchant_did, r);
    }
  }

  async findByDid(merchantDid: string): Promise<MerchantRecord | null> {
    const r = this.store.get(merchantDid);
    if (!r || !r.is_active) return null;
    return r;
  }

  async listAll(): Promise<readonly MerchantRecord[]> {
    return [...this.store.values()]
      .filter((r) => r.is_active)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
  }

  async listForMarket(filters?: {
    category?: string;
    status?: AgentHealthStatus;
  }): Promise<readonly MerchantRecord[]> {
    let merchants = [...this.store.values()].filter(
      (m) => m.is_active && m.skill_md_url != null,
    );
    if (filters?.category) {
      merchants = merchants.filter((m) =>
        m.category.startsWith(filters.category!),
      );
    }
    if (filters?.status) {
      merchants = merchants.filter((m) => m.health_status === filters.status);
    }
    return merchants.sort((a, b) => {
      if (a.health_status === "ONLINE" && b.health_status !== "ONLINE")
        return -1;
      if (b.health_status === "ONLINE" && a.health_status !== "ONLINE")
        return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async register(params: RegisterMerchantParams): Promise<MerchantRecord> {
    const now = new Date().toISOString();
    const existing = this.store.get(params.merchant_did);
    const record: MerchantRecord = {
      ...MARKETPLACE_DEFAULTS,
      ...existing,
      merchant_did: params.merchant_did,
      name: params.name,
      description: params.description,
      category: params.category,
      signer_address: params.signer_address,
      payment_address: params.payment_address,
      skill_md_url: params.skill_md_url,
      health_url: params.health_url,
      webhook_url: params.webhook_url ?? existing?.webhook_url ?? null,
      webhook_secret: params.webhook_secret ?? existing?.webhook_secret ?? null,
      mcp_endpoint: params.mcp_endpoint ?? existing?.mcp_endpoint ?? null,
      is_active: true,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.store.set(params.merchant_did, record);
    return record;
  }

  async updateHealth(
    merchantDid: string,
    status: AgentHealthStatus,
    latencyMs: number | null,
    failures: number,
  ): Promise<void> {
    const existing = this.store.get(merchantDid);
    if (!existing) return;
    this.store.set(merchantDid, {
      ...existing,
      health_status: status,
      last_health_check: new Date().toISOString(),
      last_health_latency_ms: latencyMs,
      consecutive_failures: failures,
      updated_at: new Date().toISOString(),
    });
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
    const existing = this.store.get(merchantDid);
    if (!existing) return;
    this.store.set(merchantDid, {
      ...existing,
      ...Object.fromEntries(
        Object.entries(metadata).filter(([, v]) => v !== undefined),
      ),
      updated_at: new Date().toISOString(),
    } as MerchantRecord);
  }

  async deactivate(merchantDid: string): Promise<void> {
    const existing = this.store.get(merchantDid);
    if (!existing) return;
    this.store.set(merchantDid, {
      ...existing,
      is_active: false,
      updated_at: new Date().toISOString(),
    });
  }
}
