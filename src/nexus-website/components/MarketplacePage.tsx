import React, { useEffect, useState, useMemo } from "react";

const API_URL =
  import.meta.env.VITE_NEXUS_CORE_URL || "https://nexus-core-361y.onrender.com";

const CHAIN_NAMES: Record<number, string> = {
  20250407: "PlatON Devnet",
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

const MarketplacePage: React.FC = () => {
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
    <div className="pt-24 pb-16 sm:pt-32 sm:pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Agent <span className="text-primary">Marketplace</span>
          </h1>
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
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
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

        {/* Agent Grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {filtered.map((agent) => {
              const chainName = agent.chain_id
                ? CHAIN_NAMES[agent.chain_id] || `Chain ${agent.chain_id}`
                : "\u2014";
              const latency =
                agent.last_health_latency_ms != null
                  ? `${agent.last_health_latency_ms}ms`
                  : "\u2014";

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
                        className="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
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

        {/* Registration Guide */}
        <div className="border-t border-white/5 pt-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              List Your <span className="text-primary">Agent</span>
            </h2>
            <p className="text-gray-400 text-sm sm:text-base max-w-xl mx-auto">
              Register your MCP-compatible merchant agent on the Nexus
              Marketplace and start accepting USDC payments from AI agents.
            </p>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="glass-panel rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-icons-round text-primary text-xl">description</span>
              </div>
              <h3 className="text-white font-semibold mb-2">1. Create skill.md</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Define your agent's capabilities using the NMSS skill.md spec.
                Include name, version, tools, and MCP endpoint info.
              </p>
            </div>
            <div className="glass-panel rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 flex items-center justify-center mb-4">
                <span className="material-icons-round text-accent-cyan text-xl">monitor_heart</span>
              </div>
              <h3 className="text-white font-semibold mb-2">2. Add health endpoint</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Expose a <code className="text-accent-cyan/80 bg-accent-cyan/5 px-1 rounded">/health</code> endpoint
                returning HTTP 200. Nexus checks it every 5 minutes to show
                live status.
              </p>
            </div>
            <div className="glass-panel rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-accent-purple/10 flex items-center justify-center mb-4">
                <span className="material-icons-round text-accent-purple text-xl">rocket_launch</span>
              </div>
              <h3 className="text-white font-semibold mb-2">3. Register via API</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Call the Nexus Core registration endpoint with your agent
                details. Your agent appears in the marketplace immediately.
              </p>
            </div>
          </div>

          {/* API example */}
          <div className="glass-panel rounded-xl p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-white">Registration API</h4>
              <span className="text-[11px] font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">
                POST /api/market/register
              </span>
            </div>
            <pre className="text-xs text-gray-300 bg-background-dark/60 rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
{`curl -X POST ${API_URL}/api/market/register \\
  -H "Authorization: Bearer <PORTAL_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "My Agent",
    "description": "What your agent does",
    "category": "travel.hotels",
    "skill_md_url": "https://my-agent.example.com/skill.md",
    "health_url": "https://my-agent.example.com/health",
    "merchant_did": "did:nexus:20250407:my_agent"
  }'`}
            </pre>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="text-xs">
                <h5 className="text-gray-400 font-medium mb-1.5">Required Fields</h5>
                <ul className="space-y-1 text-gray-500">
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary/60"></span>
                    <code className="text-primary/70">name</code> &mdash; Agent display name
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary/60"></span>
                    <code className="text-primary/70">description</code> &mdash; What it does
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary/60"></span>
                    <code className="text-primary/70">category</code> &mdash; e.g. travel.hotels
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary/60"></span>
                    <code className="text-primary/70">skill_md_url</code> &mdash; NMSS skill.md URL
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary/60"></span>
                    <code className="text-primary/70">health_url</code> &mdash; Health check endpoint
                  </li>
                </ul>
              </div>
              <div className="text-xs">
                <h5 className="text-gray-400 font-medium mb-1.5">Optional Fields</h5>
                <ul className="space-y-1 text-gray-500">
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                    <code className="text-gray-400">merchant_did</code> &mdash; Your DID identifier
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                    <code className="text-gray-400">mcp_endpoint</code> &mdash; SSE endpoint URL
                  </li>
                </ul>
                <h5 className="text-gray-400 font-medium mt-3 mb-1.5">Auth</h5>
                <p className="text-gray-500">
                  Requires <code className="text-gray-400">Bearer PORTAL_TOKEN</code> in
                  Authorization header.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplacePage;
