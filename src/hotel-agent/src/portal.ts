import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { listOrders, getOrder } from "./services/order-store.js";
import {
  verifyWebhookSignature,
  handleWebhookEvent,
} from "./services/webhook-handler.js";
import type { WebhookPayload } from "./types.js";
import type { Order } from "./types.js";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  http,
  type Hex,
  formatUnits,
  erc20Abi,
} from "viem";

const AGENT_NAME = "Nexus Hotel Agent";
const ACCENT = "emerald";
const startedAt = Date.now();

// ── SSE handler registry (injected by server.ts in HTTP mode) ───────────────

type SseHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<boolean>;

type StatelessHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<boolean>;

let sseHandler: SseHandler | null = null;
let statelessHandler: StatelessHandler | null = null;

export function registerSseHandler(handler: SseHandler): void {
  sseHandler = handler;
}

export function registerStatelessHandler(handler: StatelessHandler): void {
  statelessHandler = handler;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Stats {
  readonly total: number;
  readonly unpaid: number;
  readonly paid: number;
  readonly expired: number;
  readonly totalAmount: string;
  readonly currency: string;
}

const USDC_DECIMALS = 6;

/** Convert uint256 string (e.g. "373120000") back to human-readable (e.g. "373.12") */
function fromUint256(raw: string, decimals: number = USDC_DECIMALS): string {
  const padded = raw.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals) || "0";
  const fracPart = padded.slice(-decimals).replace(/0+$/, "") || "0";
  return `${intPart}.${fracPart}`;
}

function computeStats(orders: readonly Order[]): Stats {
  let unpaid = 0;
  let paid = 0;
  let expired = 0;
  let totalCents = 0;

  for (const order of orders) {
    if (order.status === "UNPAID") unpaid++;
    else if (order.status === "PAID") paid++;
    else if (order.status === "EXPIRED") expired++;
    const readable = fromUint256(order.quote_payload.amount);
    totalCents += Math.round(parseFloat(readable) * 100);
  }

  return {
    total: orders.length,
    unpaid,
    paid,
    expired,
    totalAmount: (totalCents / 100).toFixed(2),
    currency: "USDC",
  };
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendText(
  res: ServerResponse,
  text: string,
  contentType: string,
): void {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(text);
}

function send404(res: ServerResponse): void {
  sendJson(res, 404, { error: "Not found" });
}

function loadSkillMd(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const skillPath = resolve(currentDir, "..", "skill.md");
  return readFileSync(skillPath, "utf-8");
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// ── API handlers ────────────────────────────────────────────────────────────

async function handleApiInfo(
  res: ServerResponse,
  config: Config,
): Promise<void> {
  let signerAddress = "-";
  let balanceFormatted = "";

  try {
    if (config.signerPrivateKey) {
      signerAddress = privateKeyToAccount(
        (config.signerPrivateKey || "0x") as Hex,
      ).address;
    }
  } catch (e) { }

  try {
    if (config.paymentAddress) {
      const publicClient = createPublicClient({
        transport: http("https://devnet3openapi.platon.network/rpc"),
      });
      const bal = await publicClient.readContract({
        address: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [config.paymentAddress as Hex],
      });
      balanceFormatted =
        parseFloat(formatUnits(bal as bigint, 6)).toFixed(2) + " USDC";
    }
  } catch (e) {
    console.error("[USDC Balance Error]:", e);
    balanceFormatted = "RPC Error";
  }

  sendJson(res, 200, {
    name: AGENT_NAME,
    did: config.merchantDid,
    payment_address: config.paymentAddress || "-",
    signer_address: signerAddress,
    balance: balanceFormatted,
    uptime: formatUptime(Date.now() - startedAt),
    started_at: new Date(startedAt).toISOString(),
  });
}

async function handleApiOrders(res: ServerResponse, url: URL): Promise<void> {
  const dbOrders = await listOrders();
  let orders = [...dbOrders];

  // Apply sorting: newest first (descending created_at)
  orders.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Apply filtering: by status
  const filterStatus = url.searchParams.get("status");
  if (filterStatus && filterStatus !== "ALL") {
    orders = orders.filter((o) => o.status === filterStatus);
  }
  sendJson(
    res,
    200,
    orders.map((o) => ({
      order_ref: o.order_ref,
      status: o.status,
      original_amount: o.quote_payload.context.original_amount
        ? fromUint256(o.quote_payload.context.original_amount)
        : fromUint256(o.quote_payload.amount),
      pay_amount: fromUint256(o.quote_payload.amount),
      currency: o.quote_payload.currency,
      summary: o.quote_payload.context.summary,
      payer_wallet: o.payer_wallet ?? null,
      created_at: o.created_at,
    })),
  );
}

async function handleApiOrderDetail(
  res: ServerResponse,
  ref: string,
): Promise<void> {
  const order = await getOrder(ref);
  if (!order) {
    sendJson(res, 404, { error: `Order "${ref}" not found` });
    return;
  }
  sendJson(res, 200, order);
}

async function handleApiStats(res: ServerResponse): Promise<void> {
  const orders = await listOrders();
  const stats = computeStats(orders);
  sendJson(res, 200, stats);
}

// ── Dashboard HTML ──────────────────────────────────────────────────────────

function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${AGENT_NAME} Portal</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] }
    }
  }
}
</script>
<style>
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.2s ease-out; }
  @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
</style>
</head>
<body class="bg-slate-900 text-slate-50 min-h-screen font-sans antialiased">

<!-- Header -->
<header class="border-b border-slate-800 px-6 py-4">
  <div class="max-w-6xl mx-auto flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-${ACCENT}-500/20 flex items-center justify-center">
        <svg class="w-5 h-5 text-${ACCENT}-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
        </svg>
      </div>
      <h1 class="text-lg font-semibold tracking-tight">${AGENT_NAME}</h1>
      <span class="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-full">
        <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full pulse-dot"></span>
        ONLINE
      </span>
    </div>
    <div class="flex flex-col items-end gap-1.5">
      <div id="did" class="font-mono text-xs text-slate-400"></div>
      <div class="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-3">
        <div class="bg-slate-800/80 rounded-md border border-slate-700/50 flex items-center px-2 py-1 hover:border-slate-500/50 transition-colors cursor-pointer shadow-sm" id="signer-address-container" title="Signer Address">
          <span class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mr-2">Sig</span>
          <span id="signer-address" class="font-mono text-xs text-slate-300"></span>
        </div>
        <div class="bg-slate-800/80 rounded-md border border-slate-700/50 flex items-center px-2 py-1 hover:border-slate-500/50 transition-colors cursor-pointer shadow-sm" id="payment-address-container" title="Payment Address">
          <span class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mr-2">Rcv</span>
          <span id="payment-address" class="font-mono text-xs text-slate-300"></span>
          <span id="payment-balance" class="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-2"></span>
        </div>
      </div>
      <div id="uptime" class="text-[10px] text-slate-500 mt-0.5"></div>
    </div>
  </div>
</header>

<!-- Main Dashboard -->
<main class="max-w-6xl mx-auto p-6 space-y-8">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold flex items-center gap-2">
      <svg class="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
      Orders
    </h2>
    <div class="flex items-center gap-2">
      <label for="status-filter" class="text-xs text-slate-400 uppercase font-semibold">Status:</label>
      <select id="status-filter" class="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-1.5" onchange="refresh()">
        <option value="ALL">All</option>
        <option value="UNPAID">UNPAID</option>
        <option value="PAID">PAID</option>
        <option value="EXPIRED">EXPIRED</option>
      </select>
    </div>
  </div>


</main>

<!-- Install -->
<div class="max-w-6xl mx-auto px-6 pt-6 pb-2">
  <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
    <button id="install-toggle" class="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-700/30 transition-colors cursor-pointer">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-${ACCENT}-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
        <span class="text-sm font-semibold text-slate-300">Setup &amp; Installation</span>
      </div>
      <svg id="install-chevron" class="w-4 h-4 text-slate-500 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
      </svg>
    </button>
    <div id="install-body" class="hidden border-t border-slate-700">
      <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- MCP Config -->
        <div>
          <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">MCP Connection (Claude Desktop / Cursor)</h4>
          <div class="relative">
            <pre id="mcp-config" class="bg-slate-950 text-slate-300 p-4 rounded-lg border border-slate-700 text-xs leading-relaxed overflow-x-auto"></pre>
            <button id="copy-config" class="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-600 transition-colors" title="Copy to clipboard">
              <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            </button>
          </div>
        </div>
        <!-- Skill File & Links -->
        <div>
          <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Resources</h4>
          <div class="space-y-3">
            <a href="/skill.md" target="_blank" class="flex items-center gap-2 bg-slate-950 rounded-lg border border-slate-700 p-3 hover:border-${ACCENT}-500/50 transition-colors">
              <svg class="w-4 h-4 text-${ACCENT}-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div>
                <div class="text-sm font-medium text-slate-300">skill.md</div>
                <div class="text-xs text-slate-500">Full agent capability manifest &amp; API documentation</div>
              </div>
            </a>
            <div class="bg-slate-950 rounded-lg border border-slate-700 p-3">
              <div class="text-xs text-slate-500 mb-1">SSE Endpoint</div>
              <code id="sse-url" class="text-xs text-${ACCENT}-400 font-mono break-all"></code>
            </div>
            <div class="bg-slate-950 rounded-lg border border-slate-700 p-3">
              <div class="text-xs text-slate-500 mb-1">Protocol</div>
              <span class="text-xs text-slate-300">NUPS/1.5 &middot; Chain 20250407 &middot; USDC</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Stats -->
<div class="max-w-6xl mx-auto px-6 pt-4 pb-2">
  <div class="grid grid-cols-2 md:grid-cols-5 gap-4" id="stats">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-slate-50" data-stat="total">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total Orders</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-amber-400" data-stat="unpaid">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Unpaid</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-emerald-400" data-stat="paid">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Paid</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-red-400" data-stat="expired">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Expired</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-${ACCENT}-400" data-stat="totalAmount">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total Volume</div>
    </div>
  </div>
</div>

<!-- Orders -->
<div class="max-w-6xl mx-auto px-6 py-4">
  <div id="orders-wrapper">
    <div id="empty-state" class="bg-slate-800 rounded-xl border border-slate-700 p-16 text-center">
      <div class="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
        </svg>
      </div>
      <h2 class="text-base font-medium text-slate-300 mb-1">No orders yet</h2>
      <p class="text-sm text-slate-500">Create orders via the MCP tools and they will appear here.</p>
    </div>
    <div id="orders-table" class="hidden bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-slate-700">
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Order Ref</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Payer</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Original</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pay</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Summary</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
          </tr>
        </thead>
        <tbody id="order-tbody"></tbody>
      </table>
    </div>
  </div>
  <div class="text-center text-xs text-slate-600 mt-4">Auto-refreshes every 5 seconds</div>
</div>

<script>
// ── Install panel ──
var sseUrl = window.location.origin + "/sse";
var mcpConfig = JSON.stringify({ mcpServers: { "hotel-agent": { url: sseUrl } } }, null, 2);
document.getElementById("mcp-config").textContent = mcpConfig;
document.getElementById("sse-url").textContent = sseUrl;

document.getElementById("install-toggle").addEventListener("click", function() {
  var body = document.getElementById("install-body");
  var chevron = document.getElementById("install-chevron");
  body.classList.toggle("hidden");
  chevron.style.transform = body.classList.contains("hidden") ? "" : "rotate(180deg)";
});

document.getElementById("copy-config").addEventListener("click", function() {
  navigator.clipboard.writeText(mcpConfig).then(function() {
    var btn = document.getElementById("copy-config");
    btn.innerHTML = '<svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>';
    setTimeout(function() {
      btn.innerHTML = '<svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>';
    }, 2000);
  });
});

const ACCENT = "${ACCENT}";
const STATUS_CLASSES = {
  UNPAID:  "bg-amber-400/15 text-amber-400",
  PAID:    "bg-emerald-400/15 text-emerald-400",
  EXPIRED: "bg-red-400/15 text-red-400",
};
const CHAIN_NAMES = { 84532: "Base Sepolia", 8453: "Base", 1: "Ethereum", 10: "Optimism", 20250407: "PlatON Devnet" };

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// ── Targeted DOM updates (no innerHTML replacement) ──

function updateStats(stats) {
  const mapping = {
    total: String(stats.total),
    unpaid: String(stats.unpaid),
    paid: String(stats.paid),
    expired: String(stats.expired),
    totalAmount: stats.totalAmount + " " + stats.currency,
  };
  for (const [key, val] of Object.entries(mapping)) {
    const el = document.querySelector('[data-stat="' + key + '"]');
    if (el && el.textContent !== val) {
      el.textContent = val;
    }
  }
}

function truncAddr(addr) {
  if (!addr) return "-";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function statusBadgeHtml(status) {
  const cls = STATUS_CLASSES[status] || "bg-slate-500/15 text-slate-400";
  return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ' + cls + '">' + esc(status) + '</span>';
}

function createOrderRow(order) {
  const tr = document.createElement("tr");
  tr.setAttribute("data-ref", order.order_ref);
  tr.className = "border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/30 transition-colors";
  tr.onclick = function() { toggleDetail(this); };
  tr.innerHTML =
    '<td class="px-4 py-3 font-mono text-sm text-slate-300">' + esc(order.order_ref) + '</td>' +
    '<td class="px-4 py-3">' + statusBadgeHtml(order.status) + '</td>' +
    '<td class="px-4 py-3 font-mono text-xs text-slate-400" title="' + esc(order.payer_wallet || '') + '">' + esc(truncAddr(order.payer_wallet)) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-500 line-through">' + esc(order.original_amount + ' ' + order.currency) + '</td>' +
    '<td class="px-4 py-3 text-sm font-semibold text-emerald-400">' + esc(order.pay_amount + ' ' + order.currency) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-300">' + esc(order.summary) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-400">' + esc(new Date(order.created_at).toLocaleString()) + '</td>';

  const detailTr = document.createElement("tr");
  detailTr.setAttribute("data-detail-for", order.order_ref);
  detailTr.className = "hidden";
  detailTr.innerHTML = '<td colspan="7" class="p-0"><div class="px-4 py-4 bg-slate-850"></div></td>';

  const frag = document.createDocumentFragment();
  frag.appendChild(tr);
  frag.appendChild(detailTr);
  return frag;
}

function patchRow(row, order) {
  const cells = row.children;
  const statusCell = cells[1];
  const newBadge = statusBadgeHtml(order.status);
  if (statusCell.innerHTML !== newBadge) statusCell.innerHTML = newBadge;

  const payerCell = cells[2];
  const payerText = truncAddr(order.payer_wallet);
  if (payerCell.textContent !== payerText) payerCell.textContent = payerText;

  const origCell = cells[3];
  const origText = order.original_amount + ' ' + order.currency;
  if (origCell.textContent !== origText) origCell.textContent = origText;

  const payCell = cells[4];
  const payText = order.pay_amount + ' ' + order.currency;
  if (payCell.textContent !== payText) payCell.textContent = payText;
}

function updateOrders(newOrders) {
  const empty = document.getElementById("empty-state");
  const table = document.getElementById("orders-table");
  const tbody = document.getElementById("order-tbody");

  if (newOrders.length === 0) {
    empty.classList.remove("hidden");
    table.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");

  const seen = new Set();

  for (const order of newOrders) {
    seen.add(order.order_ref);
    const existing = tbody.querySelector('tr[data-ref="' + order.order_ref + '"]');
    if (existing) {
      patchRow(existing, order);
    } else {
      const frag = createOrderRow(order);
      tbody.appendChild(frag);
    }
  }

  // Remove stale rows (but preserve detail state during removal)
  tbody.querySelectorAll("tr[data-ref]").forEach(function(row) {
    if (!seen.has(row.dataset.ref)) {
      const detail = row.nextElementSibling;
      if (detail && detail.hasAttribute("data-detail-for")) detail.remove();
      row.remove();
    }
  });
}

// ── Order detail panel ──

async function toggleDetail(row) {
  const ref = row.dataset.ref;
  const detailRow = row.nextElementSibling;
  if (!detailRow || detailRow.getAttribute("data-detail-for") !== ref) return;

  if (!detailRow.classList.contains("hidden")) {
    detailRow.classList.add("hidden");
    return;
  }

  detailRow.classList.remove("hidden");
  const container = detailRow.querySelector("td > div");

  // Already loaded? Just toggle visibility
  if (container.hasAttribute("data-loaded")) return;

  container.innerHTML = '<div class="flex items-center gap-2 text-slate-400 text-sm"><svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading...</div>';

  try {
    const data = await fetchJson("/api/orders/" + encodeURIComponent(ref));
    container.setAttribute("data-loaded", "1");
    container.innerHTML = renderDetailPanel(data);
  } catch {
    container.innerHTML = '<div class="text-red-400 text-sm">Failed to load order details</div>';
  }
}

function renderDetailPanel(order) {
  const q = order.quote_payload;
  const chainName = CHAIN_NAMES[q.chain_id] || ("Chain " + q.chain_id);
  const expiry = new Date(q.expiry * 1000).toLocaleString();
  const statusCls = STATUS_CLASSES[order.status] || "";

  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 fade-in">';

  // Payment Details card
  html += '<div class="bg-slate-900/50 rounded-lg border border-slate-700 p-4">';
  html += '<h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Payment Details</h4>';
  html += '<dl class="space-y-2 text-sm">';
  html += detailRow("Merchant DID", q.merchant_did, "font-mono text-xs break-all");
  html += detailRow("Payer Wallet", order.payer_wallet || q.context.payer_wallet || "-", "font-mono text-xs break-all");
  html += detailRow("Order Ref", q.merchant_order_ref, "font-mono");
  html += detailRow("Chain", chainName + ' (' + q.chain_id + ')');
  html += detailRow("Currency", q.currency);
  html += detailRow("Expiry", expiry);
  html += '<div class="flex justify-between items-center"><dt class="text-slate-500">Status</dt><dd><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ' + statusCls + '">' + esc(order.status) + '</span></dd></div>';
  html += '</dl></div>';

  // Line Items card
  html += '<div class="bg-slate-900/50 rounded-lg border border-slate-700 p-4">';
  html += '<h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Line Items</h4>';
  html += '<table class="w-full text-sm"><thead><tr class="text-slate-500"><th class="text-left pb-2 font-medium">Item</th><th class="text-right pb-2 font-medium">Qty</th><th class="text-right pb-2 font-medium">Amount</th></tr></thead><tbody>';

  for (const item of (q.context.line_items || [])) {
    html += '<tr class="border-t border-slate-700/50"><td class="py-1.5 text-slate-300">' + esc(item.name) + '</td><td class="py-1.5 text-right text-slate-400">' + esc(item.qty) + '</td><td class="py-1.5 text-right text-slate-300">' + esc(item.amount) + '</td></tr>';
  }

  html += '</tbody></table></div>';
  html += '</div>';

  // Raw JSON toggle
  html += '<div class="mt-3">';
  html += '<button data-toggle-json class="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">\\u25B6 Show Raw JSON</button>';
  html += '<pre class="hidden mt-2 bg-slate-950 text-slate-300 p-4 rounded-lg border border-slate-700 overflow-x-auto text-xs leading-relaxed">' + esc(JSON.stringify(order, null, 2)) + '</pre>';
  html += '</div>';

  return html;
}

function detailRow(label, value, extraClass) {
  return '<div class="flex justify-between items-start gap-4"><dt class="text-slate-500 shrink-0">' + esc(label) + '</dt><dd class="text-slate-300 text-right ' + (extraClass || '') + '">' + esc(value) + '</dd></div>';
}

// ── Delegated event: JSON toggle button ──

document.addEventListener("click", function(e) {
  var btn = e.target.closest("[data-toggle-json]");
  if (!btn) return;
  var pre = btn.nextElementSibling;
  if (!pre) return;
  pre.classList.toggle("hidden");
  btn.textContent = pre.classList.contains("hidden") ? "\\u25B6 Show Raw JSON" : "\\u25BC Hide Raw JSON";
});

// ── Refresh loop ──

async function refresh() {
  try {
    const statusFilter = document.getElementById("status-filter") ? document.getElementById("status-filter").value : "ALL";
    const [info, stats, orders] = await Promise.all([
      fetchJson("/api/info"),
      fetchJson("/api/stats"),
      fetchJson("/api/orders?status=" + encodeURIComponent(statusFilter)),
    ]);
    document.getElementById("did").textContent = info.did;
    document.getElementById("signer-address").textContent = truncAddr(info.signer_address);
    document.getElementById("signer-address-container").title = "Signer: " + info.signer_address;
    document.getElementById("payment-address").textContent = truncAddr(info.payment_address);
    document.getElementById("payment-address-container").title = "Receiver: " + info.payment_address;
    if (info.balance) {
      document.getElementById("payment-balance").textContent = info.balance;
    }
    document.getElementById("uptime").textContent = "Uptime: " + info.uptime;
    updateStats(stats);
    updateOrders(orders);
  } catch (e) {
    console.error("Refresh failed:", e);
  }
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}

// ── Webhook handler ─────────────────────────────────────────────────────────

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function handleWebhook(
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const rawBody = await readBody(req);

  const sig = req.headers["x-nexus-signature"] as string | undefined;
  const ts = req.headers["x-nexus-timestamp"] as string | undefined;

  const result = verifyWebhookSignature(config.webhookSecret, rawBody, sig, ts);
  if (!result.valid) {
    console.error(`[Webhook] Rejected: ${result.reason}`);
    sendJson(res, 401, { error: "Unauthorized", reason: result.reason });
    return;
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return;
  }

  const handleResult = await handleWebhookEvent(payload);
  sendJson(res, 200, handleResult);
}

// ── Request router ──────────────────────────────────────────────────────────

async function handleRequest(
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const path = url.pathname;

  // Health check
  if (path === "/health" && req.method === "GET") {
    sendJson(res, 200, { status: "ok", sseHandler: !!sseHandler });
    return;
  }

  // MCP SSE routes (handled by server.ts when in HTTP mode)
  if (path === "/sse" || path === "/messages") {
    if (!sseHandler) {
      sendJson(res, 503, {
        error:
          "SSE handler not registered. TRANSPORT may not be set to 'http'.",
        transport: process.env.TRANSPORT ?? "(unset)",
      });
      return;
    }
    const handled = await sseHandler(req, res, url);
    if (handled) return;
  }

  // Stateless REST API route
  if (path === "/api/v1/call-tool" && req.method === "POST") {
    if (!statelessHandler) {
      sendJson(res, 503, { error: "Stateless handler not registered." });
      return;
    }
    const handled = await statelessHandler(req, res, url);
    if (handled) return;
  }

  if (path === "/" && req.method === "GET") {
    sendHtml(res, renderDashboard());
    return;
  }

  if (path === "/skill.md" && req.method === "GET") {
    try {
      const content = loadSkillMd();
      sendText(res, content, "text/markdown; charset=utf-8");
    } catch {
      sendJson(res, 500, { error: "skill.md not found" });
    }
    return;
  }

  if (path === "/api/info" && req.method === "GET") {
    await handleApiInfo(res, config);
    return;
  }

  if (path === "/api/orders" && req.method === "GET") {
    await handleApiOrders(res, url);
    return;
  }

  if (path === "/api/stats" && req.method === "GET") {
    await handleApiStats(res);
    return;
  }

  const orderMatch = path.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,64})$/);
  if (orderMatch && req.method === "GET") {
    await handleApiOrderDetail(res, decodeURIComponent(orderMatch[1]));
    return;
  }

  if (path === "/webhook" && req.method === "POST") {
    await handleWebhook(config, req, res);
    return;
  }

  send404(res);
}

// ── Start portal ────────────────────────────────────────────────────────────

export function startPortal(config: Config): Server {
  const httpServer = createServer((req, res) => {
    handleRequest(config, req, res).catch((err) => {
      console.error("[Portal] Request error:", err);
      if (!res.headersSent) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 500, {
          error: "Internal server error",
          detail: message,
          path: req.url,
        });
      }
    });
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[Portal] Port ${config.portalPort} is in use, portal disabled`,
      );
    } else {
      console.error("[Portal] Server error:", err);
    }
    httpServer.close();
  });

  const host = process.env.PORTAL_HOST ?? "0.0.0.0";
  httpServer.listen(config.portalPort, host, () => {
    console.error(
      `[Portal] ${AGENT_NAME} dashboard at http://localhost:${config.portalPort}`,
    );
  });

  return httpServer;
}
