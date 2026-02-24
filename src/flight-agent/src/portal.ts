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
const PRIMARY_COLOR = "#2563eb";
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
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; }
  .header { background: ${PRIMARY_COLOR}; color: white; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 22px; font-weight: 600; }
  .header .meta { font-size: 13px; opacity: 0.85; text-align: right; line-height: 1.6; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.2); }
  .container { max-width: 1100px; margin: 24px auto; padding: 0 16px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
  .stat-card .value { font-size: 32px; font-weight: 700; color: ${PRIMARY_COLOR}; }
  .stat-card .label { font-size: 13px; color: #64748b; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  th { background: #f1f5f9; text-align: left; padding: 12px 16px; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 12px 16px; border-top: 1px solid #f1f5f9; font-size: 14px; }
  tr.clickable { cursor: pointer; transition: background 0.15s; }
  tr.clickable:hover { background: #f8fafc; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }
  .detail-row { display: none; }
  .detail-row.open { display: table-row; }
  .detail-row td { background: #f8fafc; padding: 16px; }
  pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
  .empty { text-align: center; padding: 60px 20px; color: #94a3b8; }
  .empty h2 { font-size: 18px; margin-bottom: 8px; color: #64748b; }
  .refresh-hint { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 16px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${AGENT_NAME}</h1>
    <span class="badge" id="status-badge">ONLINE</span>
  </div>
  <div class="meta">
    <div id="did"></div>
    <div id="uptime"></div>
  </div>
</div>
<div class="container">
  <div class="stats" id="stats"></div>
  <div id="orders"></div>
  <div class="refresh-hint">Auto-refreshes every 5 seconds</div>
</div>
<script>
const PRIMARY = "${PRIMARY_COLOR}";
const STATUS_COLORS = { UNPAID: "#f59e0b", PAID: "#10b981", EXPIRED: "#ef4444" };

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function renderStats(s) {
  return [
    { label: "Total Orders", value: s.total },
    { label: "Unpaid", value: s.unpaid },
    { label: "Paid", value: s.paid },
    { label: "Expired", value: s.expired },
    { label: "Total Amount", value: s.totalAmount + " " + s.currency },
  ].map(c => '<div class="stat-card"><div class="value">' + esc(c.value) + '</div><div class="label">' + esc(c.label) + '</div></div>').join("");
}

function renderOrders(orders) {
  if (orders.length === 0) {
    return '<div class="empty"><h2>No orders yet</h2><p>Create orders via the MCP tools and they will appear here.</p></div>';
  }
  let html = '<table><thead><tr><th>Order Ref</th><th>Status</th><th>Original</th><th>Pay</th><th>Summary</th><th>Created</th></tr></thead><tbody>';
  for (const o of orders) {
    const bg = STATUS_COLORS[o.status] || "#64748b";
    html += '<tr class="clickable" onclick="toggleDetail(this)"><td>' + esc(o.order_ref) + '</td><td><span class="status-badge" style="background:' + bg + '">' + esc(o.status) + '</span></td><td style="text-decoration:line-through;color:#94a3b8">' + esc(o.original_amount + " " + o.currency) + '</td><td style="font-weight:600;color:#10b981">' + esc(o.pay_amount + " " + o.currency) + '</td><td>' + esc(o.summary) + '</td><td>' + esc(new Date(o.created_at).toLocaleString()) + '</td></tr>';
    html += '<tr class="detail-row"><td colspan="6"><div data-ref="' + esc(o.order_ref) + '">Loading...</div></td></tr>';
  }
  html += '</tbody></table>';
  return html;
}

async function toggleDetail(row) {
  const detailRow = row.nextElementSibling;
  if (detailRow.classList.contains("open")) {
    detailRow.classList.remove("open");
    return;
  }
  detailRow.classList.add("open");
  const ref = row.children[0].textContent;
  try {
    const data = await fetchJson("/api/orders/" + encodeURIComponent(ref));
    detailRow.querySelector("td div").innerHTML = '<pre>' + JSON.stringify(data, null, 2).replace(/</g, "&lt;") + '</pre>';
  } catch {
    detailRow.querySelector("td div").textContent = "Failed to load details";
  }
}

async function refresh() {
  try {
    const [info, stats, orders] = await Promise.all([
      fetchJson("/api/info"),
      fetchJson("/api/stats"),
      fetchJson("/api/orders"),
    ]);
    document.getElementById("did").textContent = "DID: " + info.did;
    document.getElementById("uptime").textContent = "Uptime: " + info.uptime;
    document.getElementById("stats").innerHTML = renderStats(stats);
    document.getElementById("orders").innerHTML = renderOrders(orders);
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
