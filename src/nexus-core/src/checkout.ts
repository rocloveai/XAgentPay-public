/**
 * NexusPay Core — Checkout Page.
 *
 * Serves the checkout HTML page and API endpoints for MetaMask + EIP-3009
 * payment flow. Users sign a typed data message, the signature is submitted
 * to the relayer, which deposits into escrow on-chain.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GroupRepository } from "./db/interfaces/group-repo.js";
import type { PaymentRepository } from "./db/interfaces/payment-repo.js";
import type { PaymentStateMachine } from "./services/state-machine.js";
import type { NexusRelayer } from "./services/relayer.js";
import type { WebhookNotifier } from "./services/webhook-notifier.js";
import type { NexusCoreConfig } from "./config.js";
import type { Hex } from "./types.js";
import { keccak256, toHex } from "viem";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface CheckoutDeps {
  readonly groupRepo: GroupRepository;
  readonly paymentRepo: PaymentRepository;
  readonly stateMachine: PaymentStateMachine;
  readonly relayer: NexusRelayer | null;
  readonly webhookNotifier: WebhookNotifier;
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

// ---------------------------------------------------------------------------
// GET /api/checkout/:groupId — JSON data
// ---------------------------------------------------------------------------

async function handleApiCheckout(
  deps: CheckoutDeps,
  groupId: string,
  res: ServerResponse,
): Promise<void> {
  const group = await deps.groupRepo.findById(groupId);
  if (!group) {
    sendJson(res, 404, { error: "Group not found" });
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
// POST /api/checkout/:groupId/submit — Submit EIP-3009 signature
// ---------------------------------------------------------------------------

async function handleCheckoutSubmit(
  deps: CheckoutDeps,
  groupId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!deps.relayer) {
    sendJson(res, 503, { error: "Relayer not configured" });
    return;
  }

  let body: { v?: number; r?: string; s?: string };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  if (
    typeof body.v !== "number" ||
    typeof body.r !== "string" ||
    typeof body.s !== "string"
  ) {
    sendJson(res, 400, { error: "Missing required fields: v, r, s" });
    return;
  }

  const group = await deps.groupRepo.findById(groupId);
  if (!group) {
    sendJson(res, 404, { error: "Group not found" });
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

  // Read instruction for deposit params
  const instruction = await deps.groupRepo.findInstruction(groupId);
  if (!instruction) {
    sendJson(res, 400, { error: "No instruction found for this group" });
    return;
  }

  try {
    // Transition all payments to AWAITING_TX
    for (const payment of payments) {
      await deps.stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "AWAITING_TX",
        eventType: "EIP3009_SIGNATURE_RECEIVED",
        metadata: { group_id: groupId, source: "checkout" },
      });
    }

    // Use first payment for the on-chain deposit (aggregated payment)
    const firstPayment = payments[0];
    const orderRefHash = keccak256(toHex(firstPayment.merchant_order_ref));
    const merchantDidHash = keccak256(toHex(firstPayment.merchant_did));
    const contextHash = keccak256(
      toHex(JSON.stringify(firstPayment.quote_payload.context)),
    );

    const depositResult = await deps.relayer.submitDeposit({
      paymentId: (firstPayment.payment_id_bytes32 ??
        keccak256(toHex(firstPayment.nexus_payment_id))) as Hex,
      from: firstPayment.payer_wallet as Hex,
      merchant: firstPayment.payment_address as Hex,
      amount: BigInt(group.total_amount),
      orderRef: orderRefHash as Hex,
      merchantDid: merchantDidHash as Hex,
      contextHash: contextHash as Hex,
      validAfter: 0n,
      validBefore: BigInt(firstPayment.quote_payload.expiry),
      nonce: (firstPayment.eip3009_nonce ?? "0x0") as Hex,
      v: body.v,
      r: body.r as Hex,
      s: body.s as Hex,
    });

    // Transition all payments to BROADCASTED
    for (const payment of payments) {
      await deps.stateMachine.transition({
        nexusPaymentId: payment.nexus_payment_id,
        toStatus: "BROADCASTED",
        eventType: "RELAYER_TX_SUBMITTED",
        metadata: { tx_hash: depositResult.txHash },
        fields: { tx_hash: depositResult.txHash },
      });
    }

    // Fire-and-forget webhook notifications
    for (const payment of payments) {
      deps.webhookNotifier.notify(payment, "payment.escrowed").catch(() => {});
    }

    sendJson(res, 200, {
      tx_hash: depositResult.txHash,
      block_number: depositResult.blockNumber.toString(),
      status: "submitted",
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

  <!-- Order Summary (shown in most states) -->
  <div id="order-summary" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Order Summary</h2>
      <div id="line-items" class="space-y-2 mb-4"></div>
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
        <div class="flex justify-between"><span class="text-slate-500">Method</span><span class="text-slate-300">EIP-3009 (Gasless)</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Chain</span><span class="text-slate-300">${esc(chainName)}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Escrow</span><span class="font-mono text-xs text-slate-300" id="escrow-addr"></span></div>
        <div class="flex justify-between"><span class="text-slate-500">Token</span><span class="text-slate-300">USDC</span></div>
      </div>
    </div>
  </div>

  <!-- Wallet / Action area -->
  <div id="action-area" class="hidden fade-in">
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center space-y-4">

      <!-- No MetaMask -->
      <div id="no-metamask" class="hidden">
        <p class="text-red-400 text-sm mb-2">MetaMask not detected</p>
        <a href="https://metamask.io/download/" target="_blank" rel="noopener"
           class="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors">
          Install MetaMask
        </a>
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
          <span class="text-slate-300 text-sm">Submitting to relayer...</span>
        </div>
        <div class="mt-3 w-full bg-slate-700 rounded-full h-2">
          <div class="bg-indigo-500 h-2 rounded-full" style="width: 50%; transition: width 2s;"></div>
        </div>
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

function truncAddr(addr) {
  if (!addr) return "-";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function showOnly(ids) {
  var allStates = ["state-loading","order-summary","payment-details","action-area",
    "state-success","state-already-paid","state-error",
    "no-metamask","connect-wallet","wrong-chain","ready-sign","signing","submitting","confirming"];
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
  showOnly(["order-summary","state-error"]);
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
    if (gs !== "GROUP_CREATED") {
      renderOrderSummary();
      if (gs === "GROUP_ESCROWED" || gs === "GROUP_SETTLED" || gs === "GROUP_COMPLETED") {
        showOnly(["order-summary","state-already-paid"]);
      } else {
        showOnly(["order-summary","state-already-paid"]);
      }
      return;
    }

    renderOrderSummary();
    renderPaymentDetails();

    // Check MetaMask
    if (typeof window.ethereum === "undefined") {
      showOnly(["order-summary","payment-details","action-area","no-metamask"]);
      return;
    }

    showOnly(["order-summary","payment-details","action-area","connect-wallet"]);

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
    html += '<div class="flex justify-between items-center text-sm">' +
      '<span class="text-slate-300">' + (i + 1) + '. ' + esc(label) + '</span>' +
      '<span class="text-slate-300 font-medium">' + esc(display) + ' USDC</span>' +
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
    showOnly(["order-summary","payment-details","action-area","wrong-chain"]);
    return;
  }
  document.getElementById("chain-badge").classList.remove("hidden");
  document.getElementById("chain-badge").classList.add("flex");
  document.getElementById("connected-address").textContent = truncAddr(account);
  var total = checkoutData.group.total_amount_display || checkoutData.group.total_amount;
  document.getElementById("btn-sign-amount").textContent = total + " USDC";
  showOnly(["order-summary","payment-details","action-area","ready-sign"]);
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
  showOnly(["order-summary","payment-details","action-area","signing"]);

  try {
    var signData = checkoutData.instruction.eip3009_sign_data;
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

    var signature = await ethereum.request({
      method: "eth_signTypedData_v4",
      params: [account, JSON.stringify(params)],
    });

    var r = signature.slice(0, 66);
    var s = "0x" + signature.slice(66, 130);
    var v = parseInt(signature.slice(130, 132), 16);

    // Submit
    showOnly(["order-summary","payment-details","action-area","submitting"]);

    var submitRes = await fetch("/api/checkout/" + encodeURIComponent(GROUP_ID) + "/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v: v, r: r, s: s }),
    });

    if (!submitRes.ok) {
      var err = await submitRes.json().catch(function() { return { error: "Submit failed" }; });
      showError(err.error || "Submit failed");
      return;
    }

    var result = await submitRes.json();

    // Confirming
    showOnly(["order-summary","payment-details","action-area","confirming"]);

    // Poll for confirmation
    pollTimer = setInterval(async function() {
      try {
        var pollRes = await fetch("/api/checkout/" + encodeURIComponent(GROUP_ID));
        if (pollRes.ok) {
          var data = await pollRes.json();
          var gs = data.group.status;
          if (gs === "GROUP_ESCROWED" || gs === "GROUP_SETTLED" || gs === "GROUP_COMPLETED") {
            clearInterval(pollTimer);
            document.getElementById("success-tx-hash").textContent = "TX: " + (result.tx_hash || "-");
            showOnly(["order-summary","state-success"]);
          }
        }
      } catch (e) { /* ignore poll errors */ }
    }, 3000);

    // Also show success after a short delay if we got tx_hash
    if (result.tx_hash) {
      setTimeout(function() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        document.getElementById("success-tx-hash").textContent = "TX: " + result.tx_hash;
        showOnly(["order-summary","state-success"]);
      }, 10000);
    }

  } catch (e) {
    if (e.code === 4001) {
      // User rejected
      showOnly(["order-summary","payment-details","action-area","ready-sign"]);
    } else {
      showError(e.message || "Signing failed");
    }
  }
}

// Listen for chain/account changes
if (typeof window.ethereum !== "undefined") {
  ethereum.on("chainChanged", function() { if (account) checkChain(); });
  ethereum.on("accountsChanged", function(accs) {
    if (accs.length > 0) { account = accs[0]; checkChain(); }
    else { account = null; showOnly(["order-summary","payment-details","action-area","connect-wallet"]); }
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

  // GET /checkout/:groupId — HTML page
  const htmlMatch = path.match(/^\/checkout\/(GRP-[a-zA-Z0-9_-]+)$/);
  if (htmlMatch && req.method === "GET") {
    const groupId = decodeURIComponent(htmlMatch[1]);
    const group = await deps.groupRepo.findById(groupId);
    if (!group) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Group not found");
      return true;
    }
    sendHtml(res, renderCheckoutPage(groupId, deps.config));
    return true;
  }

  // POST /api/checkout/:groupId/submit — submit signature
  const submitMatch = path.match(
    /^\/api\/checkout\/(GRP-[a-zA-Z0-9_-]+)\/submit$/,
  );
  if (submitMatch && req.method === "POST") {
    const groupId = decodeURIComponent(submitMatch[1]);
    await handleCheckoutSubmit(deps, groupId, req, res);
    return true;
  }

  // GET /api/checkout/:groupId — JSON data
  const apiMatch = path.match(/^\/api\/checkout\/(GRP-[a-zA-Z0-9_-]+)$/);
  if (apiMatch && req.method === "GET") {
    const groupId = decodeURIComponent(apiMatch[1]);
    await handleApiCheckout(deps, groupId, res);
    return true;
  }

  return false;
}
