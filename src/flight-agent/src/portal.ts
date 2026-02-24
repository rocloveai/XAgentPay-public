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
import type { Order } from "./types.js";

const AGENT_NAME = "Nexus Flight Agent";
const ACCENT = "blue";
const startedAt = Date.now();

// ── SSE handler registry (injected by server.ts in HTTP mode) ───────────────

type SseHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<boolean>;

let sseHandler: SseHandler | null = null;

export function registerSseHandler(handler: SseHandler): void {
  sseHandler = handler;
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

function sendJson(res: ServerResponse, status: number, data: unknown): void {
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

function handleApiInfo(res: ServerResponse, config: Config): void {
  sendJson(res, 200, {
    name: AGENT_NAME,
    did: config.merchantDid,
    uptime: formatUptime(Date.now() - startedAt),
    started_at: new Date(startedAt).toISOString(),
  });
}

async function handleApiOrders(res: ServerResponse): Promise<void> {
  const orders = await listOrders();
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
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </div>
      <h1 class="text-lg font-semibold tracking-tight">${AGENT_NAME}</h1>
      <span class="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-full">
        <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full pulse-dot"></span>
        ONLINE
      </span>
    </div>
    <div class="text-sm text-slate-400 text-right space-y-0.5">
      <div id="did" class="font-mono text-xs"></div>
      <div id="uptime" class="text-xs"></div>
    </div>
  </div>
</header>

<!-- Stats -->
<div class="max-w-6xl mx-auto px-6 pt-6 pb-2">
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
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
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
const ACCENT = "${ACCENT}";
const STATUS_CLASSES = {
  UNPAID:  "bg-amber-400/15 text-amber-400",
  PAID:    "bg-emerald-400/15 text-emerald-400",
  EXPIRED: "bg-red-400/15 text-red-400",
};
const CHAIN_NAMES = { 84532: "Base Sepolia", 8453: "Base", 1: "Ethereum", 10: "Optimism" };

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
    '<td class="px-4 py-3 text-sm text-slate-500 line-through">' + esc(order.original_amount + ' ' + order.currency) + '</td>' +
    '<td class="px-4 py-3 text-sm font-semibold text-emerald-400">' + esc(order.pay_amount + ' ' + order.currency) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-300">' + esc(order.summary) + '</td>' +
    '<td class="px-4 py-3 text-sm text-slate-400">' + esc(new Date(order.created_at).toLocaleString()) + '</td>';

  const detailTr = document.createElement("tr");
  detailTr.setAttribute("data-detail-for", order.order_ref);
  detailTr.className = "hidden";
  detailTr.innerHTML = '<td colspan="6" class="p-0"><div class="px-4 py-4 bg-slate-850"></div></td>';

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

  const origCell = cells[2];
  const origText = order.original_amount + ' ' + order.currency;
  if (origCell.textContent !== origText) origCell.textContent = origText;

  const payCell = cells[3];
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
      tbody.prepend(frag);
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
  html += '<button onclick="this.nextElementSibling.classList.toggle(\'hidden\'); this.textContent = this.nextElementSibling.classList.contains(\'hidden\') ? \'\\u25B6 Show Raw JSON\' : \'\\u25BC Hide Raw JSON\'" class="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer">\\u25B6 Show Raw JSON</button>';
  html += '<pre class="hidden mt-2 bg-slate-950 text-slate-300 p-4 rounded-lg border border-slate-700 overflow-x-auto text-xs leading-relaxed">' + esc(JSON.stringify(order, null, 2)) + '</pre>';
  html += '</div>';

  return html;
}

function detailRow(label, value, extraClass) {
  return '<div class="flex justify-between items-start gap-4"><dt class="text-slate-500 shrink-0">' + esc(label) + '</dt><dd class="text-slate-300 text-right ' + (extraClass || '') + '">' + esc(value) + '</dd></div>';
}

// ── Refresh loop ──

async function refresh() {
  try {
    const [info, stats, orders] = await Promise.all([
      fetchJson("/api/info"),
      fetchJson("/api/stats"),
      fetchJson("/api/orders"),
    ]);
    document.getElementById("did").textContent = info.did;
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

  // MCP SSE routes (handled by server.ts when in HTTP mode)
  if (sseHandler && (path === "/sse" || path === "/messages")) {
    const handled = await sseHandler(req, res, url);
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
    handleApiInfo(res, config);
    return;
  }

  if (path === "/api/orders" && req.method === "GET") {
    await handleApiOrders(res);
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

  send404(res);
}

// ── Start portal ────────────────────────────────────────────────────────────

export function startPortal(config: Config): Server {
  const httpServer = createServer((req, res) => {
    handleRequest(config, req, res).catch((err) => {
      console.error("[Portal] Request error:", err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error" });
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
