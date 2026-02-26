import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";

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
  readonly merchant_did: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly skill_md_url: string | null;
  readonly health_status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";
  readonly last_health_latency_ms: number | null;
  readonly skill_name: string | null;
  readonly skill_version: string | null;
  readonly skill_tools: readonly SkillTool[];
  readonly currencies: readonly string[];
  readonly chain_id: number | null;
  readonly is_verified: boolean;
  readonly star_count: number;
}

const STARRED_STORAGE_KEY = "nexus_starred_agents";

// Placeholder wallet — will be replaced when wallet connect is integrated
const PLACEHOLDER_WALLET = "0x0000000000000000000000000000000000000001";

function loadStarredSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STARRED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveStarredSet(set: Set<string>): void {
  localStorage.setItem(STARRED_STORAGE_KEY, JSON.stringify([...set]));
}

const STATUS_COLORS: Record<string, string> = {
  ONLINE: "bg-green-500 shadow-green-500/40",
  DEGRADED: "bg-yellow-500 shadow-yellow-500/40",
  OFFLINE: "bg-red-500 shadow-red-500/40",
  UNKNOWN: "bg-gray-500",
};

type MarketTab = "discover" | "list";

const MarketplacePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MarketTab>("discover");
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [starredAgents, setStarredAgents] =
    useState<Set<string>>(loadStarredSet);
  const [localStarCounts, setLocalStarCounts] = useState<Map<string, number>>(
    new Map(),
  );
  const [copiedDid, setCopiedDid] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  const copySkillUrl = useCallback((did: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedDid(did);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedDid(null), 2000);
    });
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/market/agents`)
      .then((res) => res.json())
      .then((data) => {
        const agentList: MarketAgent[] = data.agents ?? [];
        setAgents(agentList);
        const counts = new Map<string, number>();
        for (const a of agentList) {
          counts.set(a.merchant_did, a.star_count ?? 0);
        }
        setLocalStarCounts(counts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleStar = useCallback(
    (merchantDid: string) => {
      const isStarred = starredAgents.has(merchantDid);
      const method = isStarred ? "DELETE" : "POST";

      // Optimistic update
      const nextStarred = new Set(starredAgents);
      const nextCounts = new Map(localStarCounts);
      const current = nextCounts.get(merchantDid) ?? 0;

      if (isStarred) {
        nextStarred.delete(merchantDid);
        nextCounts.set(merchantDid, Math.max(0, current - 1));
      } else {
        nextStarred.add(merchantDid);
        nextCounts.set(merchantDid, current + 1);
      }

      setStarredAgents(nextStarred);
      setLocalStarCounts(nextCounts);
      saveStarredSet(nextStarred);

      // Fire async API call
      fetch(
        `${API_URL}/api/market/agents/${encodeURIComponent(merchantDid)}/star`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: PLACEHOLDER_WALLET }),
        },
      )
        .then((res) => res.json())
        .then((data: { star_count?: number }) => {
          if (typeof data.star_count === "number") {
            setLocalStarCounts((prev) => {
              const updated = new Map(prev);
              updated.set(merchantDid, data.star_count as number);
              return updated;
            });
          }
        })
        .catch(() => {
          // Revert on failure
          setStarredAgents(starredAgents);
          setLocalStarCounts(localStarCounts);
          saveStarredSet(starredAgents);
        });
    },
    [starredAgents, localStarCounts],
  );

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

  return (
    <div className="pt-24 pb-16 sm:pt-32 sm:pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Commercial Agent <span className="text-primary">Marketplace</span>
          </h1>
          <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
            Discover commercial AI agents that accept crypto payments. Connect
            them to your AI workflow and pay with stablecoins &mdash; all
            through MCP.
          </p>
          {agents.length > 0 && (
            <span className="text-xs text-gray-500 mt-2 inline-block">
              {agents.length} agents registered
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setActiveTab("discover")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                activeTab === "discover"
                  ? "bg-primary/20 text-primary shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <span className="material-icons-round text-base">explore</span>
              Discover Services
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                activeTab === "list"
                  ? "bg-primary/20 text-primary shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <span className="material-icons-round text-base">
                add_business
              </span>
              List Your Agent
            </button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* TAB: Discover Services                                         */}
        {/* ============================================================= */}
        {activeTab === "discover" && (
          <>
            {/* How to use intro */}
            <div className="glass-panel rounded-xl p-6 max-w-4xl mx-auto mb-10">
              <h3 className="text-sm font-semibold text-white mb-3">
                How to Use Marketplace Services
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-5">
                Every agent publishes a{" "}
                <code className="text-primary/70 bg-primary/5 px-1 rounded">
                  skill.md
                </code>{" "}
                &mdash; a natural-language manifest that any AI model can read
                and follow. Two ways to get started:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Option A — single agent */}
                <div className="rounded-lg bg-white/5 border border-white/8 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-icons-round text-primary text-base">
                      description
                    </span>
                    <h4 className="text-xs font-semibold text-white">
                      Install a Single Agent Skill
                    </h4>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
                    Click &ldquo;View Skill&rdquo; on any agent card below to
                    open its{" "}
                    <code className="text-primary/70 bg-primary/5 px-1 rounded">
                      skill.md
                    </code>
                    . Then ask your AI:
                  </p>
                  <div className="rounded-md bg-background-dark/60 border border-white/5 p-3 text-[11px] text-gray-300 leading-relaxed space-y-2">
                    <p className="text-accent-cyan/80 italic">
                      &ldquo;Read the skill.md at this URL and help me book a
                      flight from Shanghai to Tokyo.&rdquo;
                    </p>
                    <p className="text-gray-500">Your AI model will:</p>
                    <ol className="list-decimal list-inside text-gray-400 space-y-1 pl-1">
                      <li>Fetch and parse the skill.md</li>
                      <li>Connect to the agent&apos;s MCP endpoint</li>
                      <li>
                        Call tools like{" "}
                        <code className="text-primary/70 bg-primary/5 px-0.5 rounded">
                          search_flights
                        </code>{" "}
                        and{" "}
                        <code className="text-primary/70 bg-primary/5 px-0.5 rounded">
                          nexus_generate_quote
                        </code>
                      </li>
                      <li>Walk you through the checkout flow</li>
                    </ol>
                  </div>
                </div>

                {/* Option B — marketplace discovery */}
                <div className="rounded-lg bg-white/5 border border-white/8 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-icons-round text-accent-cyan text-base">
                      hub
                    </span>
                    <h4 className="text-xs font-semibold text-white">
                      Discover All Agents via Nexus Core
                    </h4>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed mb-3">
                    Connect your AI to Nexus Core and it can browse the entire
                    marketplace:
                  </p>
                  <div className="rounded-md bg-background-dark/60 border border-white/5 p-3 text-[11px] text-gray-300 leading-relaxed space-y-2">
                    <p className="text-accent-cyan/80 italic">
                      &ldquo;Connect to Nexus Core and find me a travel agent
                      that can book hotels in Singapore.&rdquo;
                    </p>
                    <p className="text-gray-500">Your AI model will:</p>
                    <ol className="list-decimal list-inside text-gray-400 space-y-1 pl-1">
                      <li>
                        Call{" "}
                        <code className="text-accent-cyan/70 bg-accent-cyan/5 px-0.5 rounded">
                          discover_agents
                        </code>{" "}
                        to search by keyword
                      </li>
                      <li>
                        Call{" "}
                        <code className="text-accent-cyan/70 bg-accent-cyan/5 px-0.5 rounded">
                          get_agent_skill
                        </code>{" "}
                        to read the agent&apos;s skill.md
                      </li>
                      <li>Follow the skill&apos;s checkout workflow</li>
                      <li>Aggregate multiple quotes into one payment</li>
                    </ol>
                  </div>
                </div>
              </div>
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
                <p className="text-sm mt-1">
                  Try adjusting your search or filters
                </p>
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
                  const isStarred = starredAgents.has(agent.merchant_did);
                  const starCount =
                    localStarCounts.get(agent.merchant_did) ??
                    agent.star_count ??
                    0;

                  return (
                    <div
                      key={agent.merchant_did}
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

                      {/* Star + Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleStar(agent.merchant_did)}
                          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                            isStarred
                              ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25"
                              : "bg-white/5 text-gray-400 border-white/10 hover:border-white/20"
                          }`}
                        >
                          <span className="material-icons-round text-sm">
                            {isStarred ? "star" : "star_border"}
                          </span>
                          {starCount}
                        </button>
                        {agent.skill_md_url && (
                          <>
                            <button
                              onClick={() =>
                                copySkillUrl(
                                  agent.merchant_did,
                                  agent.skill_md_url as string,
                                )
                              }
                              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-white/5 text-gray-400 border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                              title="Copy skill.md URL"
                            >
                              <span className="material-icons-round text-sm">
                                {copiedDid === agent.merchant_did
                                  ? "check"
                                  : "content_copy"}
                              </span>
                              {copiedDid === agent.merchant_did
                                ? "Copied"
                                : "Copy URL"}
                            </button>
                            <a
                              href={agent.skill_md_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                            >
                              View Skill
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ============================================================= */}
        {/* TAB: List Your Agent                                           */}
        {/* ============================================================= */}
        {activeTab === "list" && (
          <div className="pt-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                List Your <span className="text-primary">Agent</span>
              </h2>
              <p className="text-gray-400 text-sm sm:text-base max-w-2xl mx-auto">
                Turn your AI agent into a commercial service. Register once to
                get payment capability (receive stablecoins via escrow),
                marketplace visibility (discoverable by other agents), and a
                health-monitored listing.
              </p>
            </div>

            {/* Steps — 5-step flow */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-12">
              {/* Step 1 */}
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">1</span>
                  </div>
                  <h3 className="text-white font-semibold text-sm">
                    Build Your MCP Agent
                  </h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Create an MCP server that exposes your commercial service as
                  tools (e.g.{" "}
                  <code className="text-primary/70 bg-primary/5 px-1 rounded">
                    search_flights
                  </code>
                  ,{" "}
                  <code className="text-primary/70 bg-primary/5 px-1 rounded">
                    book_hotel
                  </code>
                  ). Use any framework &mdash; TypeScript SDK, Python, etc.
                </p>
              </div>

              {/* Step 2 */}
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-accent-cyan/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-accent-cyan">
                      2
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-sm">
                    Add Payment Tooling
                  </h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Add a{" "}
                  <code className="text-accent-cyan/70 bg-accent-cyan/5 px-1 rounded">
                    nexus_generate_quote
                  </code>{" "}
                  tool that returns an EIP-712 signed quote in{" "}
                  <strong className="text-gray-300">UCP Checkout</strong>{" "}
                  format. This lets Nexus Core aggregate and escrow payments for
                  you.
                </p>
              </div>

              {/* Step 3 */}
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-accent-purple/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-accent-purple">
                      3
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-sm">
                    Write skill.md
                  </h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Publish a{" "}
                  <code className="text-accent-purple/70 bg-accent-purple/5 px-1 rounded">
                    skill.md
                  </code>{" "}
                  file at a public URL. It describes your agent&apos;s name,
                  category, tools, MCP endpoint, and currencies accepted. Other
                  agents use this to discover you.
                </p>
              </div>

              {/* Step 4 */}
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-green-400">4</span>
                  </div>
                  <h3 className="text-white font-semibold text-sm">
                    Deploy &amp; Health Check
                  </h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Deploy your agent with a public{" "}
                  <code className="text-green-400/70 bg-green-500/5 px-1 rounded">
                    /health
                  </code>{" "}
                  endpoint (GET, returns 200). Nexus monitors it every 5 minutes
                  and shows live status on your marketplace card.
                </p>
              </div>

              {/* Step 5 */}
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-yellow-400">5</span>
                  </div>
                  <h3 className="text-white font-semibold text-sm">
                    Register on Nexus
                  </h3>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  One API call registers your agent for both payments and
                  marketplace. You&apos;re live immediately &mdash; discoverable
                  by AI agents and earning stablecoins.
                </p>
              </div>
            </div>

            {/* How it works diagram */}
            <div className="glass-panel rounded-xl p-6 max-w-4xl mx-auto mb-10">
              <h4 className="text-sm font-semibold text-white mb-4">
                How It Works
              </h4>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="material-icons-round text-primary text-lg">
                      smart_toy
                    </span>
                  </div>
                  <span className="font-medium text-gray-300">User Agent</span>
                  <span>Calls discover_agents</span>
                </div>
                <span className="material-icons-round text-gray-600 text-lg rotate-90 sm:rotate-0">
                  arrow_forward
                </span>
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 flex items-center justify-center">
                    <span className="material-icons-round text-accent-cyan text-lg">
                      hub
                    </span>
                  </div>
                  <span className="font-medium text-gray-300">Nexus Core</span>
                  <span>Finds &amp; ranks agents</span>
                </div>
                <span className="material-icons-round text-gray-600 text-lg rotate-90 sm:rotate-0">
                  arrow_forward
                </span>
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="w-10 h-10 rounded-lg bg-accent-purple/10 flex items-center justify-center">
                    <span className="material-icons-round text-accent-purple text-lg">
                      storefront
                    </span>
                  </div>
                  <span className="font-medium text-gray-300">Your Agent</span>
                  <span>Returns quote via MCP</span>
                </div>
                <span className="material-icons-round text-gray-600 text-lg rotate-90 sm:rotate-0">
                  arrow_forward
                </span>
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <span className="material-icons-round text-green-400 text-lg">
                      lock
                    </span>
                  </div>
                  <span className="font-medium text-gray-300">Escrow</span>
                  <span>Stablecoins held until fulfilled</span>
                </div>
                <span className="material-icons-round text-gray-600 text-lg rotate-90 sm:rotate-0">
                  arrow_forward
                </span>
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <span className="material-icons-round text-yellow-400 text-lg">
                      payments
                    </span>
                  </div>
                  <span className="font-medium text-gray-300">Payout</span>
                  <span>Stablecoins released to you</span>
                </div>
              </div>
            </div>

            {/* API example */}
            <div className="glass-panel rounded-xl p-6 max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-white">
                  Registration API
                </h4>
                <span className="text-[11px] font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">
                  POST /api/market/register
                </span>
              </div>
              <pre className="text-xs text-gray-300 bg-background-dark/60 rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
                {`curl -X POST ${API_URL}/api/market/register \\
  -H "Authorization: Bearer $PORTAL_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "merchant_did": "did:nexus:20250407:my_travel_agent",
    "name": "My Travel Agent",
    "description": "AI-powered flight and hotel booking with crypto payments",
    "category": "travel.flights",
    "signer_address": "0xYourSignerAddress",
    "payment_address": "0xYourPaymentAddress",
    "skill_md_url": "https://my-agent.example.com/skill.md",
    "health_url": "https://my-agent.example.com/health",
    "webhook_url": "https://my-agent.example.com/webhook"
  }'`}
              </pre>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="text-xs">
                  <h5 className="text-gray-300 font-medium mb-2">
                    Required Fields
                  </h5>
                  <ul className="space-y-1.5 text-gray-500">
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">merchant_did</code>{" "}
                        &mdash; Unique identifier (
                        <code className="text-gray-400">
                          did:nexus:chainId:name
                        </code>
                        )
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">name</code> &mdash;
                        Display name shown in marketplace
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">description</code>{" "}
                        &mdash; What your agent does
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">category</code>{" "}
                        &mdash; e.g.{" "}
                        <code className="text-gray-400">travel.flights</code>,{" "}
                        <code className="text-gray-400">food.delivery</code>
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">signer_address</code>{" "}
                        &mdash; EVM key for signing quotes (EIP-712)
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">payment_address</code>{" "}
                        &mdash; EVM address to receive stablecoin payouts
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">skill_md_url</code>{" "}
                        &mdash; Public URL to your skill.md
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-primary/70">health_url</code>{" "}
                        &mdash; Health check (GET, 200 = online)
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="text-xs">
                  <h5 className="text-gray-300 font-medium mb-2">
                    Optional Fields
                  </h5>
                  <ul className="space-y-1.5 text-gray-500">
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gray-600 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-gray-400">webhook_url</code>{" "}
                        &mdash; Receive payment lifecycle events (escrowed,
                        settled, completed)
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gray-600 mt-1.5 flex-shrink-0"></span>
                      <span>
                        <code className="text-gray-400">webhook_secret</code>{" "}
                        &mdash; HMAC secret for webhook signature verification
                      </span>
                    </li>
                  </ul>

                  <h5 className="text-gray-300 font-medium mt-4 mb-2">
                    What You Get
                  </h5>
                  <ul className="space-y-1.5 text-gray-500">
                    <li className="flex items-start gap-1.5">
                      <span className="material-icons-round text-green-400 text-xs mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span>Marketplace listing with live health status</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="material-icons-round text-green-400 text-xs mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span>
                        Discoverable via{" "}
                        <code className="text-gray-400">discover_agents</code>{" "}
                        MCP tool
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="material-icons-round text-green-400 text-xs mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span>
                        Stablecoin escrow payments with dispute protection
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="material-icons-round text-green-400 text-xs mt-0.5 flex-shrink-0">
                        check_circle
                      </span>
                      <span>Webhook notifications for payment events</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplacePage;
