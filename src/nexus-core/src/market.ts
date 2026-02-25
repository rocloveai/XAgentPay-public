/**
 * NexusPay Core — Agent Marketplace.
 *
 * Serves the marketplace HTML page and JSON API endpoints for
 * browsing, registering, and discovering agent skills.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MarketRepository } from "./db/interfaces/market-repo.js";
import type { NexusCoreConfig } from "./config.js";
import type { AgentHealthStatus, MarketAgentRecord } from "./types.js";
import { createLogger } from "./logger.js";

const marketLog = createLogger("Market");

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface MarketDeps {
  readonly marketRepo: MarketRepository;
  readonly config: NexusCoreConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function generateAgentId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `AGT-${id}`;
}

function isAuthorized(deps: MarketDeps, req: IncomingMessage): boolean {
  if (!deps.config.portalToken) return true;
  const authHeader = req.headers.authorization ?? "";
  return authHeader === `Bearer ${deps.config.portalToken}`;
}

// ---------------------------------------------------------------------------
// skill.md parser (simple YAML frontmatter extraction)
// ---------------------------------------------------------------------------

interface SkillMetadata {
  readonly skill_name: string | null;
  readonly skill_version: string | null;
  readonly skill_protocol: string | null;
  readonly skill_tools: readonly { name: string; role: string }[];
  readonly currencies: readonly string[];
  readonly chain_id: number | null;
  readonly mcp_endpoint: string | null;
}

async function fetchSkillMetadata(skillMdUrl: string): Promise<SkillMetadata> {
  const empty: SkillMetadata = {
    skill_name: null,
    skill_version: null,
    skill_protocol: null,
    skill_tools: [],
    currencies: ["USDC"],
    chain_id: null,
    mcp_endpoint: null,
  };

  try {
    const res = await fetch(skillMdUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return empty;

    const text = await res.text();

    // Extract YAML frontmatter between --- delimiters
    const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return empty;

    const fm = fmMatch[1];
    const lines = fm.split("\n");
    const kvMap = new Map<string, string>();

    for (const line of lines) {
      const match = line.match(/^(\w[\w_-]*):\s*(.+)$/);
      if (match) {
        kvMap.set(match[1].trim(), match[2].trim());
      }
    }

    // Parse tools (look for tool definitions in body)
    const tools: { name: string; role: string }[] = [];
    const toolMatches = text.matchAll(
      /###?\s+(?:Tool:\s*)?`?(\w+)`?\s*(?:—|-)?\s*(.*)/g,
    );
    for (const m of toolMatches) {
      tools.push({ name: m[1], role: m[2]?.trim() || "tool" });
    }

    // Parse MCP endpoint from mcpServers config
    const mcpMatch = text.match(
      /(?:sse|url|endpoint)\s*[:"]\s*(https?:\/\/[^\s"']+)/i,
    );

    // Parse currencies
    let currencies: string[] = ["USDC"];
    const currVal = kvMap.get("currencies") || kvMap.get("currency");
    if (currVal) {
      currencies = currVal
        .replace(/[\[\]]/g, "")
        .split(",")
        .map((c) => c.trim().replace(/['"]/g, ""))
        .filter(Boolean);
    }

    // Parse chain_id
    const chainStr = kvMap.get("chain_id") || kvMap.get("chainId");
    const chainId = chainStr ? Number(chainStr) : null;

    return {
      skill_name: kvMap.get("name") ?? null,
      skill_version: kvMap.get("version") ?? null,
      skill_protocol: kvMap.get("protocol") ?? null,
      skill_tools: tools,
      currencies,
      chain_id: Number.isNaN(chainId) ? null : chainId,
      mcp_endpoint: mcpMatch?.[1] ?? null,
    };
  } catch (err) {
    marketLog.warn("Failed to fetch skill.md", {
      url: skillMdUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

// ---------------------------------------------------------------------------
// API: GET /api/market/agents
// ---------------------------------------------------------------------------

async function handleListAgents(
  deps: MarketDeps,
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const category = url.searchParams.get("category") ?? undefined;
  const status = url.searchParams.get("status") as
    | AgentHealthStatus
    | undefined;

  const agents = await deps.marketRepo.listAll({ category, status });

  sendJson(res, 200, {
    agents: agents.map((a) => ({
      agent_id: a.agent_id,
      name: a.name,
      description: a.description,
      category: a.category,
      skill_md_url: a.skill_md_url,
      health_status: a.health_status,
      last_health_latency_ms: a.last_health_latency_ms,
      skill_name: a.skill_name,
      skill_version: a.skill_version,
      skill_tools: a.skill_tools,
      currencies: a.currencies,
      chain_id: a.chain_id,
      mcp_endpoint: a.mcp_endpoint,
      is_verified: a.is_verified,
    })),
    total: agents.length,
  });
}

// ---------------------------------------------------------------------------
// API: GET /api/market/agents/:agentId
// ---------------------------------------------------------------------------

async function handleGetAgent(
  deps: MarketDeps,
  agentId: string,
  res: ServerResponse,
): Promise<void> {
  const agent = await deps.marketRepo.findById(agentId);
  if (!agent) {
    sendJson(res, 404, { error: "Agent not found" });
    return;
  }
  sendJson(res, 200, { agent });
}

// ---------------------------------------------------------------------------
// API: POST /api/market/register
// ---------------------------------------------------------------------------

async function handleRegister(
  deps: MarketDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isAuthorized(deps, req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return;
  }

  const {
    name,
    description,
    category,
    skill_md_url,
    health_url,
    merchant_did,
  } = body as Record<string, string>;

  if (!name || !description || !category || !skill_md_url || !health_url) {
    sendJson(res, 400, {
      error:
        "Missing required fields: name, description, category, skill_md_url, health_url",
    });
    return;
  }

  const agentId = generateAgentId();

  // Attempt to parse skill.md (non-blocking — registration succeeds regardless)
  const metadata = await fetchSkillMetadata(skill_md_url);

  const agent = await deps.marketRepo.insert({
    agent_id: agentId,
    name,
    description,
    category,
    skill_md_url,
    health_url,
    mcp_endpoint: metadata.mcp_endpoint ?? undefined,
    merchant_did: merchant_did ?? undefined,
  });

  // Update skill metadata if we got any
  if (metadata.skill_name || metadata.skill_tools.length > 0) {
    await deps.marketRepo.updateSkillMetadata(agentId, metadata);
  }

  // Re-fetch to get the full record with metadata
  const updated = await deps.marketRepo.findById(agentId);

  marketLog.info("Agent registered", { agent_id: agentId, name });
  sendJson(res, 201, { agent: updated ?? agent });
}

// ---------------------------------------------------------------------------
// HTML: GET /market
// ---------------------------------------------------------------------------

function renderMarketPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus Agent Marketplace</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            surface: { DEFAULT: '#0f1117', card: '#181a24', hover: '#1e2130' },
            brand: { DEFAULT: '#6366f1', light: '#818cf8' },
          }
        }
      }
    }
  </script>
  <style>
    body { background: #090b10; font-family: 'Inter', system-ui, sans-serif; }
    .glass-card { background: rgba(24, 26, 36, 0.8); border: 1px solid rgba(255,255,255,0.06); backdrop-filter: blur(12px); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .status-ONLINE { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
    .status-DEGRADED { background: #eab308; box-shadow: 0 0 6px #eab30888; }
    .status-OFFLINE { background: #ef4444; box-shadow: 0 0 6px #ef444488; }
    .status-UNKNOWN { background: #6b7280; }
    .chip { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 500; }
    .tool-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px;
      background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.2); }
    .category-chip { background: rgba(99, 102, 241, 0.12); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.15); }
    .search-input { background: rgba(24, 26, 36, 0.9); border: 1px solid rgba(255,255,255,0.08); }
    .search-input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15); }
    .filter-btn { cursor: pointer; transition: all 0.15s; }
    .filter-btn.active { background: rgba(99, 102, 241, 0.2); color: #818cf8; border-color: rgba(99, 102, 241, 0.4); }
    .copy-btn:active { transform: scale(0.95); }
  </style>
</head>
<body class="text-gray-200 min-h-screen">

  <!-- Header -->
  <header class="border-b border-white/5 px-6 py-4">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded bg-gradient-to-br from-brand to-cyan-400 flex items-center justify-center">
          <span class="material-icons-round text-white text-sm">hub</span>
        </div>
        <h1 class="text-xl font-bold text-white tracking-wide">Agent Marketplace</h1>
        <span class="text-xs text-gray-500 ml-2" id="agent-count"></span>
      </div>
      <a href="/" class="text-sm text-gray-400 hover:text-white transition-colors">Portal</a>
    </div>
  </header>

  <!-- Filters -->
  <div class="max-w-7xl mx-auto px-6 py-6">
    <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div class="relative flex-1 max-w-md">
        <span class="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">search</span>
        <input type="text" id="search" placeholder="Search agents..."
          class="search-input w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-white placeholder-gray-500">
      </div>
      <div class="flex flex-wrap gap-2" id="category-filters">
        <button class="filter-btn chip border border-white/10 text-gray-400 active" data-cat="all">All</button>
        <button class="filter-btn chip border border-white/10 text-gray-400" data-cat="travel">Travel</button>
        <button class="filter-btn chip border border-white/10 text-gray-400" data-cat="food">Food</button>
        <button class="filter-btn chip border border-white/10 text-gray-400" data-cat="retail">Retail</button>
        <button class="filter-btn chip border border-white/10 text-gray-400" data-cat="entertainment">Entertainment</button>
        <button class="filter-btn chip border border-white/10 text-gray-400" data-cat="finance">Finance</button>
        <button class="filter-btn chip border border-white/10 text-gray-400" data-cat="services">Services</button>
      </div>
    </div>
  </div>

  <!-- Grid -->
  <div class="max-w-7xl mx-auto px-6 pb-12">
    <div id="grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    <div id="empty" class="hidden text-center py-20 text-gray-500">
      <span class="material-icons-round text-5xl mb-3 block">search_off</span>
      <p class="text-lg">No agents found</p>
      <p class="text-sm mt-1">Try adjusting your search or filters</p>
    </div>
    <div id="loading" class="text-center py-20 text-gray-500">
      <p class="text-lg">Loading agents...</p>
    </div>
  </div>

<script>
  const CHAIN_NAMES = { 20250407: 'PlatON Devnet', 1: 'Ethereum', 137: 'Polygon' };
  let allAgents = [];
  let activeCategory = 'all';

  async function loadAgents() {
    try {
      const res = await fetch('/api/market/agents');
      const data = await res.json();
      allAgents = data.agents || [];
      document.getElementById('agent-count').textContent = allAgents.length + ' agents';
      document.getElementById('loading').classList.add('hidden');
      render();
    } catch(e) {
      document.getElementById('loading').textContent = 'Failed to load agents';
    }
  }

  function render() {
    const q = document.getElementById('search').value.toLowerCase();
    const filtered = allAgents.filter(a => {
      const matchSearch = !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
      const matchCat = activeCategory === 'all' || a.category.startsWith(activeCategory);
      return matchSearch && matchCat;
    });

    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');

    if (filtered.length === 0) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = filtered.map(a => {
      const statusClass = 'status-' + a.health_status;
      const chainName = CHAIN_NAMES[a.chain_id] || ('Chain ' + (a.chain_id || '?'));
      const tools = (a.skill_tools || []).map(t =>
        '<span class="tool-badge">' + esc(t.name) + '</span>'
      ).join(' ');
      const currencies = (a.currencies || []).map(c =>
        '<span class="chip category-chip">' + esc(c) + '</span>'
      ).join(' ');
      const latency = a.last_health_latency_ms != null ? a.last_health_latency_ms + 'ms' : '—';
      const version = a.skill_version ? 'v' + a.skill_version : '';
      const verified = a.is_verified ? '<span class="material-icons-round text-brand text-sm ml-1" title="Verified">verified</span>' : '';
      const mcpJson = a.mcp_endpoint ? JSON.stringify({ mcpServers: { [a.name.toLowerCase().replace(/\\s+/g, '-')]: { url: a.mcp_endpoint } } }, null, 2) : '';

      return '<div class="glass-card rounded-xl p-5 hover:border-white/12 transition-colors">' +
        '<div class="flex items-center justify-between mb-2">' +
          '<div class="flex items-center gap-2">' +
            '<span class="status-dot ' + statusClass + '"></span>' +
            '<h3 class="font-semibold text-white text-sm">' + esc(a.name) + verified + '</h3>' +
          '</div>' +
          '<span class="text-xs text-gray-500">' + esc(version) + '</span>' +
        '</div>' +
        '<div class="mb-3"><span class="chip category-chip">' + esc(a.category) + '</span></div>' +
        '<p class="text-xs text-gray-400 mb-3 line-clamp-2">' + esc(a.description) + '</p>' +
        '<div class="flex flex-wrap gap-1.5 mb-3">' + currencies + ' ' + tools + '</div>' +
        '<div class="flex items-center justify-between text-xs text-gray-500 mb-3">' +
          '<span>Latency: ' + latency + '</span>' +
          '<span>' + esc(chainName) + '</span>' +
        '</div>' +
        '<div class="flex gap-2">' +
          (mcpJson ? '<button class="copy-btn text-xs px-3 py-1.5 rounded-md bg-brand/10 text-brand-light border border-brand/20 hover:bg-brand/20 transition-colors" onclick="copyMcp(this, ' + "'" + esc(mcpJson).replace(/'/g, "\\\\'") + "'" + ')">Copy MCP Config</button>' : '') +
          '<a href="' + esc(a.skill_md_url || '#') + '" target="_blank" class="text-xs px-3 py-1.5 rounded-md bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors">View Skill</a>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function copyMcp(btn, json) {
    navigator.clipboard.writeText(json).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = orig, 1500);
    });
  }

  // Category filter clicks
  document.getElementById('category-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    render();
  });

  // Search
  document.getElementById('search').addEventListener('input', render);

  loadAgents();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export async function handleMarketRequest(
  deps: MarketDeps,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS" && path.startsWith("/api/market")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return true;
  }

  // GET /market — HTML page
  if (path === "/market" && req.method === "GET") {
    sendHtml(res, renderMarketPage());
    return true;
  }

  // GET /api/market/agents — list
  if (path === "/api/market/agents" && req.method === "GET") {
    await handleListAgents(deps, url, res);
    return true;
  }

  // GET /api/market/agents/:agentId — detail
  const agentMatch = path.match(/^\/api\/market\/agents\/(AGT-[a-z0-9]+)$/);
  if (agentMatch && req.method === "GET") {
    await handleGetAgent(deps, agentMatch[1], res);
    return true;
  }

  // POST /api/market/register — register new agent
  if (path === "/api/market/register" && req.method === "POST") {
    await handleRegister(deps, req, res);
    return true;
  }

  return false;
}
