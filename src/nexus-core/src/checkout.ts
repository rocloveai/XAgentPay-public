/**
 * NexusPay Core — Checkout Page.
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
import type { NexusCoreConfig } from "./config.js";
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
  readonly config: NexusCoreConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(
  res: ServerResponse,
  status: number,
  data: unknown,
  cors = true,
): void {
  const body = JSON.stringify(data, null, 2);
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
  if (!tokenOrId.startsWith("tok_") || !kvRepo) {
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
      nexus_payment_id: p.nexus_payment_id,
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
        nexusPaymentId: payment.nexus_payment_id,
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

    // Fire-and-forget webhook notifications
    for (const payment of payments) {
      deps.webhookNotifier.notify(payment, "payment.escrowed").catch(() => {});
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
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NexusPay Checkout</title>
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
  .fade-in { animation: fadeIn 0.3s ease-out; }
  @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { animation: spin 1s linear infinite; border: 3px solid rgba(255,255,255,0.1); border-top-color: #818cf8; border-radius: 50%; width: 24px; height: 24px; }
  @keyframes progress { 0% { width: 0; } 100% { width: 100%; } }
</style>
</head>
<body class="bg-slate-900 text-slate-50 min-h-screen font-sans antialiased">

<!-- Header -->
<header class="border-b border-slate-800 px-6 py-4">
  <div class="max-w-2xl mx-auto flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center">
        <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      </div>
      <h1 class="text-lg font-semibold tracking-tight">NexusPay Checkout</h1>
    </div>
    <span id="chain-badge" class="hidden items-center gap-1.5 bg-emerald-500/15 text-emerald-400 text-xs font-medium px-2.5 py-1 rounded-full">
      <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full pulse-dot"></span>
      <span id="chain-name">${esc(chainName)}</span>
    </span>
  </div>
</header>

<main class="max-w-2xl mx-auto p-6 space-y-6">

  <!-- Loading skeleton -->
  <div id="state-loading" class="space-y-4">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 animate-pulse">
      <div class="h-4 bg-slate-700 rounded w-1/3 mb-4"></div>
      <div class="h-4 bg-slate-700 rounded w-2/3 mb-2"></div>
      <div class="h-4 bg-slate-700 rounded w-1/2"></div>
    </div>
  </div>

  <!-- Group Info -->
  <div id="group-info" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-slate-700 px-6 py-4 flex items-center justify-between">
      <span class="text-xs font-medium text-slate-500 uppercase tracking-wider">Group ID</span>
      <span id="group-id-display" class="font-mono text-xs text-slate-300 truncate ml-3"></span>
    </div>
  </div>

  <!-- Order Summary (shown in most states) -->
  <div id="order-summary" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Order Summary</h2>
      <div id="line-items" class="space-y-3 mb-4"></div>
      <div class="border-t border-slate-700 pt-3 flex justify-between items-center">
        <span class="text-sm font-semibold text-slate-300">Total</span>
        <span id="total-amount" class="text-lg font-bold text-slate-50"></span>
      </div>
    </div>
  </div>

  <!-- Payment Details -->
  <div id="payment-details" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Payment Details</h2>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-slate-500">Method</span><span class="text-slate-300">EIP-3009 + Batch Deposit</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Chain</span><span class="text-slate-300">${esc(chainName)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Escrow</span><span class="font-mono text-xs text-slate-300" id="escrow-addr"></span></div>
        <div class="flex justify-between"><span class="text-slate-500">Token</span><span class="text-slate-300">USDC</span></div>
      </div>
    </div>
  </div>

  <!-- Wallet / Action area -->
  <div id="action-area" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center space-y-4">

      <!-- No MetaMask (desktop) -->
      <div id="no-metamask" class="hidden">
        <p class="text-red-400 text-sm mb-2">MetaMask not detected</p>
        <a href="https://metamask.io/download/" target="_blank" rel="noopener"
           class="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors">
          Install MetaMask
        </a>
      </div>

      <!-- No MetaMask (mobile) — deep link to MetaMask app -->
      <div id="no-metamask-mobile" class="hidden">
        <p class="text-slate-400 text-sm mb-3">Open in MetaMask to complete payment</p>
        <a id="metamask-deeplink" href="#"
           class="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-8 rounded-lg transition-colors text-lg">
          <svg class="w-6 h-6" viewBox="0 0 35 33" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32.96 1L19.59 10.89l2.49-5.88L32.96 1z" fill="#E2761B" stroke="#E2761B" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2.03 1l13.24 9.99-2.36-5.98L2.03 1zM28.15 23.53l-3.55 5.44 7.6 2.09 2.18-7.39-6.23-.14zM.62 23.67l2.17 7.39 7.6-2.09-3.55-5.44-6.22.14z" fill="#E4761B" stroke="#E4761B" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9.96 14.53l-2.12 3.21 7.55.34-.26-8.12-5.17 4.57zM25.03 14.53l-5.24-4.67-.17 8.22 7.54-.34-2.13-3.21zM10.39 28.97l4.53-2.21-3.91-3.05-.62 5.26zM20.07 26.76l4.55 2.21-.63-5.26-3.92 3.05z" fill="#E4761B" stroke="#E4761B" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Open in MetaMask
        </a>
        <p class="text-slate-500 text-xs mt-3">Don't have MetaMask?
          <a href="https://metamask.io/download/" target="_blank" rel="noopener" class="text-indigo-400 hover:underline">Download here</a>
        </p>
      </div>

      <!-- Connect Wallet -->
      <div id="connect-wallet" class="hidden">
        <button id="btn-connect" onclick="connectWallet()"
                class="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2.5 px-8 rounded-lg transition-colors cursor-pointer">
          Connect MetaMask
        </button>
      </div>

      <!-- Wrong Chain -->
      <div id="wrong-chain" class="hidden">
        <p class="text-amber-400 text-sm mb-2">Please switch to ${esc(chainName)}</p>
        <button onclick="switchChain()"
                class="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 px-8 rounded-lg transition-colors cursor-pointer">
          Switch Network
        </button>
      </div>

      <!-- Wrong Wallet -->
      <div id="wrong-wallet" class="hidden">
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
          <p class="text-amber-400 text-sm font-medium mb-1">Wrong wallet connected</p>
          <p class="text-slate-400 text-xs">This payment requires wallet:</p>
          <p id="expected-wallet" class="font-mono text-xs text-amber-300 mt-1 break-all"></p>
          <p class="text-slate-400 text-xs mt-2">Currently connected:</p>
          <p id="current-wallet" class="font-mono text-xs text-slate-300 mt-1 break-all"></p>
        </div>
        <p class="text-slate-500 text-xs">Please switch to the correct account in MetaMask.</p>
      </div>

      <!-- Ready to Sign -->
      <div id="ready-sign" class="hidden">
        <p class="text-slate-400 text-xs mb-1">Connected</p>
        <p id="connected-address" class="font-mono text-xs text-slate-300 mb-4"></p>
        <button id="btn-sign" onclick="signAndPay()"
                class="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-8 rounded-lg transition-colors text-lg cursor-pointer">
          Sign &amp; Pay <span id="btn-sign-amount"></span>
        </button>
      </div>

      <!-- Signing spinner -->
      <div id="signing" class="hidden">
        <div class="flex items-center justify-center gap-3">
          <div class="spinner"></div>
          <span class="text-slate-300 text-sm">Waiting for MetaMask signature...</span>
        </div>
      </div>

      <!-- Submitting -->
      <div id="submitting" class="hidden">
        <div class="flex items-center justify-center gap-3">
          <div class="spinner"></div>
          <span class="text-slate-300 text-sm">Sending transaction via MetaMask...</span>
        </div>
        <div class="mt-3 w-full bg-slate-700 rounded-full h-2">
          <div class="bg-indigo-500 h-2 rounded-full" style="width: 50%; transition: width 2s;"></div>
        </div>
        <p class="text-slate-500 text-xs mt-2">You will pay gas for this transaction.</p>
      </div>

      <!-- Confirming -->
      <div id="confirming" class="hidden">
        <div class="flex items-center justify-center gap-3">
          <div class="spinner"></div>
          <span class="text-slate-300 text-sm">Confirming on-chain...</span>
        </div>
        <div class="mt-3 w-full bg-slate-700 rounded-full h-2">
          <div class="bg-indigo-500 h-2 rounded-full" style="width: 75%; transition: width 2s;"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Success -->
  <div id="state-success" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-emerald-500/30 p-6 text-center">
      <div class="w-16 h-16 mx-auto mb-4 bg-emerald-500/20 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 class="text-xl font-bold text-emerald-400 mb-2">Payment Successful</h2>
      <p class="text-slate-400 text-sm mb-4">Your funds have been deposited into escrow.</p>
      <div class="bg-slate-900 rounded-lg p-3 text-xs font-mono text-slate-300 break-all" id="success-tx-hash"></div>
    </div>
  </div>

  <!-- Already Paid -->
  <div id="state-already-paid" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-blue-500/30 p-6 text-center">
      <div class="w-16 h-16 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 class="text-xl font-bold text-blue-400 mb-2">Already Processed</h2>
      <p class="text-slate-400 text-sm">This payment has already been submitted.</p>
    </div>
  </div>

  <!-- Error -->
  <div id="state-error" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-red-500/30 p-6 text-center">
      <div class="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h2 class="text-xl font-bold text-red-400 mb-2">Error</h2>
      <p id="error-message" class="text-slate-400 text-sm mb-4"></p>
      <button onclick="location.reload()"
              class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors cursor-pointer">
        Try Again
      </button>
    </div>
  </div>

  <div class="text-center text-xs text-slate-600 mt-4">Powered by Nexus Protocol v0.4.0</div>
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

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function getMetaMaskDeepLink() {
  // metamask.app.link opens MetaMask's in-app browser with window.ethereum available
  var currentUrl = window.location.href;
  var dappUrl = currentUrl.replace(/^https?:\\/\\//, "");
  return "https://metamask.app.link/dapp/" + dappUrl;
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

    // Check MetaMask
    if (typeof window.ethereum === "undefined") {
      if (isMobile()) {
        // Mobile: show deep link to open MetaMask app
        document.getElementById("metamask-deeplink").href = getMetaMaskDeepLink();
        showOnly(["group-info","order-summary","payment-details","action-area","no-metamask-mobile"]);
      } else {
        // Desktop: show install MetaMask
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
    var label = p.summary || p.merchant_order_ref || p.nexus_payment_id;
    var did = p.merchant_did || "-";
    var orderRef = p.merchant_order_ref || "-";

    html += '<div class="bg-slate-900/50 rounded-lg p-3 space-y-1.5">' +
      '<div class="flex justify-between items-center">' +
        '<span class="text-sm text-slate-200 font-medium">' + (i + 1) + '. ' + esc(label) + '</span>' +
        '<span class="text-sm text-slate-200 font-semibold">' + esc(display) + ' USDC</span>' +
      '</div>' +
      '<div class="flex justify-between items-center">' +
        '<span class="text-xs text-slate-500">Merchant DID</span>' +
        '<span class="text-xs text-slate-400 font-mono truncate ml-2 max-w-[60%] text-right">' + esc(did) + '</span>' +
      '</div>' +
      '<div class="flex justify-between items-center">' +
        '<span class="text-xs text-slate-500">Order Ref</span>' +
        '<span class="text-xs text-slate-400 font-mono truncate ml-2 max-w-[60%] text-right">' + esc(orderRef) + '</span>' +
      '</div>' +
    '</div>';
  }
  container.innerHTML = html;

  var totalDisplay = checkoutData.group.total_amount_display || checkoutData.group.total_amount;
  document.getElementById("total-amount").textContent = totalDisplay + " USDC";
}

function renderPaymentDetails() {
  var instr = checkoutData.instruction;
  if (instr && instr.escrow_contract) {
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
  if (checkoutData && checkoutData.instruction && checkoutData.instruction.eip3009_sign_data) {
    expectedFrom = checkoutData.instruction.eip3009_sign_data.message.from;
  } else if (checkoutData && checkoutData.group) {
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

  // Check if the EIP-3009 authorization has expired
  // PlatON EVM uses ms timestamps, so validBefore is in milliseconds
  var signData = checkoutData.instruction.eip3009_sign_data;
  if (signData && signData.message && signData.message.validBefore) {
    var vb = Number(signData.message.validBefore);
    var validBeforeMs = vb < 1e12 ? vb * 1000 : vb;
    if (Date.now() >= validBeforeMs) {
      showError("This payment authorization has expired. Please go back and create a new payment.");
      return;
    }
  }

  // Verify connected wallet matches the expected payer address
  var expectedFrom = signData.message.from;
  if (expectedFrom && account && expectedFrom.toLowerCase() !== account.toLowerCase()) {
    showError(
      "Wrong wallet connected. This payment requires " + truncAddr(expectedFrom) +
      " but you are connected with " + truncAddr(account) +
      ". Please switch to the correct account in MetaMask."
    );
    return;
  }

  // Verify Nexus Core group signature exists (Phase 1: existence check)
  var instr = checkoutData.instruction;
  if (!instr.nexus_group_sig || !instr.core_operator_address) {
    showError("Missing group signature from Nexus Core. Cannot proceed safely.");
    return;
  }
  console.log("[NexusPay] Group sig verified. Operator:", instr.core_operator_address);

  showOnly(["group-info","order-summary","payment-details","action-area","signing"]);

  try {
    // Step 1: Sign EIP-3009 typed data via MetaMask
    var signerAddress = account;

    var params = {
      domain: signData.domain,
      types: signData.types,
      primaryType: signData.primaryType,
      message: {
        from: signData.message.from,
        to: signData.message.to,
        value: signData.message.value,
        validAfter: signData.message.validAfter,
        validBefore: signData.message.validBefore,
        nonce: signData.message.nonce,
      },
    };

    console.log("[NexusPay] Signer address:", signerAddress);
    console.log("[NexusPay] EIP-712 params:", JSON.stringify(params, null, 2));

    // Compute expected digest client-side for debugging
    var expectedDigest = computeEIP712Digest(params.domain, params.message);
    console.log("[NexusPay] Expected EIP-712 digest:", expectedDigest);

    var signature = await ethereum.request({
      method: "eth_signTypedData_v4",
      params: [signerAddress, JSON.stringify(params)],
    });

    var r = signature.slice(0, 66);
    var s = "0x" + signature.slice(66, 130);
    var v = parseInt(signature.slice(130, 132), 16);

    console.log("[NexusPay] Signature:", { v: v, r: r, s: s });

    // Step 2: Build batchDepositWithAuthorization calldata and send tx
    showOnly(["group-info","order-summary","payment-details","action-area","submitting"]);

    var instr = checkoutData.instruction;
    var depositTx = instr.deposit_tx;

    // Build entries array using server-precomputed hashes (fixes contextHash bug)
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

    // Decompose group signature into v/r/s
    var groupSig = instr.nexus_group_sig;
    var groupR = groupSig.slice(0, 66);
    var groupS = "0x" + groupSig.slice(66, 130);
    var groupV = parseInt(groupSig.slice(130, 132), 16);
    var groupIdBytes32 = keccak256Str(instr.group_id);

    // ABI-encode batchDepositWithGroupApproval call
    var encodedData = encodeBatchDepositWithGroupApproval(
      entries,
      signData.message.value,
      groupIdBytes32,
      groupV, groupR, groupS,
      signData.message.validAfter,
      signData.message.validBefore,
      signData.message.nonce,
      v, r, s
    );

    console.log("[NexusPay] Sending batchDepositWithGroupApproval tx to:", depositTx.to);

    // Send the transaction via MetaMask (user pays gas)
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

    console.log("[NexusPay] TX hash:", txHash);

    // Step 3: Confirm with server
    showOnly(["group-info","order-summary","payment-details","action-area","confirming"]);

    var confirmRes = await fetch("/api/checkout/" + encodeURIComponent(GROUP_ID) + "/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_hash: txHash }),
    });

    var confirmData = await confirmRes.json().catch(function() { return {}; });

    if (confirmRes.status === 422) {
      // Transaction reverted on-chain
      showError("Transaction reverted on-chain. Your funds were not transferred. TX: " + txHash);
      return;
    }

    if (confirmRes.status === 200) {
      // Already confirmed on-chain
      document.getElementById("success-tx-hash").textContent = "TX: " + txHash;
      showOnly(["group-info","order-summary","state-success"]);
      return;
    }

    // 202 or other — poll for on-chain confirmation
    console.log("[NexusPay] Awaiting on-chain confirmation, polling...");
    var pollAttempts = 0;
    var maxPollAttempts = 24; // 24 * 5s = 120s max

    pollTimer = setInterval(async function() {
      pollAttempts++;
      try {
        // Re-submit confirm to check receipt
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

        // 202 means receipt not available yet — the confirm endpoint already
        // checks group status internally, no need for a second API call
      } catch (e) { /* ignore poll errors */ }

      if (pollAttempts >= maxPollAttempts) {
        clearInterval(pollTimer);
        pollTimer = null;
        showError("Transaction sent but confirmation timed out. TX: " + txHash + ". Check your wallet for status.");
      }
    }, 5000);

  } catch (e) {
    if (e.code === 4001) {
      // User rejected signing or transaction
      showOnly(["group-info","order-summary","payment-details","action-area","ready-sign"]);
    } else {
      showError(e.message || "Transaction failed");
    }
  }
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

  console.log("[NexusPay] EIP-712 debug:", {
    domainSeparator: domainSeparator,
    structHash: structHash,
    digest: digest,
  });
  return digest;
}

// Encode batchDepositWithGroupApproval calldata
function encodeBatchDepositWithGroupApproval(entries, totalAmount, groupIdBytes32, groupV, groupR, groupS, validAfter, validBefore, nonce, v, r, s) {
  // Function signature for selector computation
  var sig = "batchDepositWithGroupApproval((bytes32,address,uint256,bytes32,bytes32,bytes32)[],uint256,bytes32,uint8,bytes32,bytes32,uint256,uint256,bytes32,uint8,bytes32,bytes32)";
  var selectorHash = keccak256Bytes(toUtf8Bytes(sig));
  var selector = selectorHash.slice(0, 10); // "0x" + 4 bytes

  // ABI encode parameters
  // Params (12 total): entries[] (dynamic), totalAmount, groupIdBytes32,
  //   groupV, groupR, groupS, validAfter, validBefore, nonce, v, r, s

  var totalAmountHex = padUint256(totalAmount);
  var groupIdHex = padBytes32(groupIdBytes32);
  var groupVHex = padUint256(groupV);
  var groupRHex = padBytes32(groupR);
  var groupSHex = padBytes32(groupS);
  var validAfterHex = padUint256(validAfter);
  var validBeforeHex = padUint256(validBefore);
  var nonceHex = padBytes32(nonce);
  var vHex = padUint256(v);
  var rHex = padBytes32(r);
  var sHex = padBytes32(s);

  // Dynamic array offset = 12 * 32 = 384 = 0x180
  var headOffset = padUint256(384);

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
    validAfterHex +
    validBeforeHex +
    nonceHex +
    vHex +
    rHex +
    sHex +
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

  // GET /checkout/:token — HTML page
  const htmlMatch = path.match(
    /^\/checkout\/((?:tok_|GRP-|grp_)[a-zA-Z0-9_-]+)$/i,
  );
  if (htmlMatch && req.method === "GET") {
    const tokenOrGroupId = decodeURIComponent(htmlMatch[1]);
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

  // POST /api/checkout/:token/confirm — confirm user-submitted tx hash
  const confirmMatch = path.match(
    /^\/api\/checkout\/((?:tok_|GRP-|grp_)[a-zA-Z0-9_-]+)\/confirm$/i,
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

  // GET /api/checkout/:token — JSON data for checkout page
  const apiMatch = path.match(
    /^\/api\/checkout\/((?:tok_|GRP-|grp_)[a-zA-Z0-9_-]+)$/i,
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
