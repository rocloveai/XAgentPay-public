/**
 * NexusPay Core — Agent Marketplace.
 *
 * Serves the marketplace HTML page and JSON API endpoints for
 * browsing, registering, and discovering merchant agent skills.
 *
 * Registration is unified: one call registers both payment identity
 * and marketplace presence.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MerchantRepository } from "./db/interfaces/merchant-repo.js";
import type { StarRepository } from "./db/interfaces/star-repo.js";
import type { NexusCoreConfig } from "./config.js";
import type { AgentHealthStatus, MerchantRecord } from "./types.js";
import { createLogger } from "./logger.js";

const marketLog = createLogger("Market");

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface MarketDeps {
  readonly merchantRepo: MerchantRepository;
  readonly starRepo: StarRepository;
  readonly config: NexusCoreConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const envelope = Array.isArray(data)
    ? { http_status: status, data }
    : { http_status: status, ...(data as object) };
  const body = JSON.stringify(envelope, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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
// Merchant → marketplace API shape
// ---------------------------------------------------------------------------

function toMarketAgent(m: MerchantRecord, starCount = 0) {
  return {
    merchant_did: m.merchant_did,
    name: m.name,
    description: m.description,
    category: m.category,
    skill_md_url: m.skill_md_url,
    skill_user_url: m.skill_user_url,
    health_status: m.health_status,
    last_health_latency_ms: m.last_health_latency_ms,
    skill_name: m.skill_name,
    skill_version: m.skill_version,
    skill_tools: m.skill_tools,
    currencies: m.currencies,
    chain_id: m.chain_id,
    is_verified: m.is_verified,
    star_count: starCount,
  };
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

  const merchants = await deps.merchantRepo.listForMarket({ category, status });
  const dids = merchants.map((m) => m.merchant_did);

  // Gracefully degrade if merchant_stars table hasn't been migrated yet
  let starCounts: ReadonlyMap<string, number> = new Map();
  try {
    starCounts = await deps.starRepo.getStarCounts(dids);
  } catch {
    marketLog.warn("Failed to fetch star counts — table may not exist yet");
  }

  sendJson(res, 200, {
    agents: merchants.map((m) =>
      toMarketAgent(m, starCounts.get(m.merchant_did) ?? 0),
    ),
    total: merchants.length,
  });
}

// ---------------------------------------------------------------------------
// API: GET /api/market/agents/:merchantDid
// ---------------------------------------------------------------------------

async function handleGetAgent(
  deps: MarketDeps,
  merchantDid: string,
  res: ServerResponse,
): Promise<void> {
  const merchant = await deps.merchantRepo.findByDid(merchantDid);
  if (!merchant || !merchant.skill_md_url) {
    sendJson(res, 404, { error: "Agent not found" });
    return;
  }
  let starCount = 0;
  try {
    starCount = await deps.starRepo.getStarCount(merchantDid);
  } catch {
    /* table may not exist yet */
  }
  sendJson(res, 200, { agent: toMarketAgent(merchant, starCount) });
}

// ---------------------------------------------------------------------------
// API: POST /api/market/register — unified registration
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
    merchant_did,
    name,
    description,
    category,
    signer_address,
    payment_address,
    skill_md_url,
    skill_user_url,
    health_url,
    webhook_url,
    webhook_secret,
  } = body as Record<string, string>;

  if (
    !merchant_did ||
    !name ||
    !description ||
    !category ||
    !signer_address ||
    !payment_address ||
    !skill_md_url ||
    !health_url
  ) {
    sendJson(res, 400, {
      error:
        "Missing required fields: merchant_did, name, description, category, signer_address, payment_address, skill_md_url, health_url",
    });
    return;
  }

  // Attempt to parse skill.md (non-blocking — registration succeeds regardless)
  const metadata = await fetchSkillMetadata(skill_md_url);

  const merchant = await deps.merchantRepo.register({
    merchant_did,
    name,
    description,
    category,
    signer_address,
    payment_address,
    skill_md_url,
    skill_user_url,
    health_url,
    webhook_url,
    webhook_secret,
    mcp_endpoint: metadata.mcp_endpoint ?? undefined,
  });

  // Update skill metadata if we got any
  if (metadata.skill_name || metadata.skill_tools.length > 0) {
    await deps.merchantRepo.updateSkillMetadata(merchant_did, metadata);
  }

  // Re-fetch to get the full record with metadata
  const updated = await deps.merchantRepo.findByDid(merchant_did);

  marketLog.info("Merchant registered", { merchant_did, name });
  sendJson(res, 201, {
    agent: updated ? toMarketAgent(updated) : toMarketAgent(merchant),
  });
}

// ---------------------------------------------------------------------------
// HTML: GET /market
// ---------------------------------------------------------------------------

function renderMarketPage(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commercial Agent Marketplace — Nexus</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
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
    .nav-link { color: #94a3b8; font-size: 14px; transition: color 0.15s; }
    .nav-link:hover { color: #fff; }
    .nav-link.active { color: #818cf8; }
    pre.code-block { background: rgba(15, 17, 23, 0.9); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 12px; line-height: 1.6; color: #a5b4fc; }
  </style>
</head>
<body class="text-gray-200 min-h-screen">

  <!-- Header -->
  <header class="border-b border-white/5 px-6 py-4 sticky top-0 bg-[#090b10]/80 backdrop-blur-lg z-50">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3">
        <a href="/" class="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div class="w-8 h-8 rounded bg-gradient-to-br from-brand to-cyan-400 flex items-center justify-center">
            <span class="material-icons-round text-white text-sm">hub</span>
          </div>
          <span class="text-lg font-bold text-white tracking-wide">NEXUS</span>
        </a>
        <span class="text-gray-600 mx-1">/</span>
        <span class="text-sm font-medium text-white">Commercial Marketplace</span>
        <span class="text-xs text-gray-500 ml-1" id="agent-count"></span>
      </div>
      <nav class="flex items-center gap-6">
        <a href="/" class="nav-link">Portal</a>
        <a href="/market" class="nav-link active">Market</a>
        <a href="#register" class="nav-link">Register</a>
      </nav>
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

  <!-- How to Register -->
  <div id="register" class="border-t border-white/5">
    <div class="max-w-7xl mx-auto px-6 py-16">
      <h2 class="text-2xl font-bold text-white mb-2">Register Your Agent</h2>
      <p class="text-gray-400 text-sm mb-8 max-w-xl">One registration gives your agent both <strong class="text-gray-200">payment capability</strong> (receive stablecoins) and <strong class="text-gray-200">marketplace visibility</strong> (discoverable by other agents via skill.md).</p>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Steps -->
        <div class="space-y-6">
          <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Requirements</h3>

          <div class="flex gap-3">
            <div class="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-brand">1</span>
            </div>
            <div>
              <p class="text-sm font-medium text-white">skill.md</p>
              <p class="text-xs text-gray-400 mt-0.5">A public URL serving your agent's skill definition (NMSS format). This is how other agents discover your capabilities.</p>
            </div>
          </div>

          <div class="flex gap-3">
            <div class="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-brand">2</span>
            </div>
            <div>
              <p class="text-sm font-medium text-white">Health endpoint</p>
              <p class="text-xs text-gray-400 mt-0.5">GET endpoint returning HTTP 200. Nexus checks every 5 minutes to display live status.</p>
            </div>
          </div>

          <div class="flex gap-3">
            <div class="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-brand">3</span>
            </div>
            <div>
              <p class="text-sm font-medium text-white">Payment identity</p>
              <p class="text-xs text-gray-400 mt-0.5">An EVM signer address (for quote signing) and payment address (for receiving stablecoins). These enable Nexus payment integration.</p>
            </div>
          </div>

          <div class="flex gap-3">
            <div class="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span class="text-xs font-bold text-brand">4</span>
            </div>
            <div>
              <p class="text-sm font-medium text-white">Call the register API</p>
              <p class="text-xs text-gray-400 mt-0.5">POST to <code class="text-brand/80 bg-brand/10 px-1 rounded">/api/market/register</code>. One call registers payment + marketplace.</p>
            </div>
          </div>
        </div>

        <!-- API Example -->
        <div>
          <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">API Example</h3>
          <pre class="code-block"><span class="text-gray-500">// POST ${baseUrl}/api/market/register</span>
<span class="text-gray-500">// Authorization: Bearer $PORTAL_TOKEN</span>

curl -X POST ${baseUrl}/api/market/register \\
  -H "Authorization: Bearer $PORTAL_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "merchant_did": "did:nexus:20250407:my_agent",
    "name": "My Hotel Agent",
    "description": "AI hotel booking with payment",
    "category": "travel.hotels",
    "signer_address": "0xYourSignerAddress",
    "payment_address": "0xYourPaymentAddress",
    "skill_md_url": "https://my-agent.example.com/skill.md",
    "skill_user_url": "https://my-agent.example.com/skill-user.md",
    "health_url": "https://my-agent.example.com/health"
  }'</pre>

          <div class="mt-4 glass-card rounded-lg p-4">
            <h4 class="text-xs font-semibold text-gray-300 mb-2">Required fields</h4>
            <table class="w-full text-xs">
              <tbody class="text-gray-400">
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">merchant_did</td><td class="py-1.5 pl-3">Unique DID identifier</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">name</td><td class="py-1.5 pl-3">Agent display name</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">description</td><td class="py-1.5 pl-3">What your agent does</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">category</td><td class="py-1.5 pl-3">e.g. travel.hotels, food.delivery</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">signer_address</td><td class="py-1.5 pl-3">EVM address for quote signing</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">payment_address</td><td class="py-1.5 pl-3">EVM address for receiving stablecoins</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">skill_md_url</td><td class="py-1.5 pl-3">Public URL to your skill.md (MCP tool definitions)</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-gray-500">skill_user_url</td><td class="py-1.5 pl-3 text-gray-500">Optional: URL to skill-user.md (HTTP REST API docs for end users)</td></tr>
                <tr class="border-b border-white/5"><td class="py-1.5 font-mono text-brand/80">health_url</td><td class="py-1.5 pl-3">Health check endpoint (GET, 200=OK)</td></tr>
                <tr><td class="py-1.5 font-mono text-gray-500">webhook_url</td><td class="py-1.5 pl-3 text-gray-500">Optional: webhook for payment events</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
      const latency = a.last_health_latency_ms != null ? a.last_health_latency_ms + 'ms' : '\u2014';
      const version = a.skill_version ? 'v' + a.skill_version : '';
      const verified = a.is_verified ? '<span class="material-icons-round text-brand text-sm ml-1" title="Verified">verified</span>' : '';

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
          '<a href="' + esc(a.skill_user_url || a.skill_md_url || '#') + '" target="_blank" class="text-xs px-3 py-1.5 rounded-md bg-brand/10 text-brand-light border border-brand/20 hover:bg-brand/20 transition-colors">View Skill</a>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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
// Wallet address validation
// ---------------------------------------------------------------------------

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

// ---------------------------------------------------------------------------
// API: POST /api/market/agents/:did/star
// ---------------------------------------------------------------------------

async function handleAddStar(
  deps: MarketDeps,
  merchantDid: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return;
  }

  const walletAddress = body.wallet_address;
  if (typeof walletAddress !== "string" || !WALLET_RE.test(walletAddress)) {
    sendJson(res, 400, {
      error: "Invalid wallet_address: must be 0x followed by 40 hex characters",
    });
    return;
  }

  try {
    const isNew = await deps.starRepo.addStar(merchantDid, walletAddress);
    const starCount = await deps.starRepo.getStarCount(merchantDid);
    sendJson(res, isNew ? 201 : 200, { starred: true, star_count: starCount });
  } catch {
    sendJson(res, 503, {
      error: "Star feature unavailable — migration pending",
    });
  }
}

// ---------------------------------------------------------------------------
// API: DELETE /api/market/agents/:did/star
// ---------------------------------------------------------------------------

async function handleRemoveStar(
  deps: MarketDeps,
  merchantDid: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return;
  }

  const walletAddress = body.wallet_address;
  if (typeof walletAddress !== "string" || !WALLET_RE.test(walletAddress)) {
    sendJson(res, 400, {
      error: "Invalid wallet_address: must be 0x followed by 40 hex characters",
    });
    return;
  }

  try {
    await deps.starRepo.removeStar(merchantDid, walletAddress);
    const starCount = await deps.starRepo.getStarCount(merchantDid);
    sendJson(res, 200, { starred: false, star_count: starCount });
  } catch {
    sendJson(res, 503, {
      error: "Star feature unavailable — migration pending",
    });
  }
}

// ---------------------------------------------------------------------------
// API: GET /api/market/agents/:did/stars
// ---------------------------------------------------------------------------

async function handleGetStars(
  deps: MarketDeps,
  merchantDid: string,
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const walletAddress = url.searchParams.get("wallet_address") ?? undefined;
  try {
    const info = await deps.starRepo.getStarInfo(merchantDid, walletAddress);
    sendJson(res, 200, info);
  } catch {
    sendJson(res, 503, {
      error: "Star feature unavailable — migration pending",
    });
  }
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
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    });
    res.end();
    return true;
  }

  // GET /market — HTML page
  if (path === "/market" && req.method === "GET") {
    const baseUrl =
      deps.config.baseUrl || `http://${req.headers.host ?? "localhost:4000"}`;
    sendHtml(res, renderMarketPage(baseUrl));
    return true;
  }

  // GET /api/market/agents — list
  if (path === "/api/market/agents" && req.method === "GET") {
    await handleListAgents(deps, url, res);
    return true;
  }

  // POST /api/market/register — register new merchant
  if (path === "/api/market/register" && req.method === "POST") {
    await handleRegister(deps, req, res);
    return true;
  }

  // Star routes — MUST come before the catch-all :did route
  const starMatch = path.match(/^\/api\/market\/agents\/(.+)\/star$/);
  if (starMatch) {
    const did = decodeURIComponent(starMatch[1]);
    if (req.method === "POST") {
      await handleAddStar(deps, did, req, res);
      return true;
    }
    if (req.method === "DELETE") {
      await handleRemoveStar(deps, did, req, res);
      return true;
    }
  }

  const starsMatch = path.match(/^\/api\/market\/agents\/(.+)\/stars$/);
  if (starsMatch && req.method === "GET") {
    const did = decodeURIComponent(starsMatch[1]);
    await handleGetStars(deps, did, url, res);
    return true;
  }

  // GET /api/market/agents/:merchantDid — detail (catch-all, no slashes in DID segment)
  const didMatch = path.match(/^\/api\/market\/agents\/([^/]+)$/);
  if (didMatch && req.method === "GET") {
    await handleGetAgent(deps, decodeURIComponent(didMatch[1]), res);
    return true;
  }

  return false;
}
