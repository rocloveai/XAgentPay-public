/**
 * xNexus Core — Portal Dashboard.
 *
 * Serves an HTML dashboard and JSON API endpoints for monitoring
 * payments, relayer status, and system health.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PaymentRepository } from "./db/interfaces/payment-repo.js";
import type { EventRepository } from "./db/interfaces/event-repo.js";
import type { GroupRepository } from "./db/interfaces/group-repo.js";
import type { NexusRelayer } from "./services/relayer.js";
import type { PaymentStatus } from "./types.js";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface PortalDeps {
  readonly paymentRepo: PaymentRepository;
  readonly eventRepo: EventRepository;
  readonly groupRepo: GroupRepository;
  readonly relayer: NexusRelayer | null;
  readonly escrowContract: string;
  readonly chainId: number;
  readonly version: string;
  readonly portalToken: string;
}

function isAuthorized(deps: PortalDeps, req: IncomingMessage): boolean {
  if (!deps.portalToken) return true;
  const authHeader = req.headers.authorization ?? "";
  return authHeader === `Bearer ${deps.portalToken}`;
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
  });
  res.end(body);
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const USDC_DECIMALS = 6;

function formatAmount(raw: string): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS;
  return n.toFixed(USDC_DECIMALS);
}

function formatLat(wei: bigint): string {
  const whole = wei / 1_000_000_000_000_000_000n;
  const frac = wei % 1_000_000_000_000_000_000n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${fracStr}`;
}

// ---------------------------------------------------------------------------
// API Handlers
// ---------------------------------------------------------------------------

async function handleApiPayments(
  deps: PortalDeps,
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const statusFilter = url.searchParams.get("status") as PaymentStatus | null;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  const payments = await deps.paymentRepo.findAll({
    status: statusFilter ?? undefined,
    limit,
    offset,
  });

  sendJson(
    res,
    200,
    payments.map((p) => ({
      nexus_payment_id: p.nexus_payment_id,
      group_id: p.group_id,
      status: p.status,
      amount: p.amount,
      amount_display: p.amount_display,
      currency: p.currency,
      merchant_did: p.merchant_did,
      merchant_order_ref: p.merchant_order_ref,
      payer_wallet: p.payer_wallet,
      payment_method: p.payment_method,
      tx_hash: p.tx_hash,
      created_at: p.created_at,
      settled_at: p.settled_at,
      completed_at: p.completed_at,
    })),
  );
}

async function handleApiPaymentDetail(
  deps: PortalDeps,
  paymentId: string,
  res: ServerResponse,
): Promise<void> {
  const payment = await deps.paymentRepo.findById(paymentId);
  if (!payment) {
    sendJson(res, 404, { error: "Payment not found" });
    return;
  }

  const events = await deps.eventRepo.findByPaymentId(paymentId);

  sendJson(res, 200, {
    payment,
    events: events.map((e) => ({
      event_id: e.event_id,
      event_type: e.event_type,
      from_status: e.from_status,
      to_status: e.to_status,
      metadata: e.metadata,
      created_at: e.created_at,
    })),
  });
}

async function handleApiStats(
  deps: PortalDeps,
  res: ServerResponse,
): Promise<void> {
  const [counts, totalVolume] = await Promise.all([
    deps.paymentRepo.countByStatus(),
    deps.paymentRepo.sumTotalAmount(),
  ]);

  const statusCounts: Record<string, number> = {};
  let total = 0;
  for (const [status, count] of counts) {
    statusCounts[status] = count;
    total += count;
  }

  sendJson(res, 200, {
    counts: statusCounts,
    total,
    total_volume: totalVolume,
    total_volume_display: formatAmount(totalVolume),
  });
}

async function handleApiRelayer(
  deps: PortalDeps,
  res: ServerResponse,
): Promise<void> {
  if (!deps.relayer) {
    sendJson(res, 200, { configured: false });
    return;
  }

  try {
    const address = deps.relayer.getAddress();
    const balance = await deps.relayer.getRelayerBalance();

    sendJson(res, 200, {
      configured: true,
      address,
      lat_balance_wei: balance.toString(),
      lat_balance: formatLat(balance),
      escrow_contract: deps.escrowContract,
      chain_id: deps.chainId,
      low_balance: balance < 1_000_000_000_000_000n,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 200, {
      configured: true,
      error: message,
    });
  }
}

async function handleApiGroups(
  deps: PortalDeps,
  res: ServerResponse,
): Promise<void> {
  const groups = await deps.groupRepo.findAll({ limit: 50 });

  sendJson(
    res,
    200,
    groups.map((g) => ({
      group_id: g.group_id,
      status: g.status,
      total_amount: g.total_amount,
      total_amount_display: g.total_amount_display,
      currency: g.currency,
      payer_wallet: g.payer_wallet,
      payment_count: g.payment_count,
      tx_hash: g.tx_hash,
      created_at: g.created_at,
    })),
  );
}

async function handleApiGroupDetail(
  deps: PortalDeps,
  groupId: string,
  res: ServerResponse,
): Promise<void> {
  const group = await deps.groupRepo.findById(groupId);
  if (!group) {
    sendJson(res, 404, { error: "Group not found" });
    return;
  }

  const payments = await deps.paymentRepo.findByGroupId(groupId);

  sendJson(res, 200, {
    group,
    payments: payments.map((p) => ({
      nexus_payment_id: p.nexus_payment_id,
      status: p.status,
      amount: p.amount,
      amount_display: p.amount_display,
      merchant_did: p.merchant_did,
      merchant_order_ref: p.merchant_order_ref,
      tx_hash: p.tx_hash,
      created_at: p.created_at,
    })),
  });
}

// ---------------------------------------------------------------------------
// Dashboard HTML
// ---------------------------------------------------------------------------

function renderDashboard(version: string, portalToken: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XAgent Core Dashboard</title>
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
  <div class="max-w-7xl mx-auto flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center">
        <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      </div>
      <h1 class="text-lg font-semibold tracking-tight">XAgent Core</h1>
      <span class="text-xs text-slate-500">v${version}</span>
      <span class="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-full">
        <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full pulse-dot"></span>
        ONLINE
      </span>
    </div>
    <nav class="flex items-center gap-5">
      <a href="/market" class="text-sm text-slate-400 hover:text-white transition-colors">Marketplace</a>
    </nav>
  </div>
</header>

<!-- Stats -->
<main class="max-w-7xl mx-auto p-6 space-y-6">
  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4" id="stats">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-slate-50" data-stat="total">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Total</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-amber-400" data-stat="ESCROWED">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Escrowed</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-blue-400" data-stat="SETTLED">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Settled</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-emerald-400" data-stat="COMPLETED">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Completed</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-orange-400" data-stat="DISPUTE_OPEN">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Disputed</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-red-400" data-stat="REFUNDED">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Refunded</div>
    </div>
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
      <div class="text-2xl font-bold text-indigo-400" data-stat="volume">-</div>
      <div class="text-xs text-slate-400 mt-1 uppercase tracking-wider">Volume</div>
    </div>
  </div>

  <!-- Relayer Card -->
  <div id="relayer-card" class="bg-slate-800 rounded-xl border border-slate-700 p-5 hidden">
    <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Relayer</h3>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
      <div>
        <div class="text-xs text-slate-500">Address</div>
        <div id="relayer-address" class="font-mono text-xs text-slate-300 break-all">-</div>
      </div>
      <div>
        <div class="text-xs text-slate-500">LAT Balance</div>
        <div id="relayer-balance" class="font-mono text-sm text-slate-300">-</div>
      </div>
      <div>
        <div class="text-xs text-slate-500">Escrow Contract</div>
        <div id="relayer-contract" class="font-mono text-xs text-slate-300 break-all">-</div>
      </div>
      <div>
        <div class="text-xs text-slate-500">Status</div>
        <div id="relayer-status" class="text-sm">-</div>
      </div>
    </div>
  </div>

  <!-- Tab Switcher -->
  <div class="flex items-center gap-1 border-b border-slate-700">
    <button id="tab-groups" onclick="switchTab('groups')" class="px-4 py-2.5 text-sm font-medium border-b-2 border-indigo-500 text-indigo-400 cursor-pointer">Groups</button>
    <button id="tab-payments" onclick="switchTab('payments')" class="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 cursor-pointer">Payments</button>
  </div>

  <!-- Groups View -->
  <div id="view-groups">
    <div id="groups-empty" class="bg-slate-800 rounded-xl border border-slate-700 p-16 text-center">
      <h2 class="text-base font-medium text-slate-300 mb-1">No groups yet</h2>
      <p class="text-sm text-slate-500">Payment groups will appear here once orchestrated.</p>
    </div>
    <div id="groups-list" class="hidden space-y-3"></div>
  </div>

  <!-- Payments View -->
  <div id="view-payments" class="hidden">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold">All Payments</h2>
      <div class="flex items-center gap-2">
        <label for="status-filter" class="text-xs text-slate-400 uppercase font-semibold">Status:</label>
        <select id="status-filter" class="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded focus:ring-indigo-500 focus:border-indigo-500 p-1.5 cursor-pointer" onchange="refresh()">
          <option value="">All</option>
          <option value="CREATED">CREATED</option>
          <option value="AWAITING_TX">AWAITING_TX</option>
          <option value="BROADCASTED">BROADCASTED</option>
          <option value="ESCROWED">ESCROWED</option>
          <option value="SETTLED">SETTLED</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="EXPIRED">EXPIRED</option>
          <option value="TX_FAILED">TX_FAILED</option>
          <option value="REFUNDED">REFUNDED</option>
          <option value="DISPUTE_OPEN">DISPUTE_OPEN</option>
          <option value="DISPUTE_RESOLVED">DISPUTE_RESOLVED</option>
        </select>
      </div>
    </div>

    <div id="payments-wrapper">
      <div id="empty-state" class="bg-slate-800 rounded-xl border border-slate-700 p-16 text-center">
        <h2 class="text-base font-medium text-slate-300 mb-1">No payments yet</h2>
        <p class="text-sm text-slate-500">Payments will appear here once orchestrated.</p>
      </div>
      <div id="payments-table" class="hidden bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table class="w-full">
          <thead>
            <tr class="border-b border-slate-700">
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment ID</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Group</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Merchant</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody id="payments-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Detail Panel -->
  <div id="detail-panel" class="hidden bg-slate-800 rounded-xl border border-indigo-500/30 p-5 fade-in">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider">Payment Detail</h3>
      <button onclick="closeDetail()" class="text-slate-500 hover:text-slate-300 cursor-pointer">&times;</button>
    </div>
    <div id="detail-content"></div>
  </div>

  <div class="text-center text-xs text-slate-600 mt-4">Auto-refreshes every 5 seconds</div>
</main>

<script>
var PORTAL_TOKEN = "${portalToken.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/`/g, "\\`").replace(/\$/g, "\\$")}";
var STATUS_CLASSES = {
  CREATED: "bg-slate-500/15 text-slate-400",
  AWAITING_TX: "bg-yellow-500/15 text-yellow-400",
  BROADCASTED: "bg-blue-500/15 text-blue-400",
  ESCROWED: "bg-amber-400/15 text-amber-400",
  SETTLED: "bg-blue-400/15 text-blue-400",
  COMPLETED: "bg-emerald-400/15 text-emerald-400",
  EXPIRED: "bg-red-400/15 text-red-400",
  TX_FAILED: "bg-red-500/15 text-red-500",
  RISK_REJECTED: "bg-red-600/15 text-red-600",
  REFUNDED: "bg-orange-400/15 text-orange-400",
  DISPUTE_OPEN: "bg-orange-500/15 text-orange-400",
  DISPUTE_RESOLVED: "bg-purple-400/15 text-purple-400",
  GROUP_CREATED: "bg-slate-500/15 text-slate-400",
  GROUP_AWAITING_TX: "bg-yellow-500/15 text-yellow-400",
  GROUP_ESCROWED: "bg-amber-400/15 text-amber-400",
  GROUP_SETTLED: "bg-blue-400/15 text-blue-400",
  GROUP_COMPLETED: "bg-emerald-400/15 text-emerald-400",
  GROUP_EXPIRED: "bg-red-400/15 text-red-400",
  GROUP_PARTIAL: "bg-orange-400/15 text-orange-400",
};

var currentTab = "groups";

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function truncAddr(addr) {
  if (!addr) return "-";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function statusBadge(status) {
  var cls = STATUS_CLASSES[status] || "bg-slate-500/15 text-slate-400";
  return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ' + cls + '">' + esc(status) + '</span>';
}

async function fetchJson(path) {
  var headers = {};
  if (PORTAL_TOKEN) headers["Authorization"] = "Bearer " + PORTAL_TOKEN;
  var res = await fetch(path, { headers: headers });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

function updateStats(data) {
  var counts = data.counts || {};
  document.querySelector('[data-stat="total"]').textContent = String(data.total || 0);
  var statuses = ["ESCROWED", "SETTLED", "COMPLETED", "DISPUTE_OPEN", "REFUNDED"];
  for (var s of statuses) {
    var el = document.querySelector('[data-stat="' + s + '"]');
    if (el) el.textContent = String(counts[s] || 0);
  }
  document.querySelector('[data-stat="volume"]').textContent = (data.total_volume_display || "0") + " USDC";
}

function updateRelayer(data) {
  var card = document.getElementById("relayer-card");
  if (!data.configured) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  document.getElementById("relayer-address").textContent = data.address || data.error || "-";
  document.getElementById("relayer-balance").textContent = data.lat_balance ? (data.lat_balance + " LAT") : (data.error || "-");
  document.getElementById("relayer-contract").textContent = data.escrow_contract || "-";
  var statusEl = document.getElementById("relayer-status");
  if (data.error) {
    statusEl.innerHTML = '<span class="text-red-400">Error</span>';
  } else if (data.low_balance) {
    statusEl.innerHTML = '<span class="text-amber-400">Low Balance</span>';
  } else {
    statusEl.innerHTML = '<span class="text-emerald-400">Healthy</span>';
  }
}

function switchTab(tab) {
  currentTab = tab;
  var tabGroups = document.getElementById("tab-groups");
  var tabPayments = document.getElementById("tab-payments");
  var viewGroups = document.getElementById("view-groups");
  var viewPayments = document.getElementById("view-payments");
  if (tab === "groups") {
    tabGroups.className = "px-4 py-2.5 text-sm font-medium border-b-2 border-indigo-500 text-indigo-400 cursor-pointer";
    tabPayments.className = "px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 cursor-pointer";
    viewGroups.classList.remove("hidden");
    viewPayments.classList.add("hidden");
  } else {
    tabPayments.className = "px-4 py-2.5 text-sm font-medium border-b-2 border-indigo-500 text-indigo-400 cursor-pointer";
    tabGroups.className = "px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 cursor-pointer";
    viewPayments.classList.remove("hidden");
    viewGroups.classList.add("hidden");
  }
}

function updateGroups(groups) {
  var empty = document.getElementById("groups-empty");
  var list = document.getElementById("groups-list");

  if (groups.length === 0) {
    empty.classList.remove("hidden");
    list.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.classList.remove("hidden");

  var html = "";
  for (var g of groups) {
    html += '<div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">' +
      '<div class="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-700/30 transition-colors" onclick="toggleGroup(\\'' + esc(g.group_id) + '\\')">' +
        '<div class="flex items-center gap-3">' +
          '<svg class="w-4 h-4 text-slate-500 transition-transform" id="chevron-' + esc(g.group_id) + '" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
          '<span class="font-mono text-sm text-slate-300">' + esc(g.group_id) + '</span>' +
          statusBadge(g.status) +
        '</div>' +
        '<div class="flex items-center gap-4 text-sm">' +
          '<span class="text-slate-300 font-medium">' + esc(g.total_amount_display) + ' ' + esc(g.currency) + '</span>' +
          '<span class="text-slate-500">' + esc(g.payment_count) + ' payments</span>' +
          '<span class="font-mono text-xs text-slate-500">' + esc(truncAddr(g.payer_wallet)) + '</span>' +
          '<span class="text-xs text-slate-500">' + esc(new Date(g.created_at).toLocaleString()) + '</span>' +
        '</div>' +
      '</div>' +
      '<div id="group-detail-' + esc(g.group_id) + '" class="hidden border-t border-slate-700 px-5 py-3">' +
        '<div class="text-xs text-slate-500">Loading payments...</div>' +
      '</div>' +
    '</div>';
  }
  list.innerHTML = html;
}

async function toggleGroup(groupId) {
  var detail = document.getElementById("group-detail-" + groupId);
  var chevron = document.getElementById("chevron-" + groupId);
  if (!detail) return;

  if (detail.classList.contains("hidden")) {
    detail.classList.remove("hidden");
    chevron.style.transform = "rotate(90deg)";
    // Fetch payments for this group
    try {
      var data = await fetchJson("/api/groups/" + encodeURIComponent(groupId));
      var payments = data.payments || [];
      if (payments.length === 0) {
        detail.innerHTML = '<div class="text-sm text-slate-500 py-2">No payments in this group</div>';
        return;
      }
      var html = '<table class="w-full"><thead><tr class="border-b border-slate-700/50">' +
        '<th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Payment ID</th>' +
        '<th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Status</th>' +
        '<th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Amount</th>' +
        '<th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Merchant</th>' +
        '<th class="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Order Ref</th>' +
        '</tr></thead><tbody>';
      for (var p of payments) {
        html += '<tr class="border-b border-slate-700/30 cursor-pointer hover:bg-slate-700/20 transition-colors" onclick="event.stopPropagation();showDetail(\\'' + esc(p.nexus_payment_id) + '\\')">' +
          '<td class="px-3 py-2 font-mono text-xs text-slate-300">' + esc(p.nexus_payment_id) + '</td>' +
          '<td class="px-3 py-2">' + statusBadge(p.status) + '</td>' +
          '<td class="px-3 py-2 text-sm text-slate-300">' + esc(p.amount_display) + ' USDC</td>' +
          '<td class="px-3 py-2 text-xs text-slate-400">' + esc((p.merchant_did || "").split(":").pop()) + '</td>' +
          '<td class="px-3 py-2 text-xs text-slate-400">' + esc(p.merchant_order_ref) + '</td>' +
          '</tr>';
      }
      html += '</tbody></table>';
      detail.innerHTML = html;
    } catch (e) {
      detail.innerHTML = '<div class="text-sm text-red-400 py-2">Failed to load payments</div>';
    }
  } else {
    detail.classList.add("hidden");
    chevron.style.transform = "";
  }
}

function updatePayments(payments) {
  var empty = document.getElementById("empty-state");
  var table = document.getElementById("payments-table");
  var tbody = document.getElementById("payments-tbody");

  if (payments.length === 0) {
    empty.classList.remove("hidden");
    table.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");

  var html = "";
  for (var p of payments) {
    html += '<tr class="border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/30 transition-colors" onclick="showDetail(\\'' + esc(p.nexus_payment_id) + '\\')">' +
      '<td class="px-4 py-3 font-mono text-xs text-slate-300">' + esc(p.nexus_payment_id) + '</td>' +
      '<td class="px-4 py-3 font-mono text-xs text-slate-400">' + esc(p.group_id || "-") + '</td>' +
      '<td class="px-4 py-3">' + statusBadge(p.status) + '</td>' +
      '<td class="px-4 py-3 text-sm text-slate-300">' + esc(p.amount_display) + ' ' + esc(p.currency) + '</td>' +
      '<td class="px-4 py-3 text-xs text-slate-400">' + esc(p.merchant_did.split(":").pop()) + '</td>' +
      '<td class="px-4 py-3 text-xs text-slate-400">' + esc(new Date(p.created_at).toLocaleString()) + '</td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
}

async function showDetail(id) {
  var panel = document.getElementById("detail-panel");
  var content = document.getElementById("detail-content");
  panel.classList.remove("hidden");
  content.innerHTML = '<div class="text-slate-400 text-sm">Loading...</div>';

  try {
    var data = await fetchJson("/api/payments/" + encodeURIComponent(id));
    var p = data.payment;
    var events = data.events || [];

    var html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 fade-in">';
    html += '<div class="space-y-2 text-sm">';
    html += '<div class="flex justify-between"><span class="text-slate-500">ID</span><span class="font-mono text-xs text-slate-300">' + esc(p.nexus_payment_id) + '</span></div>';
    html += '<div class="flex justify-between"><span class="text-slate-500">Status</span>' + statusBadge(p.status) + '</div>';
    html += '<div class="flex justify-between"><span class="text-slate-500">Amount</span><span class="text-slate-300">' + esc(p.amount_display) + ' ' + esc(p.currency) + '</span></div>';
    html += '<div class="flex justify-between"><span class="text-slate-500">Method</span><span class="text-slate-300">' + esc(p.payment_method) + '</span></div>';
    html += '<div class="flex justify-between"><span class="text-slate-500">Merchant</span><span class="text-slate-300">' + esc(p.merchant_did) + '</span></div>';
    html += '<div class="flex justify-between"><span class="text-slate-500">Payer</span><span class="font-mono text-xs text-slate-300">' + esc(p.payer_wallet || "-") + '</span></div>';
    if (p.tx_hash) html += '<div class="flex justify-between"><span class="text-slate-500">TX Hash</span><span class="font-mono text-xs text-slate-300 break-all">' + esc(p.tx_hash) + '</span></div>';
    html += '</div>';

    html += '<div>';
    html += '<h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Event Timeline</h4>';
    html += '<div class="space-y-1">';
    for (var e of events) {
      html += '<div class="flex items-start gap-2 text-xs">' +
        '<span class="text-slate-500 shrink-0 w-32">' + esc(new Date(e.created_at).toLocaleString()) + '</span>' +
        '<span class="text-indigo-400 font-medium">' + esc(e.event_type) + '</span>' +
        '<span class="text-slate-500">' + esc((e.from_status || "") + " -> " + e.to_status) + '</span>' +
        '</div>';
    }
    html += '</div></div></div>';

    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<div class="text-red-400 text-sm">Failed to load details</div>';
  }
}

function closeDetail() {
  document.getElementById("detail-panel").classList.add("hidden");
}

async function refresh() {
  try {
    var statusFilter = document.getElementById("status-filter").value;
    var paymentsUrl = "/api/payments?limit=50" + (statusFilter ? "&status=" + encodeURIComponent(statusFilter) : "");
    var [stats, payments, relayer, groups] = await Promise.all([
      fetchJson("/api/stats"),
      fetchJson(paymentsUrl),
      fetchJson("/api/relayer"),
      fetchJson("/api/groups"),
    ]);
    updateStats(stats);
    updatePayments(payments.data || payments);
    updateRelayer(relayer);
    updateGroups(groups.data || groups);
  } catch (e) {
    console.error("Refresh failed:", e);
  }
}

refresh();
var refreshTimer = setInterval(refresh, 15000);
document.addEventListener("visibilitychange", function() {
  if (document.hidden) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  } else {
    refresh();
    refreshTimer = setInterval(refresh, 15000);
  }
});
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Handle portal HTTP requests.
 * Returns true if the request was handled, false otherwise.
 */
export async function handlePortalRequest(
  deps: PortalDeps,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  if (path === "/" && req.method === "GET") {
    sendHtml(res, renderDashboard(deps.version, deps.portalToken));
    return true;
  }

  // Bearer token auth for all /api/* routes
  if (path.startsWith("/api/") && !isAuthorized(deps, req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return true;
  }

  if (path === "/api/payments" && req.method === "GET") {
    await handleApiPayments(deps, url, res);
    return true;
  }

  if (path === "/api/stats" && req.method === "GET") {
    await handleApiStats(deps, res);
    return true;
  }

  if (path === "/api/relayer" && req.method === "GET") {
    await handleApiRelayer(deps, res);
    return true;
  }

  const paymentMatch = path.match(/^\/api\/payments\/(PAY-[a-zA-Z0-9-]+)$/);
  if (paymentMatch && req.method === "GET") {
    await handleApiPaymentDetail(
      deps,
      decodeURIComponent(paymentMatch[1]),
      res,
    );
    return true;
  }

  if (path === "/api/groups" && req.method === "GET") {
    await handleApiGroups(deps, res);
    return true;
  }

  const groupMatch = path.match(
    /^\/api\/groups\/((?:GRP-|grp_)[a-zA-Z0-9_-]+)$/i,
  );
  if (groupMatch && req.method === "GET") {
    await handleApiGroupDetail(deps, decodeURIComponent(groupMatch[1]), res);
    return true;
  }

  return false;
}
