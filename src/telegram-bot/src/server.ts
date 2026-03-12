#!/usr/bin/env node
/**
 * Telegram Bot — HTTP server + entry point.
 *
 * POST /api/render-order    — Send an XAgent Pay order card (group-status mode).
 * POST /start-order-panel   — Send a live PAID/UNPAID panel (merchant-status mode).
 * POST /telegram/webhook    — Receive callback_query from inline keyboard buttons.
 * GET  /health              — Health check.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { NexusClient } from "./nexus-client.js";
import { TelegramClient } from "./telegram-client.js";
import { StatusPoller } from "./status-poller.js";
import { renderOrderMessage } from "./message-renderer.js";
import type { RenderOrderRequest } from "./types.js";

// ---------------------------------------------------------------------------
// Order Panel — live PAID/UNPAID tracking per merchant order ref
// ---------------------------------------------------------------------------

interface OrderPanelState {
  chatId: number | string;
  groupId: string;
  checkoutUrl: string;
  outRef: string;
  hotelRef: string | null;
  backRef: string | null;
  messageId: number | null;
  /** When Eva passes her own bot token, we use it instead of the Orders bot. */
  customTgClient: TelegramClient | null;
}

interface OrderPanelJob {
  state: OrderPanelState;
  timer: ReturnType<typeof setInterval>;
}

const panelJobs = new Map<string, OrderPanelJob>();
const panelLog = createLogger("OrderPanel");

const FLIGHT_API_URL = process.env.FLIGHT_API || "https://xagenpay.com/flight/api/v1/call-tool";
const HOTEL_API_URL  = process.env.HOTEL_API  || "https://xagenpay.com/hotel/api/v1/call-tool";

async function checkMerchantStatus(orderRef: string | null, kind: "flight" | "hotel"): Promise<string> {
  if (!orderRef) return "N/A";
  try {
    const api = kind === "hotel" ? HOTEL_API_URL : FLIGHT_API_URL;
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "nexus_check_status", arguments: { order_ref: orderRef } }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await res.json()) as { data?: { status?: string } };
    return data?.data?.status || "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function fmtMerchantStatus(s: string): string {
  if (s === "PAID")    return "✅ PAID";
  if (s === "UNPAID")  return "⏳ UNPAID";
  if (s === "EXPIRED") return "⌛ EXPIRED";
  if (s === "N/A")     return "—";
  return `❔ ${s}`;
}

function buildPanelText(state: OrderPanelState, statuses: Record<string, string>): string {
  const vals = Object.values(statuses).filter((s) => s !== "N/A");
  const allPaid = vals.length > 0 && vals.every((s) => s === "PAID");

  const header = allPaid
    ? "✅ <b>XAgent Pay 订单（已全部支付）</b>"
    : "🧾 <b>XAgent Pay 订单</b>  <i>自动刷新中</i>";

  const lines: string[] = [header, ""];
  if (state.outRef)   lines.push(`✈️ 去程  <code>${state.outRef}</code>：${fmtMerchantStatus(statuses.out ?? "UNKNOWN")}`);
  if (state.hotelRef) lines.push(`🏨 酒店  <code>${state.hotelRef}</code>：${fmtMerchantStatus(statuses.hotel ?? "UNKNOWN")}`);
  if (state.backRef)  lines.push(`✈️ 返程  <code>${state.backRef}</code>：${fmtMerchantStatus(statuses.back ?? "UNKNOWN")}`);
  lines.push("", `🔖 Group: <code>${state.groupId}</code>`);

  return lines.join("\n");
}

function buildPanelKeyboard(state: OrderPanelState, allPaid: boolean) {
  if (allPaid) {
    return { inline_keyboard: [[{ text: "✅ 支付完成", callback_data: "noop" }]] };
  }
  // When a custom token is used (Eva's own bot), omit the manual-refresh button
  // because callback_query would be routed to Eva's bot (OpenClaw), not our webhook.
  if (state.customTgClient) {
    return {
      inline_keyboard: [
        [{ text: "💳 去收银台支付", url: state.checkoutUrl }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [{ text: "💳 去收银台支付", url: state.checkoutUrl }],
      [{ text: "🔄 手动刷新", callback_data: `refresh:${state.groupId}` }],
    ],
  };
}

async function updatePanelMessage(state: OrderPanelState, tgClient: TelegramClient, _unused?: unknown): Promise<boolean> {
  // Always prefer state.customTgClient so the card is edited by the same bot that sent it.
  tgClient = state.customTgClient ?? tgClient;
  const [out, hotel, back] = await Promise.all([
    checkMerchantStatus(state.outRef,   "flight"),
    checkMerchantStatus(state.hotelRef, "hotel"),
    checkMerchantStatus(state.backRef,  "flight"),
  ]);
  const statuses = { out, hotel, back };

  const vals = Object.values(statuses).filter((s) => s !== "N/A");
  const allPaid = vals.length > 0 && vals.every((s) => s === "PAID");

  const text = buildPanelText(state, statuses);
  const markup = buildPanelKeyboard(state, allPaid);

  if (state.messageId !== null) {
    await tgClient.editHtmlMessage(state.chatId, state.messageId, text, markup);
  }

  if (allPaid) {
    const job = panelJobs.get(state.groupId);
    if (job) {
      clearInterval(job.timer);
      panelJobs.delete(state.groupId);
      panelLog.info("All paid — stopped polling", { groupId: state.groupId });
    }
  }
  return allPaid;
}

const log = createLogger("Server");

// ---------------------------------------------------------------------------
// Zod schema for request validation
// ---------------------------------------------------------------------------

const PaymentSchema = z.object({
  nexus_payment_id: z.string(),
  merchant_order_ref: z.string(),
  amount_display: z.string(),
  status: z.string(),
  summary: z.string().optional(),
});

const RenderOrderSchema = z.object({
  chat_id: z.union([z.number(), z.string()]),
  checkout_url: z.string().url(),
  group_id: z.string(),
  total_amount_display: z.string(),
  currency: z.string().default("USDC"),
  payments: z.array(PaymentSchema).min(1),
});

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const config = loadConfig();
const nexusClient = new NexusClient(config.nexusCoreUrl);
const telegramClient = new TelegramClient(config.telegramBotToken);
const statusPoller = new StatusPoller(nexusClient, telegramClient, {
  pollIntervalMs: config.pollIntervalMs,
  pollBackoffMs: config.pollBackoffMs,
  maxPollCount: config.maxPollCount,
});

const server = createServer(async (req, res) => {
  const { method, url } = req;

  // CORS preflight
  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (method === "GET" && url === "/health") {
    jsonResponse(res, 200, {
      status: "ok",
      active_polls: statusPoller.activePollCount,
    });
    return;
  }

  // Skill manifest
  if (method === "GET" && url === "/skill.md") {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const skillPath = join(__dirname, "..", "skill.md");
      const content = readFileSync(skillPath, "utf-8");
      setCorsHeaders(res);
      res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
      res.end(content);
    } catch {
      jsonResponse(res, 500, { error: "skill.md not found" });
    }
    return;
  }

  // Render order (group-status mode)
  if (method === "POST" && url === "/api/render-order") {
    await handleRenderOrder(req, res);
    return;
  }

  // Start order panel (merchant PAID/UNPAID mode)
  if (method === "POST" && url === "/start-order-panel") {
    await handleStartOrderPanel(req, res);
    return;
  }

  // Telegram webhook — callback_query from inline buttons
  if (method === "POST" && url === "/telegram/webhook") {
    await handleTelegramWebhook(req, res);
    return;
  }

  // Payment notify — pushed by nexus-core on state changes (no polling needed)
  if (method === "POST" && url === "/api/payment-notify") {
    await handlePaymentNotify(req, res);
    return;
  }

  jsonResponse(res, 404, { error: "Not Found" });
});

async function handleRenderOrder(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    jsonResponse(res, 400, { error: "Failed to read request body" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    jsonResponse(res, 400, { error: "Invalid JSON" });
    return;
  }

  const result = RenderOrderSchema.safeParse(parsed);
  if (!result.success) {
    jsonResponse(res, 400, {
      error: "Validation failed",
      details: result.error.issues,
    });
    return;
  }

  const order: RenderOrderRequest = result.data;

  try {
    // Render the message
    const rendered = renderOrderMessage(order);

    // Send to Telegram
    const messageId = await telegramClient.sendOrderMessage(
      order.chat_id,
      rendered,
    );

    // Start polling for status updates
    statusPoller.startPolling({
      chatId: order.chat_id,
      messageId,
      groupId: order.group_id,
      checkoutUrl: order.checkout_url,
      startedAt: Date.now(),
      lastRenderedHash: rendered.contentHash,
    });

    jsonResponse(res, 200, {
      ok: true,
      message_id: messageId,
      group_id: order.group_id,
    });
  } catch (err) {
    log.error("Failed to render order", {
      error: err instanceof Error ? err.message : String(err),
      group_id: order.group_id,
    });
    jsonResponse(res, 500, {
      error: "Failed to send Telegram message",
    });
  }
}

// ---------------------------------------------------------------------------
// POST /start-order-panel
// ---------------------------------------------------------------------------

const StartOrderPanelSchema = z.object({
  chatId: z.union([z.number(), z.string()]),
  groupId: z.string(),
  checkoutUrl: z.string().url(),
  outRef: z.string(),
  hotelRef: z.string().optional().nullable(),
  backRef: z.string().optional().nullable(),
  intervalSec: z.number().optional(),
  /**
   * Optional: Eva (OpenClaw) can pass her own Telegram bot token here.
   * When provided, the order card is sent by Eva's bot instead of the Orders bot,
   * making the whole booking conversation appear as a single bot — no second bot needed.
   * Auto-refresh still works (every ~10 s); manual-refresh button is omitted to avoid
   * callback_query routing issues.
   */
  botToken: z.string().optional(),
});

async function handleStartOrderPanel(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try { body = await readBody(req); } catch { jsonResponse(res, 400, { error: "Failed to read body" }); return; }

  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { jsonResponse(res, 400, { error: "Invalid JSON" }); return; }

  const result = StartOrderPanelSchema.safeParse(parsed);
  if (!result.success) {
    jsonResponse(res, 400, { error: "Validation failed", details: result.error.issues });
    return;
  }

  const { chatId, groupId, checkoutUrl, outRef, hotelRef, backRef, intervalSec, botToken } = result.data;

  // Cancel previous job for this group (idempotent)
  const prev = panelJobs.get(groupId);
  if (prev) { clearInterval(prev.timer); panelJobs.delete(groupId); }

  // If Eva passes her own bot token, use a dedicated client for this job
  const customTgClient = botToken ? new TelegramClient(botToken) : null;

  const state: OrderPanelState = {
    chatId, groupId, checkoutUrl,
    outRef,
    hotelRef: hotelRef ?? null,
    backRef:  backRef  ?? null,
    messageId: null,
    customTgClient,
  };

  // Which client actually sends/edits this card
  const activeClient = customTgClient ?? telegramClient;

  try {
    // Send placeholder
    const msgId = await activeClient.sendHtmlMessage(
      chatId,
      "🧾 <b>XAgent Pay 订单</b> — 正在初始化…",
      buildPanelKeyboard(state, false),
    );
    state.messageId = msgId;

    // First update (uses activeClient via state.customTgClient)
    await updatePanelMessage(state, activeClient);

    const ms = Math.max(5, (intervalSec ?? 10)) * 1000;
    const timer = setInterval(() => {
      updatePanelMessage(state, activeClient).catch((e: unknown) =>
        panelLog.error("Panel update failed", { groupId, error: e instanceof Error ? e.message : String(e) }),
      );
    }, ms);

    panelJobs.set(groupId, { state, timer });

    jsonResponse(res, 200, {
      ok: true, groupId, messageId: msgId, pollEverySec: ms / 1000,
      mode: customTgClient ? "custom_bot" : "orders_bot",
    });
  } catch (err) {
    panelLog.error("Failed to start order panel", {
      groupId,
      error: err instanceof Error ? err.message : String(err),
    });
    jsonResponse(res, 500, { ok: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ---------------------------------------------------------------------------
// POST /telegram/webhook  — handles callback_query + /chatid command
// ---------------------------------------------------------------------------

async function handleTelegramWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try { body = await readBody(req); } catch { res.writeHead(200); res.end(); return; }

  let update: {
    callback_query?: { id: string; data?: string };
    message?: { chat: { id: number; title?: string; type: string }; text?: string; message_id: number };
  };
  try { update = JSON.parse(body); } catch { res.writeHead(200); res.end(); return; }

  // /chatid command — reply with the current chat ID (works in private & groups)
  const msg = update.message;
  if (msg?.text && (msg.text === "/chatid" || msg.text.startsWith("/chatid@"))) {
    const chat = msg.chat;
    const label = chat.title ? `「${chat.title}」` : "这个对话";
    const typeLabel = chat.type === "private" ? "私聊" : chat.type === "group" ? "群组" : "频道/超级群";
    const replyText =
      `📋 <b>${label}</b> 的 Chat ID：\n` +
      `<code>${chat.id}</code>\n\n` +
      `类型：${typeLabel}\n` +
      `把这个 ID 告诉 OpenClaw，下次订单卡片就会发到这里。`;
    await telegramClient.sendHtmlMessage(chat.id, replyText);
    res.writeHead(200); res.end();
    return;
  }

  const cb = update.callback_query;
  if (!cb) { res.writeHead(200); res.end(); return; }

  // noop button — just dismiss the spinner
  if (!cb.data || cb.data === "noop") {
    await telegramClient.answerCallback(cb.id);
    res.writeHead(200); res.end();
    return;
  }

  if (cb.data.startsWith("refresh:")) {
    const groupId = cb.data.slice("refresh:".length);
    const job = panelJobs.get(groupId);

    if (!job) {
      await telegramClient.answerCallback(cb.id, "找不到任务（已完成或服务重启）");
      res.writeHead(200); res.end();
      return;
    }

    await telegramClient.answerCallback(cb.id, "正在刷新…");
    await new Promise((r) => setTimeout(r, 200));
    await updatePanelMessage(job.state, telegramClient).catch((e: unknown) =>
      panelLog.error("Refresh failed", { groupId, error: e instanceof Error ? e.message : String(e) }),
    );
  }

  res.writeHead(200); res.end();
}

// ---------------------------------------------------------------------------
// POST /api/payment-notify — pushed by nexus-core on payment state changes
// ---------------------------------------------------------------------------

const PaymentNotifySchema = z.object({
  group_id:           z.string().nullable().optional(),
  merchant_order_ref: z.string(),
  status:             z.string(),
  event_type:         z.string(),
});

async function handlePaymentNotify(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try { body = await readBody(req); } catch { jsonResponse(res, 400, { error: "Failed to read body" }); return; }

  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { jsonResponse(res, 400, { error: "Invalid JSON" }); return; }

  const result = PaymentNotifySchema.safeParse(parsed);
  if (!result.success) { jsonResponse(res, 400, { error: "Validation failed" }); return; }

  const { group_id, merchant_order_ref } = result.data;

  // Find matching panel job — prefer exact group_id match, fallback to ref scan
  let targetJob: OrderPanelJob | undefined;

  if (group_id) {
    targetJob = panelJobs.get(group_id);
  }

  if (!targetJob) {
    // Scan all active jobs to find one whose refs include this order ref
    for (const job of panelJobs.values()) {
      const s = job.state;
      if (
        s.outRef === merchant_order_ref ||
        s.hotelRef === merchant_order_ref ||
        s.backRef === merchant_order_ref
      ) {
        targetJob = job;
        break;
      }
    }
  }

  if (!targetJob) {
    // No active panel for this payment — silently acknowledge
    jsonResponse(res, 200, { ok: true, matched: false });
    return;
  }

  // Immediately refresh the panel (uses Eva's bot token via state.customTgClient)
  const activeClient = targetJob.state.customTgClient ?? telegramClient;
  updatePanelMessage(targetJob.state, activeClient).catch((e: unknown) =>
    panelLog.error("payment-notify refresh failed", {
      groupId: targetJob!.state.groupId,
      error: e instanceof Error ? e.message : String(e),
    }),
  );

  jsonResponse(res, 200, { ok: true, matched: true, groupId: targetJob.state.groupId });
}

// ---------------------------------------------------------------------------
// Startup & shutdown
// ---------------------------------------------------------------------------

server.listen(config.port, async () => {
  log.info("Telegram bot server started", {
    port: config.port,
    nexus_core_url: config.nexusCoreUrl,
  });

  // If BASE_URL is set, register webhook for callback_query only.
  // message updates keep flowing to OpenClaw via getUpdates.
  if (config.baseUrl) {
    const webhookUrl = `${config.baseUrl}/telegram/webhook`;
    await telegramClient.setCallbackWebhook(webhookUrl);
  } else {
    // No BASE_URL — clear any stale webhook
    await telegramClient.deleteWebhookIfSet();
  }
});

async function shutdown(): Promise<void> {
  log.info("Shutting down...");
  statusPoller.stopAll();
  await telegramClient.stop();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
