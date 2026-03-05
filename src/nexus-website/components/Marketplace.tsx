import React, { useEffect, useState, useMemo } from "react";

const API_URL =
  import.meta.env.VITE_NEXUS_CORE_URL || "https://api.nexus-mvp.topos.one";

const CHAIN_NAMES: Record<number, string> = {
  196: "XLayer Mainnet",
  20250407: "Nexus Devnet",
  1: "Ethereum",
  137: "Polygon",
};

const CATEGORIES = [
  "all",
  "travel",
  "food",
  "retail",
  "entertainment",
  "finance",
  "services",
] as const;

interface SkillTool {
  readonly name: string;
  readonly role: string;
}

interface MarketAgent {
  readonly agent_id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly skill_md_url: string;
  readonly health_status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";
  readonly last_health_latency_ms: number | null;
  readonly skill_name: string | null;
  readonly skill_version: string | null;
  readonly skill_tools: readonly SkillTool[];
  readonly currencies: readonly string[];
  readonly chain_id: number | null;
  readonly mcp_endpoint: string | null;
  readonly is_verified: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ONLINE: "bg-green-500 shadow-green-500/40",
  DEGRADED: "bg-yellow-500 shadow-yellow-500/40",
  OFFLINE: "bg-red-500 shadow-red-500/40",
  UNKNOWN: "bg-gray-500",
};

const Marketplace: React.FC = () => {
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/market/agents`)
      .then((res) => res.json())
      .then((data) => {
        setAgents(data.agents ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return agents.filter((a) => {
      const matchSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q);
      const matchCat =
        selectedCategory === "all" || a.category.startsWith(selectedCategory);
      return matchSearch && matchCat;
    });
  }, [agents, searchQuery, selectedCategory]);

  const handleCopyMcp = (agent: MarketAgent) => {
    if (!agent.mcp_endpoint) return;
    const config = JSON.stringify(
      {
        mcpServers: {
          [agent.name.toLowerCase().replace(/\s+/g, "-")]: {
            url: agent.mcp_endpoint,
          },
        },
      },
      null,
      2,
    );
    navigator.clipboard.writeText(config);
    setCopiedId(agent.agent_id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <section
      id="marketplace"
      className="py-16 sm:py-20 bg-background-dark/30 border-y border-white/5"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Agent <span className="text-primary">Marketplace</span>
          </h2>
          <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
            Browse and discover verified merchant agents. Add them to your AI
            workflow with one click.
          </p>
          {agents.length > 0 && (
            <span className="text-xs text-gray-500 mt-2 inline-block">
              {agents.length} agents registered
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-8">
          <div className="relative flex-1 max-w-md">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-500 bg-white/5 border border-white/10 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  selectedCategory === cat
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">Loading agents...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <span className="material-icons-round text-5xl mb-3 block">
              search_off
            </span>
            <p className="text-lg">No agents found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        )}

        {/* Grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((agent) => {
              const chainName = agent.chain_id
                ? CHAIN_NAMES[agent.chain_id] || `Chain ${agent.chain_id}`
                : "—";
              const latency =
                agent.last_health_latency_ms != null
                  ? `${agent.last_health_latency_ms}ms`
                  : "—";

              return (
                <div
                  key={agent.agent_id}
                  className="glass-panel rounded-xl p-5 hover:border-white/10 transition-colors"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shadow-sm ${STATUS_COLORS[agent.health_status]}`}
                      />
                      <h3 className="font-semibold text-white text-sm">
                        {agent.name}
                      </h3>
                      {agent.is_verified && (
                        <span
                          className="material-icons-round text-primary text-sm"
                          title="Verified"
                        >
                          verified
                        </span>
                      )}
                    </div>
                    {agent.skill_version && (
                      <span className="text-xs text-gray-500">
                        v{agent.skill_version}
                      </span>
                    )}
                  </div>

                  {/* Category */}
                  <div className="mb-3">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary/80 border border-primary/15">
                      {agent.category}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-gray-400 mb-3 line-clamp-2">
                    {agent.description}
                  </p>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {agent.currencies.map((c) => (
                      <span
                        key={c}
                        className="inline-block px-2 py-0.5 rounded-md text-[11px] bg-accent-cyan/10 text-accent-cyan/80 border border-accent-cyan/15"
                      >
                        {c}
                      </span>
                    ))}
                    {agent.skill_tools.map((t) => (
                      <span
                        key={t.name}
                        className="inline-block px-2 py-0.5 rounded-md text-[11px] bg-primary/10 text-primary/80 border border-primary/15"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>

                  {/* Status row */}
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>Latency: {latency}</span>
                    <span>{chainName}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {agent.mcp_endpoint && (
                      <button
                        onClick={() => handleCopyMcp(agent)}
                        className="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                      >
                        {copiedId === agent.agent_id
                          ? "Copied!"
                          : "Copy MCP Config"}
                      </button>
                    )}
                    {agent.skill_md_url && (
                      <a
                        href={agent.skill_md_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-md bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        View Skill
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default Marketplace;
