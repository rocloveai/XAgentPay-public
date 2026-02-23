import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Config } from "./config.js";
import { listOrders, getOrder } from "./services/order-store.js";
import type { Order } from "./types.js";

const AGENT_NAME = "Nexus Hotel Agent";
const PRIMARY_COLOR = "#059669";
const startedAt = Date.now();

interface Stats {
  readonly total: number;
  readonly unpaid: number;
  readonly paid: number;
  readonly expired: number;
  readonly totalAmount: string;
  readonly currency: string;
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
    totalCents += Math.round(parseFloat(order.quote_payload.amount) * 100);
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

function send404(res: ServerResponse): void {
  sendJson(res, 404, { error: "Not found" });
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function handleApiInfo(res: ServerResponse, config: Config): void {
  sendJson(res, 200, {
    name: AGENT_NAME,
    did: config.merchantDid,
    uptime: formatUptime(Date.now() - startedAt),
    started_at: new Date(startedAt).toISOString(),
  });
}

function handleApiOrders(res: ServerResponse): void {
  const orders = listOrders();
  sendJson(
    res,
    200,
    orders.map((o) => ({
      order_ref: o.order_ref,
      status: o.status,
      amount: o.quote_payload.amount,
      currency: o.quote_payload.currency,
      summary: o.quote_payload.context.summary,
      created_at: o.created_at,
    })),
  );
}

function handleApiOrderDetail(res: ServerResponse, ref: string): void {
  const order = getOrder(ref);
  if (!order) {
    sendJson(res, 404, { error: `Order "${ref}" not found` });
    return;
  }
  sendJson(res, 200, order);
}

function handleApiStats(res: ServerResponse): void {
  const stats = computeStats(listOrders());
  sendJson(res, 200, stats);
}

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
  let html = '<table><thead><tr><th>Order Ref</th><th>Status</th><th>Amount</th><th>Summary</th><th>Created</th></tr></thead><tbody>';
  for (const o of orders) {
    const bg = STATUS_COLORS[o.status] || "#64748b";
    html += '<tr class="clickable" onclick="toggleDetail(this)"><td>' + esc(o.order_ref) + '</td><td><span class="status-badge" style="background:' + bg + '">' + esc(o.status) + '</span></td><td>' + esc(o.amount + " " + o.currency) + '</td><td>' + esc(o.summary) + '</td><td>' + esc(new Date(o.created_at).toLocaleString()) + '</td></tr>';
    html += '<tr class="detail-row"><td colspan="5"><div data-ref="' + esc(o.order_ref) + '">Loading...</div></td></tr>';
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

function handleRequest(
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const path = url.pathname;

  if (path === "/" && req.method === "GET") {
    sendHtml(res, renderDashboard());
    return;
  }

  if (path === "/api/info" && req.method === "GET") {
    handleApiInfo(res, config);
    return;
  }

  if (path === "/api/orders" && req.method === "GET") {
    handleApiOrders(res);
    return;
  }

  if (path === "/api/stats" && req.method === "GET") {
    handleApiStats(res);
    return;
  }

  const orderMatch = path.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,64})$/);
  if (orderMatch && req.method === "GET") {
    handleApiOrderDetail(res, decodeURIComponent(orderMatch[1]));
    return;
  }

  send404(res);
}

export function startPortal(config: Config): void {
  const server = createServer((req, res) => handleRequest(config, req, res));

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[Portal] Port ${config.portalPort} is in use, portal disabled`,
      );
    } else {
      console.error("[Portal] Server error:", err);
    }
    server.close();
  });

  server.listen(config.portalPort, "127.0.0.1", () => {
    console.error(
      `[Portal] ${AGENT_NAME} dashboard at http://localhost:${config.portalPort}`,
    );
  });
}
