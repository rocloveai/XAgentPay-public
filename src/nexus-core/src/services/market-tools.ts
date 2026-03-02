/**
 * Market skill MCP tool handlers.
 *
 * Pure functions that implement discover_agents and get_agent_skill logic,
 * decoupled from the MCP SDK for testability.
 */
import type { MerchantRepository } from "../db/interfaces/merchant-repo.js";
import type { StarRepository } from "../db/interfaces/star-repo.js";
import type { MerchantRecord } from "../types.js";

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// discover_agents
// ---------------------------------------------------------------------------

export interface DiscoverAgentsInput {
  readonly query?: string;
  readonly category?: string;
  readonly limit?: number;
}

export async function handleDiscoverAgents(
  merchantRepo: MerchantRepository,
  starRepo: StarRepository,
  input: DiscoverAgentsInput,
): Promise<McpToolResult> {
  try {
    const merchants = await merchantRepo.listForMarket({
      category: input.category,
    });

    const dids = merchants.map((m) => m.merchant_did);
    const starCounts = await starRepo.getStarCounts(dids);

    // Text filter on name, description, skill_name
    let filtered: readonly MerchantRecord[] = merchants;
    if (input.query) {
      const q = input.query.toLowerCase();
      filtered = merchants.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          (m.skill_name?.toLowerCase().includes(q) ?? false),
      );
    }

    // Sort: star_count DESC → ONLINE first → name ASC
    const sorted = [...filtered].sort((a, b) => {
      const starsA = starCounts.get(a.merchant_did) ?? 0;
      const starsB = starCounts.get(b.merchant_did) ?? 0;
      if (starsB !== starsA) return starsB - starsA;

      const onlineA = a.health_status === "ONLINE" ? 0 : 1;
      const onlineB = b.health_status === "ONLINE" ? 0 : 1;
      if (onlineA !== onlineB) return onlineA - onlineB;

      return a.name.localeCompare(b.name);
    });

    // Limit
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const results = sorted.slice(0, limit);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No agents found matching your criteria.",
          },
        ],
      };
    }

    const lines = results.map((m) => {
      const stars = starCounts.get(m.merchant_did) ?? 0;
      const tools = (m.skill_tools ?? []).map((t) => t.name).join(", ");
      const currencies = (m.currencies ?? []).join(", ");
      return [
        `**${m.name}** (${m.merchant_did})`,
        `  Category: ${m.category} | Stars: ${stars} | Status: ${m.health_status}`,
        m.description ? `  ${m.description}` : null,
        tools ? `  Tools: ${tools}` : null,
        currencies ? `  Currencies: ${currencies}` : null,
        m.mcp_endpoint ? `  MCP: ${m.mcp_endpoint}` : null,
        m.skill_user_url
          ? `  Skill (HTTP): ${m.skill_user_url}`
          : m.skill_md_url
            ? `  Skill: ${m.skill_md_url}`
            : null,
      ]
        .filter(Boolean)
        .join("\n");
    });

    return {
      content: [
        {
          type: "text",
          text:
            `Found ${results.length} agent(s):\n\n${lines.join("\n\n")}\n\n` +
            `Tip: You can connect directly to an agent's MCP endpoint above without calling get_agent_skill first.`,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      content: [{ type: "text", text: `Error discovering agents: ${message}` }],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// get_agent_skill
// ---------------------------------------------------------------------------

export interface GetAgentSkillInput {
  readonly merchant_did: string;
}

export async function handleGetAgentSkill(
  merchantRepo: MerchantRepository,
  input: GetAgentSkillInput,
): Promise<McpToolResult> {
  try {
    const merchant = await merchantRepo.findByDid(input.merchant_did);
    if (!merchant) {
      return {
        content: [
          {
            type: "text",
            text: `Agent not found: ${input.merchant_did}`,
          },
        ],
        isError: true,
      };
    }

    if (!merchant.skill_md_url) {
      return {
        content: [
          {
            type: "text",
            text: `Agent ${input.merchant_did} has no skill.md URL configured.`,
          },
        ],
        isError: true,
      };
    }

    const response = await fetch(merchant.skill_md_url, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to fetch skill.md from ${merchant.skill_md_url}: HTTP ${response.status}`,
          },
        ],
        isError: true,
      };
    }

    const skillContent = await response.text();

    const header = [
      `# ${merchant.name}`,
      `Category: ${merchant.category} | Status: ${merchant.health_status}`,
      `Source: ${merchant.skill_md_url}`,
      "",
      "---",
      "",
    ].join("\n");

    return {
      content: [{ type: "text", text: header + skillContent }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: `Error fetching agent skill: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
