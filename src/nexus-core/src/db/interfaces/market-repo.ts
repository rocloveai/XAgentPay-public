import type {
  MarketAgentRecord,
  AgentHealthStatus,
  RegisterAgentParams,
} from "../../types.js";

export interface MarketRepository {
  /** Find agent by ID. Returns null if not found or inactive. */
  findById(agentId: string): Promise<MarketAgentRecord | null>;

  /** List all active agents with optional filters. */
  listAll(filters?: {
    category?: string;
    status?: AgentHealthStatus;
  }): Promise<readonly MarketAgentRecord[]>;

  /** Insert a new agent. */
  insert(
    params: RegisterAgentParams & { agent_id: string },
  ): Promise<MarketAgentRecord>;

  /** Update health check results. */
  updateHealth(
    agentId: string,
    status: AgentHealthStatus,
    latencyMs: number | null,
    failures: number,
  ): Promise<void>;

  /** Update parsed skill.md metadata fields. */
  updateSkillMetadata(
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
  ): Promise<void>;

  /** Soft-deactivate an agent. */
  deactivate(agentId: string): Promise<void>;
}
