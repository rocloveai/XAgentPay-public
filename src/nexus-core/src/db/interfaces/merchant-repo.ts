import type {
  MerchantRecord,
  AgentHealthStatus,
  RegisterMerchantParams,
} from "../../types.js";

export interface MerchantRepository {
  /** Find merchant by DID. Returns null if not found or inactive. */
  findByDid(merchantDid: string): Promise<MerchantRecord | null>;

  /** List all active merchants. */
  listAll(): Promise<readonly MerchantRecord[]>;

  /** List merchants that have marketplace presence (skill_md_url set). */
  listForMarket(filters?: {
    category?: string;
    status?: AgentHealthStatus;
  }): Promise<readonly MerchantRecord[]>;

  /** Register a new merchant (payment + marketplace). */
  register(params: RegisterMerchantParams): Promise<MerchantRecord>;

  /** Update health check results. */
  updateHealth(
    merchantDid: string,
    status: AgentHealthStatus,
    latencyMs: number | null,
    failures: number,
  ): Promise<void>;

  /** Update parsed skill.md metadata fields. */
  updateSkillMetadata(
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
  ): Promise<void>;

  /** Soft-deactivate a merchant. */
  deactivate(merchantDid: string): Promise<void>;
}
