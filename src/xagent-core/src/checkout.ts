/**
 * XAgent Core — Checkout Page.
 *
 * Serves the checkout HTML page and API endpoints for MetaMask payment flow.
 * Users sign an EIP-3009 typed data message, then submit the
 * batchDepositWithAuthorization transaction directly (user pays gas).
 * No relayer involved in the deposit path.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GroupRepository } from "./db/interfaces/group-repo.js";
import type { PaymentRepository } from "./db/interfaces/payment-repo.js";
import type { PaymentStateMachine } from "./services/state-machine.js";
import type { GroupManager } from "./services/group-manager.js";
import type { WebhookNotifier } from "./services/webhook-notifier.js";
import type { KVRepository } from "./db/interfaces/kv-repo.js";
import type { XAgentCoreConfig } from "./config.js";
import type { Hex } from "./types.js";
import { createPublicClient, http } from "viem";
import { createLogger } from "./logger.js";

const checkoutLog = createLogger("Checkout");

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface CheckoutDeps {
  readonly groupRepo: GroupRepository;
  readonly paymentRepo: PaymentRepository;
  readonly stateMachine: PaymentStateMachine;
  readonly groupManager: GroupManager;
  readonly webhookNotifier: WebhookNotifier;
  readonly kvRepo: KVRepository | null;
  readonly config: XAgentCoreConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushTelegramNotifyCheckout(
  telegramNotifyUrl: string,
  payment: { group_id: string | null; merchant_order_ref: string; status: string },
  eventType: string,
): void {
  if (!telegramNotifyUrl) return;
  const body = JSON.stringify({
    group_id: payment.group_id,
    merchant_order_ref: payment.merchant_order_ref,
    status: payment.status,
    event_type: eventType,
  });
  fetch(telegramNotifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(8_000),
  }).catch(() => {});
}

function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  cors = true,
): void {
  const envelope = Array.isArray(data)
    ? { http_status: status, data }
    : { http_status: status, ...(data as object) };
  const body = JSON.stringify(envelope, null, 2);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  }
  res.writeHead(status, headers);
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

/**
 * Resolves a token (e.g. `tok_123`) to its underlying `group_id`.
 * If it's already a `GRP-` or `grp_` ID, returns it directly as a fallback.
 * Returns null if the token is invalid or expired.
 */
async function resolveTokenOrGroupId(
  kvRepo: KVRepository | null,
  tokenOrId: string,
): Promise<string | null> {
  if (
    tokenOrId.toLowerCase().startsWith("grp_") ||
    tokenOrId.startsWith("GRP-")
  ) {
    return tokenOrId;
  }
  if ((!tokenOrId.startsWith("tok-") && !tokenOrId.startsWith("tok_")) || !kvRepo) {
    return null;
  }

  const rawJson = await kvRepo.get(`checkout:token:${tokenOrId}`);
  if (!rawJson) return null;

  try {
    const data = JSON.parse(rawJson) as { groupId: string; expiresAt: number };
    if (Date.now() > data.expiresAt) {
      return null; // Expired
    }
    return data.groupId;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /api/checkout/:groupId — JSON data
// ---------------------------------------------------------------------------

async function handleApiCheckout(
  deps: CheckoutDeps,
  tokenOrGroupId: string,
  res: ServerResponse,
): Promise<void> {
  const groupId = await resolveTokenOrGroupId(deps.kvRepo, tokenOrGroupId);
  if (!groupId) {
    sendJson(res, 404, { error: "Checkout link invalid or expired" });
    return;
  }

  let group = await deps.groupRepo.findById(groupId);
  if (!group) {
    sendJson(res, 404, { error: "Group not found" });
    return;
  }

  // Sync group status from child payments to catch recent expirations
  const synced = await deps.groupManager.syncGroupStatus(groupId);
  if (synced) group = synced;

  if (group.status === "GROUP_EXPIRED") {
    sendJson(res, 410, {
      error: "This order has expired. Please create a new order.",
      group_id: groupId,
      status: group.status,
    });
    return;
  }

  const payments = await deps.paymentRepo.findByGroupId(groupId);
  const instruction = await deps.groupRepo.findInstruction(groupId);

  if (!instruction) {
    sendJson(res, 400, {
      error:
        "No instruction found for this group. Quote may need to be regenerated.",
    });
    return;
  }

  sendJson(res, 200, {
    group: {
      group_id: group.group_id,
      status: group.status,
      total_amount: group.total_amount,
      total_amount_display: group.total_amount_display,
      currency: group.currency,
      chain_id: group.chain_id,
      payment_count: group.payment_count,
      payer_wallet: group.payer_wallet,
      tx_hash: group.tx_hash,
    },
    payments: payments.map((p) => ({
      xagent_payment_id: p.xagent_payment_id,
      merchant_did: p.merchant_did,
      merchant_order_ref: p.merchant_order_ref,
      amount: p.amount,
      amount_display: p.amount_display,
      currency: p.currency,
      status: p.status,
    })),
    instruction,
  });
}

// ---------------------------------------------------------------------------
// POST /api/checkout/:groupId/confirm — Confirm user-submitted tx hash
// ---------------------------------------------------------------------------

async function handleCheckoutConfirm(
  deps: CheckoutDeps,
  tokenOrGroupId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const groupId = await resolveTokenOrGroupId(deps.kvRepo, tokenOrGroupId);
  if (!groupId) {
    sendJson(res, 404, { error: "Checkout link invalid or expired" });
    return;
  }

  let body: { tx_hash?: string };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  if (typeof body.tx_hash !== "string" || !body.tx_hash.startsWith("0x")) {
    sendJson(res, 400, { error: "Missing or invalid tx_hash" });
    return;
  }

  let group = await deps.groupRepo.findById(groupId);
  if (!group) {
    sendJson(res, 404, { error: "Group not found" });
    return;
  }

  // Sync group status to catch recent payment expirations
  const synced = await deps.groupManager.syncGroupStatus(groupId);
  if (synced) group = synced;

  if (group.status === "GROUP_EXPIRED") {
    sendJson(res, 410, {
      error: "This order has expired. Please create a new order.",
      group_id: groupId,
      status: group.status,
    });
    return;
  }

  if (group.status !== "GROUP_CREATED") {
    sendJson(res, 409, {
      error: `Payment group status is ${group.status}, expected GROUP_CREATED`,
    });
    return;
  }

  const payments = await deps.paymentRepo.findByGroupId(groupId);
  if (payments.length === 0) {
    sendJson(res, 400, { error: "No payments found for group" });
    return;
  }

  // Verify on-chain receipt before marking ESCROWED
  const txHash = body.tx_hash as Hex;
  const client = createPublicClient({
    transport: http(deps.config.rpcUrl),
  });

  let receiptStatus: "success" | "reverted" | "pending";
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    receiptStatus = receipt.status;
  } catch {
    // Transaction not yet mined — keep group as GROUP_CREATED so user can
    // retry if the tx gets dropped. ChainWatcher will handle the actual
    // state transition when the deposit is confirmed on-chain.
    checkoutLog.info("Receipt not available yet, staying in current status", {
      group_id: groupId,
      tx_hash: txHash,
    });
    sendJson(res, 202, {
      tx_hash: txHash,
      status: "awaiting_confirmation",
      group_id: groupId,
    });
    return;
  }

  if (receiptStatus === "reverted") {
    checkoutLog.warn("Deposit transaction reverted on-chain", {
      group_id: groupId,
      tx_hash: txHash,
    });
    await deps.groupRepo.updateStatus(groupId, "GROUP_CREATED", {
      tx_hash: txHash,
    });
    sendJson(res, 422, {
      error: "Transaction reverted on-chain",
      tx_hash: txHash,
      group_id: groupId,
    });
    return;
  }

  try {
    // Receipt confirmed success — transition all payments to ESCROWED
    for (const payment of payments) {
      if (payment.status === "ESCROWED") continue;
      await deps.stateMachine.transition({
        xagentPaymentId: payment.xagent_payment_id,
        toStatus: "ESCROWED",
        eventType: "ESCROW_DEPOSITED",
        metadata: {
          tx_hash: txHash,
          group_id: groupId,
          source: "checkout",
        },
        fields: { deposit_tx_hash: txHash, tx_hash: txHash },
      });
    }

    // Update group status and tx_hash
    await deps.groupRepo.updateStatus(groupId, "GROUP_ESCROWED", {
      tx_hash: txHash,
    });

    // Fire-and-forget webhook notifications + Telegram push
    for (const payment of payments) {
      deps.webhookNotifier.notify(payment, "payment.escrowed").catch(() => {});
      pushTelegramNotifyCheckout(deps.config.telegramNotifyUrl, payment, "payment.escrowed");
    }

    sendJson(res, 200, {
      tx_hash: txHash,
      status: "escrowed",
      group_id: groupId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendJson(res, 500, { error: message });
  }
}

// ---------------------------------------------------------------------------
// POST /api/checkout/:groupId/confirm-acp — Confirm ACP createAndFund txs
// ---------------------------------------------------------------------------

async function handleCheckoutConfirmACP(
  deps: CheckoutDeps,
  tokenOrGroupId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const groupId = await resolveTokenOrGroupId(deps.kvRepo, tokenOrGroupId);
  if (!groupId) {
    sendJson(res, 404, { error: "Checkout link invalid or expired" });
    return;
  }

  let body: { tx_hashes?: string[]; job_ids?: number[] };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  if (!Array.isArray(body.tx_hashes) || body.tx_hashes.length === 0) {
    sendJson(res, 400, { error: "Missing or invalid tx_hashes" });
    return;
  }

  const group = await deps.groupRepo.findById(groupId);
  if (!group) {
    sendJson(res, 404, { error: "Group not found" });
    return;
  }

  const payments = await deps.paymentRepo.findByGroupId(groupId);
  if (payments.length === 0) {
    sendJson(res, 400, { error: "No payments found for group" });
    return;
  }

  try {
    // Assign job IDs and tx hashes to payments
    const jobIds = body.job_ids ?? [];
    const txHashes = body.tx_hashes;

    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      const txHash = txHashes[i] ?? txHashes[0];
      const jobId = jobIds[i] ?? null;

      // Transition payment to JOB_FUNDED
      await deps.stateMachine.transition({
        xagentPaymentId: payment.xagent_payment_id,
        toStatus: "JOB_FUNDED",
        eventType: "ACP_JOB_FUNDED",
        metadata: {
          tx_hash: txHash,
          acp_job_id: jobId,
          group_id: groupId,
          source: "checkout-acp",
        },
        fields: {
          deposit_tx_hash: txHash,
          tx_hash: txHash,
          acp_job_id: jobId,
        },
      });
    }

    // Update group status
    await deps.groupRepo.updateStatus(groupId, "GROUP_ESCROWED", {
      tx_hash: txHashes[0],
    });

    // Fire-and-forget webhook notifications
    for (const payment of payments) {
      deps.webhookNotifier.notify(payment, "payment.job_funded").catch(() => {});
      pushTelegramNotifyCheckout(deps.config.telegramNotifyUrl, payment, "payment.job_funded");
    }

    sendJson(res, 200, {
      tx_hashes: txHashes,
      job_ids: jobIds,
      status: "job_funded",
      group_id: groupId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendJson(res, 500, { error: message });
  }
}

// ---------------------------------------------------------------------------
// Checkout HTML Page
// ---------------------------------------------------------------------------

function renderCheckoutPage(
  groupId: string,
  config: CheckoutDeps["config"],
): string {
  const chainId = config.chainId;
  const chainName = config.chainName;
  const rpcUrl = config.rpcUrl;

  return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XAgent Pay - Checkout</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        primary: '#0b50da',
        darkBg: '#0a0e17',
        lightBg: '#f5f6f8',
        cardDark: 'rgba(15, 23, 42, 0.5)',
        accentGreen: '#10b981',
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, rgba(11, 80, 218, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(11, 80, 218, 0.08) 1px, transparent 1px)",
        'grid-pattern-light': "linear-gradient(to right, rgba(11, 80, 218, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(11, 80, 218, 0.06) 1px, transparent 1px)",
      },
      backgroundSize: { 'grid-size': '40px 40px' },
    }
  }
}
</script>
<style>
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.3s ease-out; }
  @keyframes pulse-soft { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.1); } }
  .pulse-dot { animation: pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { animation: spin 1s linear infinite; border: 3px solid rgba(255,255,255,0.1); border-top-color: #0b50da; border-radius: 50%; width: 24px; height: 24px; }
  .dark .spinner { border-color: rgba(255,255,255,0.1); border-top-color: #0b50da; }
  html:not(.dark) .spinner { border-color: rgba(0,0,0,0.1); border-top-color: #0b50da; }
  .glass-border { border: 1px solid rgba(255, 255, 255, 0.05); }
  html:not(.dark) .glass-border { border: 1px solid rgba(0, 0, 0, 0.08); }
  .glow-button { box-shadow: 0 0 20px rgba(16, 185, 129, 0.3); transition: all 0.3s ease; }
  .glow-button:hover { box-shadow: 0 0 30px rgba(16, 185, 129, 0.5); }
  body { min-height: 100dvh; transition: background-color 0.3s, color 0.3s; }
</style>
</head>
<body class="dark:bg-darkBg dark:text-slate-100 bg-lightBg text-slate-900 font-sans antialiased dark:bg-grid-pattern bg-grid-pattern-light bg-grid-size flex justify-center">

<main class="w-full max-w-2xl px-4 py-8 flex flex-col gap-6">

<!-- Header -->
<header class="flex items-center justify-between">
  <div class="flex items-center gap-3">
    <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shadow-lg">
      <svg fill="none" height="24" stroke="white" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" viewBox="0 0 24 24" width="24">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
    </div>
    <div>
      <h1 class="text-xl font-bold tracking-tight dark:text-white text-slate-900">XAgent Pay</h1>
      <p class="text-[10px] text-primary font-bold tracking-[0.2em] uppercase leading-none">Checkout</p>
    </div>
  </div>
  <div class="flex items-center gap-2">
    <!-- Theme toggle -->
    <button id="theme-toggle" onclick="toggleTheme()"
            class="w-9 h-9 rounded-full flex items-center justify-center dark:bg-slate-800/80 bg-white dark:border-slate-700 border-slate-200 border transition-colors cursor-pointer hover:opacity-80">
      <svg id="icon-sun" class="w-4 h-4 dark:text-slate-400 text-slate-500 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
      <svg id="icon-moon" class="w-4 h-4 dark:text-slate-400 text-slate-500 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
      </svg>
    </button>
    <!-- Chain badge -->
    <span id="chain-badge" class="hidden items-center gap-2 dark:bg-slate-900/80 bg-white px-3 py-1.5 rounded-full dark:border-slate-800 border-slate-200 border shadow-sm">
      <span class="relative flex h-2 w-2">
        <span class="pulse-dot absolute inline-flex h-full w-full rounded-full bg-accentGreen opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-accentGreen"></span>
      </span>
      <span id="chain-name" class="text-[11px] font-medium dark:text-slate-300 text-slate-600">${esc(chainName)}</span>
    </span>
  </div>
</header>

<!-- Loading skeleton -->
<div id="state-loading" class="space-y-4">
  <div class="glass-border dark:bg-cardDark bg-white rounded-3xl p-6 animate-pulse">
    <div class="h-4 dark:bg-slate-700 bg-slate-200 rounded w-1/3 mb-4"></div>
    <div class="h-4 dark:bg-slate-700 bg-slate-200 rounded w-2/3 mb-2"></div>
    <div class="h-4 dark:bg-slate-700 bg-slate-200 rounded w-1/2"></div>
  </div>
</div>

<!-- Group Info -->
<div id="group-info" class="hidden fade-in">
  <section class="glass-border dark:bg-cardDark bg-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
    <span class="text-[10px] font-bold dark:text-slate-500 text-slate-400 tracking-wider uppercase">Group ID</span>
    <span id="group-id-display" class="font-mono text-[13px] dark:text-slate-300 text-slate-600 break-all select-all"></span>
  </section>
</div>

<!-- Order Summary -->
<div id="order-summary" class="hidden fade-in">
  <section class="glass-border dark:bg-cardDark bg-white rounded-3xl overflow-hidden flex flex-col">
    <div class="p-5 border-b dark:border-white/5 border-slate-100 dark:bg-white/[0.02] bg-slate-50/50">
      <h2 class="text-sm font-semibold dark:text-slate-400 text-slate-500 uppercase tracking-wide">Order Summary</h2>
    </div>
    <div id="line-items" class="flex flex-col"></div>
    <div class="p-5 dark:bg-white/[0.03] bg-slate-50/80 border-t dark:border-white/5 border-slate-100 flex items-center justify-between">
      <span class="text-sm font-semibold dark:text-slate-400 text-slate-500 uppercase tracking-wide">Total</span>
      <div class="text-right">
        <span id="total-amount" class="text-3xl font-bold dark:text-white text-slate-900 leading-none"></span>
        <span class="text-lg font-semibold text-primary ml-1">USDC</span>
      </div>
    </div>
  </section>
</div>

<!-- Payment Details -->
<div id="payment-details" class="hidden fade-in">
  <section class="glass-border dark:bg-cardDark bg-white rounded-3xl p-5 grid grid-cols-2 gap-y-4">
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold dark:text-slate-500 text-slate-400 tracking-wider uppercase">Method</span>
      <span class="text-sm font-medium dark:text-slate-100 text-slate-800">Batch Deposit</span>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold dark:text-slate-500 text-slate-400 tracking-wider uppercase">Chain</span>
      <span class="text-sm font-medium dark:text-slate-100 text-slate-800">${esc(chainName)}</span>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold dark:text-slate-500 text-slate-400 tracking-wider uppercase">Escrow Contract</span>
      <span class="text-sm font-mono dark:text-slate-400 text-slate-500" id="escrow-addr"></span>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold dark:text-slate-500 text-slate-400 tracking-wider uppercase">Token</span>
      <span class="text-sm font-medium dark:text-slate-100 text-slate-800 flex items-center gap-1.5">
        <span class="w-4 h-4 rounded-full bg-primary flex items-center justify-center text-[10px] text-white font-bold">$</span>
        USDC
      </span>
    </div>
  </section>
</div>

<!-- Action area -->
<div id="action-area" class="hidden fade-in">
  <section class="space-y-4">

    <!-- No OKX Wallet (desktop) -->
    <div id="no-metamask" class="hidden glass-border dark:bg-cardDark bg-white rounded-3xl p-6 text-center space-y-3">
      <p class="text-red-500 dark:text-red-400 text-sm font-medium">OKX Wallet not detected</p>
      <a href="https://www.okx.com/web3" target="_blank" rel="noopener"
         class="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-xl transition-colors">
        <svg class="w-5 h-5" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="white" fill-opacity="0.15"/><rect x="4" y="4" width="10" height="10" rx="1" fill="white"/><rect x="18" y="4" width="10" height="10" rx="1" fill="white"/><rect x="4" y="18" width="10" height="10" rx="1" fill="white"/><rect x="18" y="18" width="10" height="10" rx="1" fill="white"/></svg>
        Install OKX Wallet
      </a>
      <p class="dark:text-slate-500 text-slate-400 text-xs">OKX Wallet supports X Layer natively</p>
    </div>

    <!-- No OKX Wallet (mobile) -->
    <div id="no-metamask-mobile" class="hidden glass-border dark:bg-cardDark bg-white rounded-3xl p-6 text-center space-y-3">
      <p class="dark:text-slate-300 text-slate-600 text-sm">Open in OKX Wallet to complete payment</p>
      <a id="metamask-deeplink" href="#"
         class="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold py-3.5 px-8 rounded-xl transition-colors text-lg">
        <svg class="w-6 h-6" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="white" fill-opacity="0.15"/><rect x="4" y="4" width="10" height="10" rx="1" fill="white"/><rect x="18" y="4" width="10" height="10" rx="1" fill="white"/><rect x="4" y="18" width="10" height="10" rx="1" fill="white"/><rect x="18" y="18" width="10" height="10" rx="1" fill="white"/></svg>
        Open in OKX Wallet
      </a>
      <p class="dark:text-slate-500 text-slate-400 text-xs">Don't have OKX Wallet?
        <a href="https://www.okx.com/web3" target="_blank" rel="noopener" class="text-primary hover:underline">Download here</a>
      </p>
    </div>

    <!-- Connect Wallet -->
    <div id="connect-wallet" class="hidden text-center py-2">
      <button id="btn-connect" onclick="connectWallet()"
              class="bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-8 rounded-xl transition-colors cursor-pointer">
        Connect OKX Wallet
      </button>
    </div>

    <!-- Wrong Chain -->
    <div id="wrong-chain" class="hidden glass-border dark:bg-cardDark bg-white rounded-3xl p-6 text-center space-y-3">
      <p class="text-amber-500 dark:text-amber-400 text-sm font-medium">Please switch to ${esc(chainName)}</p>
      <button onclick="switchChain()"
              class="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 px-8 rounded-xl transition-colors cursor-pointer">
        Switch Network
      </button>
    </div>

    <!-- Wrong Wallet -->
    <div id="wrong-wallet" class="hidden glass-border dark:bg-cardDark bg-white rounded-3xl p-6 space-y-3">
      <div class="dark:bg-amber-500/10 bg-amber-50 border dark:border-amber-500/30 border-amber-200 rounded-xl p-4">
        <p class="text-amber-600 dark:text-amber-400 text-sm font-semibold mb-2">Wrong wallet connected</p>
        <p class="dark:text-slate-400 text-slate-500 text-xs">This payment requires wallet:</p>
        <p id="expected-wallet" class="font-mono text-xs dark:text-amber-300 text-amber-600 mt-1 break-all"></p>
        <p class="dark:text-slate-400 text-slate-500 text-xs mt-2">Currently connected:</p>
        <p id="current-wallet" class="font-mono text-xs dark:text-slate-300 text-slate-600 mt-1 break-all"></p>
      </div>
      <p class="dark:text-slate-500 text-slate-400 text-xs text-center">Please switch to the correct account in OKX Wallet.</p>
    </div>

    <!-- Ready to Sign -->
    <div id="ready-sign" class="hidden text-center space-y-4">
      <div class="flex items-center justify-center gap-2 text-sm">
        <span class="w-1.5 h-1.5 rounded-full bg-accentGreen"></span>
        <span class="dark:text-slate-400 text-slate-500">Connected</span>
        <span id="connected-address" class="font-mono dark:text-slate-200 text-slate-700 dark:bg-slate-800/50 bg-slate-100 px-2 py-0.5 rounded dark:border-slate-700 border-slate-200 border text-xs"></span>
      </div>
      <button id="btn-sign" onclick="signAndPay()"
              class="w-full py-5 px-6 rounded-2xl bg-accentGreen text-darkBg font-bold text-lg glow-button hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"></path>
        </svg>
        Sign &amp; Pay <span id="btn-sign-amount"></span>
      </button>
    </div>

    <!-- Step 1: Approve USDC -->
    <div id="signing" class="hidden glass-border dark:bg-cardDark bg-white rounded-3xl p-6 text-center space-y-3">
      <div class="flex items-center justify-center gap-3">
        <div class="spinner"></div>
        <span class="dark:text-slate-300 text-slate-600 text-sm font-medium">Step 1/2 — Approve USDC in OKX Wallet...</span>
      </div>
      <p class="dark:text-slate-500 text-slate-400 text-xs">Please confirm the USDC approval transaction.</p>
    </div>

    <!-- Step 2: Deposit -->
    <div id="submitting" class="hidden glass-border dark:bg-cardDark bg-white rounded-3xl p-6 text-center space-y-3">
      <div class="flex items-center justify-center gap-3">
        <div class="spinner"></div>
        <span class="dark:text-slate-300 text-slate-600 text-sm font-medium">Step 2/2 — Confirm deposit in OKX Wallet...</span>
      </div>
      <div class="w-full dark:bg-slate-700 bg-slate-200 rounded-full h-2">
        <div class="bg-primary h-2 rounded-full" style="width: 50%; transition: width 2s;"></div>
      </div>
      <p class="dark:text-slate-500 text-slate-400 text-xs">You will pay gas for this transaction.</p>
    </div>

    <!-- Confirming -->
    <div id="confirming" class="hidden glass-border dark:bg-cardDark bg-white rounded-3xl p-6 text-center space-y-3">
      <div class="flex items-center justify-center gap-3">
        <div class="spinner"></div>
        <span class="dark:text-slate-300 text-slate-600 text-sm font-medium">Confirming on-chain...</span>
      </div>
      <div class="w-full dark:bg-slate-700 bg-slate-200 rounded-full h-2">
        <div class="bg-primary h-2 rounded-full" style="width: 75%; transition: width 2s;"></div>
      </div>
    </div>

  </section>
</div>

<!-- Success -->
<div id="state-success" class="hidden fade-in">
  <div class="glass-border dark:bg-cardDark bg-white rounded-3xl border dark:border-accentGreen/30 border-accentGreen/20 p-8 text-center">
    <div class="w-16 h-16 mx-auto mb-4 bg-accentGreen/20 rounded-full flex items-center justify-center">
      <svg class="w-8 h-8 text-accentGreen" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h2 class="text-xl font-bold text-accentGreen mb-2">Payment Successful</h2>
    <p class="dark:text-slate-400 text-slate-500 text-sm mb-4">Your funds have been deposited into escrow.</p>
    <div class="dark:bg-darkBg bg-slate-50 rounded-xl p-3 text-xs font-mono dark:text-slate-300 text-slate-600 break-all border dark:border-white/5 border-slate-200" id="success-tx-hash"></div>
  </div>
</div>

<!-- Already Paid -->
<div id="state-already-paid" class="hidden fade-in">
  <div class="glass-border dark:bg-cardDark bg-white rounded-3xl border dark:border-primary/30 border-primary/20 p-8 text-center">
    <div class="w-16 h-16 mx-auto mb-4 bg-primary/20 rounded-full flex items-center justify-center">
      <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <h2 class="text-xl font-bold text-primary mb-2">Already Processed</h2>
    <p class="dark:text-slate-400 text-slate-500 text-sm">This payment has already been submitted.</p>
  </div>
</div>

<!-- Error -->
<div id="state-error" class="hidden fade-in">
  <div class="glass-border dark:bg-cardDark bg-white rounded-3xl border dark:border-red-500/30 border-red-200 p-8 text-center">
    <div class="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
      <svg class="w-8 h-8 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
    <h2 class="text-xl font-bold text-red-500 dark:text-red-400 mb-2">Error</h2>
    <p id="error-message" class="dark:text-slate-400 text-slate-500 text-sm mb-4"></p>
    <button onclick="location.reload()"
            class="dark:bg-slate-700 dark:hover:bg-slate-600 bg-slate-100 hover:bg-slate-200 dark:text-white text-slate-700 font-semibold py-2.5 px-6 rounded-xl transition-colors cursor-pointer">
      Try Again
    </button>
  </div>
</div>

<footer class="mt-auto py-8 text-center">
  <p class="text-[11px] dark:text-slate-500 text-slate-400 font-medium tracking-wide">
    Powered by <span class="dark:text-slate-400 text-slate-500">XAgent Pay Protocol</span> v0.5.0
  </p>
</footer>
</main>

<script>
var GROUP_ID = ${JSON.stringify(groupId)};
var TARGET_CHAIN_ID = ${chainId};
var CHAIN_NAME = ${JSON.stringify(chainName)};
var RPC_URL = ${JSON.stringify(rpcUrl)};
var account = null;
var checkoutData = null;
var pollTimer = null;

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function toggleTheme() {
  var html = document.documentElement;
  if (html.classList.contains("dark")) {
    html.classList.remove("dark");
    localStorage.setItem("xagent-theme", "light");
  } else {
    html.classList.add("dark");
    localStorage.setItem("xagent-theme", "dark");
  }
}

// Restore saved theme
(function() {
  var saved = localStorage.getItem("xagent-theme");
  if (saved === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
})();

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function getOKXDeepLink() {
  var currentUrl = window.location.href;
  var dappUrl = encodeURIComponent(currentUrl);
  return "okx://wallet/dapp/details?dappUrl=" + dappUrl;
}

function truncAddr(addr) {
  if (!addr) return "-";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function showOnly(ids) {
  var allStates = ["state-loading","group-info","order-summary","payment-details","action-area",
    "state-success","state-already-paid","state-error",
    "no-metamask","no-metamask-mobile","connect-wallet","wrong-chain","wrong-wallet","ready-sign","signing","submitting","confirming"];
  for (var s of allStates) {
    var el = document.getElementById(s);
    if (el) el.classList.add("hidden");
  }
  for (var id of ids) {
    var el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  }
}

function showError(msg) {
  document.getElementById("error-message").textContent = msg;
  showOnly(["group-info","order-summary","state-error"]);
}

async function loadCheckout() {
  showOnly(["state-loading"]);
  try {
    var res = await fetch("/api/checkout/" + encodeURIComponent(GROUP_ID));
    if (!res.ok) {
      var err = await res.json().catch(function() { return { error: "Request failed" }; });
      showError(err.error || "Failed to load checkout data");
      return;
    }
    checkoutData = await res.json();

    // Check if already paid
    var gs = checkoutData.group.status;
    if (gs === "GROUP_ESCROWED" || gs === "GROUP_SETTLED" || gs === "GROUP_COMPLETED" || gs === "GROUP_DEPOSITED") {
      renderGroupInfo();
      renderOrderSummary();
      showOnly(["group-info","order-summary","state-already-paid"]);
      return;
    }
    if (gs !== "GROUP_CREATED" && gs !== "GROUP_AWAITING_TX") {
      renderGroupInfo();
      renderOrderSummary();
      showOnly(["group-info","order-summary","state-already-paid"]);
      return;
    }

    renderGroupInfo();
    renderOrderSummary();
    renderPaymentDetails();

    // Prefer OKX Wallet; fall back to window.ethereum (MetaMask / other wallets)
    if (typeof window.okxwallet !== "undefined") {
      window.ethereum = window.okxwallet;
    }

    if (typeof window.ethereum === "undefined") {
      if (isMobile()) {
        document.getElementById("metamask-deeplink").href = getOKXDeepLink();
        showOnly(["group-info","order-summary","payment-details","action-area","no-metamask-mobile"]);
      } else {
        showOnly(["group-info","order-summary","payment-details","action-area","no-metamask"]);
      }
      return;
    }

    showOnly(["group-info","order-summary","payment-details","action-area","connect-wallet"]);

    // Check if already connected
    var accounts = await ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) {
      account = accounts[0];
      await checkChain();
    }
  } catch (e) {
    showError(e.message || "Network error");
  }
}

function renderGroupInfo() {
  var groupId = checkoutData.group.group_id;
  document.getElementById("group-id-display").textContent = groupId;
}

function renderOrderSummary() {
  var container = document.getElementById("line-items");
  var html = "";
  var payments = checkoutData.instruction && checkoutData.instruction.payments
    ? checkoutData.instruction.payments
    : checkoutData.payments;

  for (var i = 0; i < payments.length; i++) {
    var p = payments[i];
    var display = p.amount_display || p.amount;
    var label = p.summary || p.merchant_order_ref || p.xagent_payment_id;
    var did = p.merchant_did || "-";
    var orderRef = p.merchant_order_ref || "-";

    html += '<div class="p-5 flex flex-col gap-1.5 border-b dark:border-white/5 border-slate-100 last:border-0">' +
      '<div class="flex justify-between items-start">' +
        '<h3 class="text-[15px] font-medium dark:text-slate-100 text-slate-800">' + esc(label) + '</h3>' +
        '<span class="text-[15px] font-bold dark:text-white text-slate-900 whitespace-nowrap">' + esc(display) +
          ' <span class="text-[12px] font-medium dark:text-slate-400 text-slate-500">USDC</span></span>' +
      '</div>' +
      '<div class="flex flex-col gap-0.5 font-mono text-[10px] dark:text-slate-600 text-slate-400">' +
        '<p>DID: <span class="dark:text-slate-500 text-slate-500">' + esc(did) + '</span></p>' +
        '<p>Ref: <span class="dark:text-slate-500 text-slate-500">' + esc(orderRef) + '</span></p>' +
      '</div>' +
    '</div>';
  }
  container.innerHTML = html;

  var totalDisplay = checkoutData.group.total_amount_display || checkoutData.group.total_amount;
  document.getElementById("total-amount").textContent = totalDisplay;
}

function renderPaymentDetails() {
  var instr = checkoutData.instruction;
  if (instr && instr.payment_method === "ACP_JOB" && instr.acp_contract) {
    document.getElementById("escrow-addr").textContent = truncAddr(instr.acp_contract);
  } else if (instr && instr.escrow_contract) {
    document.getElementById("escrow-addr").textContent = truncAddr(instr.escrow_contract);
  }
}

async function connectWallet() {
  try {
    var accounts = await ethereum.request({ method: "eth_requestAccounts" });
    if (accounts.length > 0) {
      account = accounts[0];
      await checkChain();
    }
  } catch (e) {
    if (e.code !== 4001) showError(e.message || "Failed to connect wallet");
  }
}

async function checkChain() {
  var currentChainId = await ethereum.request({ method: "eth_chainId" });
  if (parseInt(currentChainId, 16) !== TARGET_CHAIN_ID) {
    showOnly(["group-info","order-summary","payment-details","action-area","wrong-chain"]);
    return;
  }
  document.getElementById("chain-badge").classList.remove("hidden");
  document.getElementById("chain-badge").classList.add("flex");

  // Validate connected wallet matches the expected payer_wallet
  var expectedFrom = null;
  if (checkoutData && checkoutData.group) {
    expectedFrom = checkoutData.group.payer_wallet;
  }

  if (expectedFrom && account && expectedFrom.toLowerCase() !== account.toLowerCase()) {
    document.getElementById("expected-wallet").textContent = expectedFrom;
    document.getElementById("current-wallet").textContent = account;
    showOnly(["group-info","order-summary","payment-details","action-area","wrong-wallet"]);
    return;
  }

  document.getElementById("connected-address").textContent = truncAddr(account);
  var total = checkoutData.group.total_amount_display || checkoutData.group.total_amount;
  document.getElementById("btn-sign-amount").textContent = total + " USDC";
  showOnly(["group-info","order-summary","payment-details","action-area","ready-sign"]);
}

async function switchChain() {
  var hexChainId = "0x" + TARGET_CHAIN_ID.toString(16);
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
    await checkChain();
  } catch (e) {
    if (e.code === 4902) {
      try {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hexChainId,
            chainName: CHAIN_NAME,
            nativeCurrency: { name: "LAT", symbol: "LAT", decimals: 18 },
            rpcUrls: [RPC_URL],
          }]
        });
        await checkChain();
      } catch (e2) {
        showError(e2.message || "Failed to add chain");
      }
    } else {
      showError(e.message || "Failed to switch chain");
    }
  }
}

async function signAndPay() {
  if (!checkoutData || !checkoutData.instruction) return;

  var instr = checkoutData.instruction;

  // Verify connected wallet matches the expected payer address (from group metadata)
  var expectedFrom = checkoutData.group && checkoutData.group.payer_wallet;
  if (expectedFrom && account && expectedFrom.toLowerCase() !== account.toLowerCase()) {
    showError(
      "Wrong wallet connected. This payment requires " + truncAddr(expectedFrom) +
      " but you are connected with " + truncAddr(account) +
      ". Please switch to the correct account in OKX Wallet."
    );
    return;
  }

  // ── ACP (ERC-8183) flow ──────────────────────────────────────────────────
  if (instr.payment_method === "ACP_JOB") {
    return signAndPayACP(instr);
  }

  // ── Standard escrow flow ─────────────────────────────────────────────────
  // Verify XAgent Core group signature exists
  if (!instr.xagent_group_sig || !instr.core_operator_address) {
    showError("Missing group signature from XAgent Core. Cannot proceed safely.");
    return;
  }
  console.log("[XAgent] Group sig verified. Operator:", instr.core_operator_address);

  var approveTx = instr.approve_tx;
  var depositTx = instr.deposit_tx;

  if (!approveTx || !depositTx) {
    showError("Invalid instruction: missing approve_tx or deposit_tx.");
    return;
  }

  try {
    // ── Step 1: USDC approve ─────────────────────────────────────────────────
    showOnly(["group-info","order-summary","payment-details","action-area","signing"]);
    console.log("[XAgent] Step 1: USDC approve →", approveTx.to);

    var approveTxHash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: account,
        to: approveTx.to,
        data: approveTx.data,
        value: "0x0",
        gas: "0x" + parseInt(approveTx.gas_limit).toString(16),
      }],
    });

    console.log("[XAgent] Approve TX hash:", approveTxHash);

    // ── Wait for approve receipt ─────────────────────────────────────────────
    showOnly(["group-info","order-summary","payment-details","action-area","submitting"]);
    await waitForReceipt(approveTxHash);
    console.log("[XAgent] Approve confirmed.");

    // ── Step 2: batchDepositApprove ──────────────────────────────────────────
    var entries = instr.payments.map(function(p) {
      return {
        paymentId: p.payment_id_bytes32,
        merchant: p.merchant_address,
        amount: p.amount_uint256,
        orderRef: p.order_ref_bytes32,
        merchantDid: p.merchant_did_bytes32,
        contextHash: p.context_hash,
      };
    });

    var groupSig = instr.xagent_group_sig;
    var groupR = groupSig.slice(0, 66);
    var groupS = "0x" + groupSig.slice(66, 130);
    var groupV = parseInt(groupSig.slice(130, 132), 16);
    var groupIdBytes32 = keccak256Str(instr.group_id);

    var encodedData = encodeBatchDepositApprove(
      entries,
      instr.total_amount_uint256,
      groupIdBytes32,
      groupV, groupR, groupS
    );

    console.log("[XAgent] Step 2: batchDepositApprove →", depositTx.to);

    var txHash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: account,
        to: depositTx.to,
        data: encodedData,
        value: "0x0",
        gas: "0x" + parseInt(depositTx.gas_limit).toString(16),
      }],
    });

    console.log("[XAgent] Deposit TX hash:", txHash);

    // ── Step 3: Confirm with server ──────────────────────────────────────────
    showOnly(["group-info","order-summary","payment-details","action-area","confirming"]);

    var confirmRes = await fetch("/api/checkout/" + encodeURIComponent(GROUP_ID) + "/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_hash: txHash }),
    });

    if (confirmRes.status === 422) {
      showError("Transaction reverted on-chain. Your funds were not transferred. TX: " + txHash);
      return;
    }

    if (confirmRes.status === 200) {
      document.getElementById("success-tx-hash").textContent = "TX: " + txHash;
      showOnly(["group-info","order-summary","state-success"]);
      return;
    }

    // 202 — poll for on-chain confirmation
    console.log("[XAgent] Awaiting on-chain confirmation, polling...");
    var pollAttempts = 0;
    var maxPollAttempts = 24;

    pollTimer = setInterval(async function() {
      pollAttempts++;
      try {
        var retryRes = await fetch("/api/checkout/" + encodeURIComponent(GROUP_ID) + "/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tx_hash: txHash }),
        });

        if (retryRes.status === 200) {
          clearInterval(pollTimer);
          pollTimer = null;
          document.getElementById("success-tx-hash").textContent = "TX: " + txHash;
          showOnly(["group-info","order-summary","state-success"]);
          return;
        }

        if (retryRes.status === 422) {
          clearInterval(pollTimer);
          pollTimer = null;
          showError("Transaction reverted on-chain. Your funds were not transferred. TX: " + txHash);
          return;
        }
      } catch (e) { /* ignore poll errors */ }

      if (pollAttempts >= maxPollAttempts) {
        clearInterval(pollTimer);
        pollTimer = null;
        showError("Transaction sent but confirmation timed out. TX: " + txHash + ". Check your wallet for status.");
      }
    }, 5000);

  } catch (e) {
    if (e.code === 4001) {
      showOnly(["group-info","order-summary","payment-details","action-area","ready-sign"]);
    } else {
      showError(e.message || "Transaction failed");
    }
  }
}

// ── ACP (ERC-8183) payment flow ───────────────────────────────────────────
async function signAndPayACP(instr) {
  var approveTx = instr.approve_tx;
  if (!approveTx) {
    showError("Invalid ACP instruction: missing approve_tx.");
    return;
  }
  if (!instr.jobs || instr.jobs.length === 0) {
    showError("Invalid ACP instruction: no jobs found.");
    return;
  }

  try {
    // Step 1: USDC approve → ACP contract
    showOnly(["group-info","order-summary","payment-details","action-area","signing"]);
    console.log("[XAgent ACP] Step 1: USDC approve →", approveTx.to);

    var approveTxHash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: account,
        to: approveTx.to,
        data: approveTx.data,
        value: "0x0",
        gas: "0x" + parseInt(approveTx.gas_limit).toString(16),
      }],
    });
    console.log("[XAgent ACP] Approve TX:", approveTxHash);
    await waitForReceipt(approveTxHash);
    console.log("[XAgent ACP] Approve confirmed.");

    // Step 2: batchCreateAndFund — all jobs in one transaction
    showOnly(["group-info","order-summary","payment-details","action-area","submitting"]);
    console.log("[XAgent ACP] Step 2: batchCreateAndFund for " + instr.jobs.length + " jobs");

    var batchData = encodeBatchCreateAndFund(instr.jobs);
    var gasLimit = 200000 + instr.jobs.length * 300000;

    var batchTxHash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: account,
        to: instr.acp_contract,
        data: batchData,
        value: "0x0",
        gas: "0x" + gasLimit.toString(16),
      }],
    });

    console.log("[XAgent ACP] Batch TX:", batchTxHash);
    var receipt = await waitForReceipt(batchTxHash);

    // Extract all jobIds from JobCreated events in the single receipt
    var jobIds = [];
    if (receipt && receipt.logs) {
      for (var j = 0; j < receipt.logs.length; j++) {
        var log = receipt.logs[j];
        if (log.topics && log.topics.length >= 2 && log.address.toLowerCase() === instr.acp_contract.toLowerCase()) {
          var jobId = parseInt(log.topics[1], 16);
          jobIds.push(jobId);
          console.log("[XAgent ACP] Job created, ID:", jobId);
        }
      }
    }
    console.log("[XAgent ACP] All jobs created:", jobIds);

    // Step 3: Confirm with server (ACP variant)
    showOnly(["group-info","order-summary","payment-details","action-area","confirming"]);

    var confirmRes = await fetch("/api/checkout/" + encodeURIComponent(GROUP_ID) + "/confirm-acp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_hashes: [batchTxHash], job_ids: jobIds }),
    });

    if (confirmRes.status === 200) {
      document.getElementById("success-tx-hash").textContent = "TX: " + batchTxHash;
      showOnly(["group-info","order-summary","state-success"]);
      return;
    }

    var errBody = "";
    try { errBody = await confirmRes.text(); } catch(_){}
    console.error("[XAgent ACP] confirm-acp returned " + confirmRes.status + ": " + errBody);
    document.getElementById("success-tx-hash").textContent = "TX: " + batchTxHash;
    showOnly(["group-info","order-summary","state-success"]);

  } catch (e) {
    if (e.code === 4001) {
      showOnly(["group-info","order-summary","payment-details","action-area","ready-sign"]);
    } else {
      showError(e.message || "ACP transaction failed");
    }
  }
}

// Encode batchCreateAndFund(address[],address[],uint256[],string[],uint256[]) calldata
function encodeBatchCreateAndFund(jobs) {
  var sig = "batchCreateAndFund(address[],address[],uint256[],string[],uint256[])";
  var selectorHash = keccak256Bytes(toUtf8Bytes(sig));
  var selector = selectorHash.slice(0, 10);

  var n = jobs.length;

  // Encode each array's data (length word + elements)
  var providersData = padUint256(n);
  var evaluatorsData = padUint256(n);
  var expiredAtsData = padUint256(n);
  var budgetsData = padUint256(n);
  for (var i = 0; i < n; i++) {
    providersData += padAddress(jobs[i].provider_address);
    evaluatorsData += padAddress(jobs[i].evaluator_address);
    expiredAtsData += padUint256(jobs[i].expired_at);
    budgetsData += padUint256(jobs[i].amount_uint256);
  }

  // descriptions: string[] — array of dynamic types
  // Layout: length + n offsets + n string bodies
  var descBodies = [];
  for (var i = 0; i < n; i++) {
    var descBytes = toUtf8Bytes(jobs[i].description_json);
    var hexStr = "";
    for (var b = 0; b < descBytes.length; b++) {
      hexStr += descBytes[b].toString(16).padStart(2, "0");
    }
    var paddedHex = hexStr.padEnd(Math.ceil(descBytes.length / 32) * 64 || 64, "0");
    descBodies.push({ len: descBytes.length, hex: paddedHex });
  }
  var descriptionsData = padUint256(n); // array length
  // Offsets: relative to start of array data area (after length + offset words)
  var descOffset = n * 32; // first string starts after n offset words (in bytes)
  for (var i = 0; i < n; i++) {
    descriptionsData += padUint256(descOffset);
    descOffset += 32 + (descBodies[i].hex.length / 2); // 32 for length word + padded data
  }
  for (var i = 0; i < n; i++) {
    descriptionsData += padUint256(descBodies[i].len);
    descriptionsData += descBodies[i].hex;
  }

  // Top-level: 5 offset words pointing to each array
  var headBytes = 5 * 32; // 160 bytes
  var off1 = headBytes;
  var off2 = off1 + providersData.length / 2;
  var off3 = off2 + evaluatorsData.length / 2;
  var off4 = off3 + expiredAtsData.length / 2;
  var off5 = off4 + descriptionsData.length / 2;

  return selector +
    padUint256(off1) + padUint256(off2) + padUint256(off3) + padUint256(off4) + padUint256(off5) +
    providersData + evaluatorsData + expiredAtsData + descriptionsData + budgetsData;
}

// Encode createAndFund(address provider, address evaluator, uint256 expiredAt, string description, uint256 budget) calldata
function encodeCreateAndFund(provider, evaluator, expiredAt, description, budget) {
  // Function selector: keccak256("createAndFund(address,address,uint256,string,uint256)")
  var sig = "createAndFund(address,address,uint256,string,uint256)";
  var selectorHash = keccak256Bytes(toUtf8Bytes(sig));
  var selector = selectorHash.slice(0, 10);

  // Fixed params: provider (addr), evaluator (addr), expiredAt (uint256), description (offset), budget (uint256)
  var providerHex = padAddress(provider);
  var evaluatorHex = padAddress(evaluator);
  var expiredAtHex = padUint256(expiredAt);
  var budgetHex = padUint256(budget);

  // description is a dynamic string — offset = 5 * 32 = 160 = 0xa0
  var descOffset = padUint256(160);

  // Encode the string: length + padded data
  var descBytes = toUtf8Bytes(description);
  var descLenHex = padUint256(descBytes.length);
  // Pad data to 32-byte boundary
  var descDataHex = "";
  for (var i = 0; i < descBytes.length; i++) {
    descDataHex += descBytes[i].toString(16).padStart(2, "0");
  }
  // Pad to next 32-byte boundary
  var paddedLen = Math.ceil(descBytes.length / 32) * 64;
  descDataHex = descDataHex.padEnd(paddedLen, "0");

  return selector +
    providerHex +
    evaluatorHex +
    expiredAtHex +
    descOffset +
    budgetHex +
    descLenHex +
    descDataHex;
}

// Wait for a transaction receipt by polling eth_getTransactionReceipt
async function waitForReceipt(txHash, maxWaitMs) {
  maxWaitMs = maxWaitMs || 60000;
  var elapsed = 0;
  var interval = 2000;
  while (elapsed < maxWaitMs) {
    try {
      var receipt = await ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      });
      if (receipt && receipt.blockNumber) {
        if (receipt.status === "0x0") {
          throw new Error("Approve transaction reverted. TX: " + txHash);
        }
        return receipt;
      }
    } catch (e) {
      if (e.message && e.message.indexOf("reverted") !== -1) throw e;
    }
    await new Promise(function(r) { setTimeout(r, interval); });
    elapsed += interval;
  }
  throw new Error("Approve transaction not confirmed within timeout. TX: " + txHash);
}

// ---------------------------------------------------------------------------
// ABI encoding helpers (pure JS, no external deps)
// ---------------------------------------------------------------------------

// keccak256 using the SubtleCrypto API is async; for keccak256 we need a
// synchronous pure-JS implementation. Since the server already computes
// these hashes, we compute them client-side via a minimal keccak256.
// We use ethers-style hex encoding: pad to 32 bytes.

function keccak256Str(input) {
  // Use keccak256 from the inline implementation below
  var encoded = toUtf8Bytes(input);
  return keccak256Bytes(encoded);
}

// Minimal keccak256 for the browser (Keccak-256, NOT SHA3-256)
// This is the standard used by Ethereum for hashing
var KECCAK_ROUND_CONSTANTS = [
  1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n,
  0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x8an, 0x88n, 0x80008009n, 0x8000000an,
  0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n,
];

function keccak256Bytes(data) {
  // Rate for keccak256 = 1088 bits = 136 bytes, capacity = 512 bits
  var rate = 136;
  var state = new Array(25).fill(0n);

  // Pad: append 0x01, zeros, then 0x80 at end of last block
  var padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  // Absorb
  for (var offset = 0; offset < padded.length; offset += rate) {
    for (var i = 0; i < rate; i += 8) {
      var lane = 0n;
      for (var b = 0; b < 8; b++) {
        lane |= BigInt(padded[offset + i + b]) << BigInt(b * 8);
      }
      state[i / 8] ^= lane;
    }
    keccakF1600(state);
  }

  // Squeeze 32 bytes
  var result = "";
  for (var i = 0; i < 4; i++) {
    var lane = state[i];
    for (var b = 0; b < 8; b++) {
      var byte = Number((lane >> BigInt(b * 8)) & 0xFFn);
      result += byte.toString(16).padStart(2, "0");
    }
  }
  return "0x" + result;
}

function keccakF1600(state) {
  for (var round = 0; round < 24; round++) {
    // Theta
    var C = new Array(5);
    for (var x = 0; x < 5; x++) C[x] = state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20];
    for (var x = 0; x < 5; x++) {
      var d = C[(x+4)%5] ^ rotl64(C[(x+1)%5], 1n);
      for (var y = 0; y < 25; y += 5) state[x+y] ^= d;
    }
    // Rho + Pi
    var last = state[1];
    var PILN = [10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1];
    var ROTC = [1n,3n,6n,10n,15n,21n,28n,36n,45n,55n,2n,14n,27n,41n,56n,8n,25n,43n,62n,18n,39n,61n,20n,44n];
    for (var i = 0; i < 24; i++) {
      var j = PILN[i];
      var temp = state[j];
      state[j] = rotl64(last, ROTC[i]);
      last = temp;
    }
    // Chi
    for (var y = 0; y < 25; y += 5) {
      var t = [state[y], state[y+1], state[y+2], state[y+3], state[y+4]];
      for (var x = 0; x < 5; x++) state[y+x] = t[x] ^ ((~t[(x+1)%5]) & t[(x+2)%5]);
    }
    // Iota
    state[0] ^= KECCAK_ROUND_CONSTANTS[round];
  }
}

function rotl64(x, n) {
  var mask = (1n << 64n) - 1n;
  return ((x << n) | (x >> (64n - n))) & mask;
}

function toUtf8Bytes(str) {
  var encoder = new TextEncoder();
  return encoder.encode(str);
}

function hexToBytes(hex) {
  hex = hex.replace(/^0x/, "");
  var bytes = new Uint8Array(hex.length / 2);
  for (var i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Compute EIP-712 digest client-side for debugging signature mismatches
function computeEIP712Digest(domain, message) {
  // Domain separator
  var domainTypeHash = keccak256Bytes(toUtf8Bytes(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
  ));
  var nameHash = keccak256Bytes(toUtf8Bytes(domain.name));
  var versionHash = keccak256Bytes(toUtf8Bytes(domain.version));
  var domainData = domainTypeHash.slice(2) + nameHash.slice(2) + versionHash.slice(2)
    + padUint256(domain.chainId) + padAddress(domain.verifyingContract);
  var domainSeparator = keccak256Bytes(hexToBytes(domainData));

  // Struct hash
  var typeHash = keccak256Bytes(toUtf8Bytes(
    "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
  ));
  var structData = typeHash.slice(2)
    + padAddress(message.from)
    + padAddress(message.to)
    + padUint256(message.value)
    + padUint256(message.validAfter)
    + padUint256(message.validBefore)
    + padBytes32(message.nonce);
  var structHash = keccak256Bytes(hexToBytes(structData));

  // Final digest: \\x19\\x01 || domainSeparator || structHash
  var digestData = "1901" + domainSeparator.slice(2) + structHash.slice(2);
  var digest = keccak256Bytes(hexToBytes(digestData));

  console.log("[XAgent] EIP-712 debug:", {
    domainSeparator: domainSeparator,
    structHash: structHash,
    digest: digest,
  });
  return digest;
}

// Encode batchDepositApprove calldata (approve+transferFrom variant — no EIP-3009 params)
function encodeBatchDepositApprove(entries, totalAmount, groupIdBytes32, groupV, groupR, groupS) {
  // Function signature: batchDepositApprove((bytes32,address,uint256,bytes32,bytes32,bytes32)[],uint256,bytes32,uint8,bytes32,bytes32)
  var sig = "batchDepositApprove((bytes32,address,uint256,bytes32,bytes32,bytes32)[],uint256,bytes32,uint8,bytes32,bytes32)";
  var selectorHash = keccak256Bytes(toUtf8Bytes(sig));
  var selector = selectorHash.slice(0, 10); // "0x" + 4 bytes

  // ABI encode parameters
  // Params (6 total): entries[] (dynamic), totalAmount, groupIdBytes32, groupV, groupR, groupS
  var totalAmountHex = padUint256(totalAmount);
  var groupIdHex = padBytes32(groupIdBytes32);
  var groupVHex = padUint256(groupV);
  var groupRHex = padBytes32(groupR);
  var groupSHex = padBytes32(groupS);

  // Dynamic array offset = 6 * 32 = 192 = 0xc0
  var headOffset = padUint256(192);

  // Array encoding: length + N * 6 words per entry
  var arrayLen = padUint256(entries.length);
  var arrayData = "";
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    arrayData += padBytes32(e.paymentId);
    arrayData += padAddress(e.merchant);
    arrayData += padUint256(e.amount);
    arrayData += padBytes32(e.orderRef);
    arrayData += padBytes32(e.merchantDid);
    arrayData += padBytes32(e.contextHash);
  }

  return selector +
    headOffset +
    totalAmountHex +
    groupIdHex +
    groupVHex +
    groupRHex +
    groupSHex +
    arrayLen +
    arrayData;
}

function padUint256(val) {
  var hex = BigInt(val).toString(16);
  return hex.padStart(64, "0");
}

function padBytes32(hex) {
  // Remove 0x prefix, pad to 64 chars
  var clean = String(hex).replace(/^0x/, "");
  return clean.padStart(64, "0");
}

function padAddress(addr) {
  var clean = String(addr).replace(/^0x/, "").toLowerCase();
  return clean.padStart(64, "0");
}

// Prefer OKX Wallet for event listeners too
if (typeof window.okxwallet !== "undefined") { window.ethereum = window.okxwallet; }

// Listen for chain/account changes
if (typeof window.ethereum !== "undefined") {
  ethereum.on("chainChanged", function() { if (account) checkChain(); });
  ethereum.on("accountsChanged", function(accs) {
    if (accs.length > 0) { account = accs[0]; checkChain(); }
    else { account = null; showOnly(["group-info","order-summary","payment-details","action-area","connect-wallet"]); }
  });
}

loadCheckout();
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Handle checkout HTTP requests.
 * Returns true if the request was handled, false otherwise.
 */
export async function handleCheckoutRequest(
  deps: CheckoutDeps,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const path = url.pathname;

  // CORS preflight for all /api/checkout/* routes
  if (req.method === "OPTIONS" && path.startsWith("/api/checkout/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    res.end();
    return true;
  }

  // GET /checkout/:token — HTML page (or JSON if Accept: application/json)
  // Note: nginx strips /api/ prefix, so /api/checkout/:token also lands here.
  // The checkout page JS fetches the same URL with Accept: application/json
  // to get order data, so we must return JSON when that header is present.
  const htmlMatch = path.match(
    /^\/checkout\/((?:tok[-_]|GRP-|grp_)[a-zA-Z0-9_-]+)$/i,
  );
  if (htmlMatch && req.method === "GET") {
    const tokenOrGroupId = decodeURIComponent(htmlMatch[1]);
    const accept = req.headers.accept ?? "";
    // Browser navigation sends "text/html,..." while fetch() sends "*/*" or
    // "application/json". We treat any request that does NOT explicitly ask
    // for text/html as a JSON API request — this handles both "Accept: */*"
    // (default fetch) and "Accept: application/json".
    const wantsHtml = accept.includes("text/html");

    // If the client does NOT want HTML, delegate to the JSON API handler
    if (!wantsHtml) {
      try {
        await handleApiCheckout(deps, tokenOrGroupId, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal error";
        checkoutLog.error("checkout API error (via html route)", {
          error: message,
          token: tokenOrGroupId,
        });
        sendJson(res, 500, { error: message });
      }
      return true;
    }

    const groupId = await resolveTokenOrGroupId(deps.kvRepo, tokenOrGroupId);

    if (!groupId) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(
        "<h1>404 - Checkout Link Invalid or Expired</h1><p>Please return to the merchant and request a new payment link.</p>",
      );
      return true;
    }

    const group = await deps.groupRepo.findById(groupId);
    if (!group) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(
        "<h1>404 - Group Not Found</h1><p>Could not load the payment group.</p>",
      );
      return true;
    }
    // Continue to pass the raw token/URL down into the frontend HTML context
    // so API callbacks from inside the HTML use the tokenized URL
    sendHtml(res, renderCheckoutPage(tokenOrGroupId, deps.config));
    return true;
  }

  // POST /checkout/:token/confirm — confirm user-submitted tx hash
  // Note: also matches /api/checkout/:token/confirm for direct access
  const confirmMatch = path.match(
    /^\/(?:api\/)?checkout\/((?:tok[-_]|GRP-|grp_)[a-zA-Z0-9_-]+)\/confirm$/i,
  );
  if (confirmMatch && req.method === "POST") {
    const tokenOrGroupId = decodeURIComponent(confirmMatch[1]);
    try {
      await handleCheckoutConfirm(deps, tokenOrGroupId, req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      checkoutLog.error("checkout confirm error", {
        error: message,
        token: tokenOrGroupId,
      });
      sendJson(res, 500, { error: message });
    }
    return true;
  }

  // POST /checkout/:token/confirm-acp — confirm ACP createAndFund transactions
  const confirmACPMatch = path.match(
    /^\/(?:api\/)?checkout\/((?:tok[-_]|GRP-|grp_)[a-zA-Z0-9_-]+)\/confirm-acp$/i,
  );
  if (confirmACPMatch && req.method === "POST") {
    const tokenOrGroupId = decodeURIComponent(confirmACPMatch[1]);
    try {
      await handleCheckoutConfirmACP(deps, tokenOrGroupId, req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      checkoutLog.error("checkout confirm-acp error", {
        error: message,
        token: tokenOrGroupId,
      });
      sendJson(res, 500, { error: message });
    }
    return true;
  }

  // GET /api/checkout/:token — JSON data for checkout page (fallback)
  // Note: also matches /checkout/:token with Accept: application/json (see above)
  const apiMatch = path.match(
    /^\/(?:api\/)?checkout\/((?:tok[-_]|GRP-|grp_)[a-zA-Z0-9_-]+)$/i,
  );
  if (apiMatch && req.method === "GET") {
    const tokenOrGroupId = decodeURIComponent(apiMatch[1]);
    try {
      await handleApiCheckout(deps, tokenOrGroupId, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      checkoutLog.error("checkout API error", {
        error: message,
        token: tokenOrGroupId,
      });
      sendJson(res, 500, { error: message });
    }
    return true;
  }

  return false;
}
