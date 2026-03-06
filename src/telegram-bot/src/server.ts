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
}

interface OrderPanelJob {
  state: OrderPanelState;
  timer: ReturnType<typeof setInterval>;
}

const panelJobs = new Map<string, OrderPanelJob>();
const panelLog = createLogger("OrderPanel");

const FLIGHT_API_URL = process.env.FLIGHT_API || "https://nexus-flight-agent-3xb1.onrender.com/api/v1/call-tool";
const HOTEL_API_URL  = process.env.HOTEL_API  || "https://nexus-hotel-agent-d2lj.onrender.com/api/v1/call-tool";

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
  return {
    inline_keyboard: [
      [{ text: "💳 去收银台支付", url: state.checkoutUrl }],
      [{ text: "🔄 手动刷新", callback_data: `refresh:${state.groupId}` }],
    ],
  };
}

async function updatePanelMessage(state: OrderPanelState, tgClient: TelegramClient): Promise<boolean> {
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

  const { chatId, groupId, checkoutUrl, outRef, hotelRef, backRef, intervalSec } = result.data;

  // Cancel previous job for this group (idempotent)
  const prev = panelJobs.get(groupId);
  if (prev) { clearInterval(prev.timer); panelJobs.delete(groupId); }

  const state: OrderPanelState = {
    chatId, groupId, checkoutUrl,
    outRef,
    hotelRef: hotelRef ?? null,
    backRef:  backRef  ?? null,
    messageId: null,
  };

  try {
    // Send placeholder
    const msgId = await telegramClient.sendHtmlMessage(
      chatId,
      "🧾 <b>XAgent Pay 订单</b> — 正在初始化…",
      buildPanelKeyboard(state, false),
    );
    state.messageId = msgId;

    // First update
    await updatePanelMessage(state, telegramClient);

    const ms = Math.max(5, (intervalSec ?? 10)) * 1000;
    const timer = setInterval(() => {
      updatePanelMessage(state, telegramClient).catch((e: unknown) =>
        panelLog.error("Panel update failed", { groupId, error: e instanceof Error ? e.message : String(e) }),
      );
    }, ms);

    panelJobs.set(groupId, { state, timer });

    jsonResponse(res, 200, { ok: true, groupId, messageId: msgId, pollEverySec: ms / 1000 });
  } catch (err) {
    panelLog.error("Failed to start order panel", {
      groupId,
      error: err instanceof Error ? err.message : String(err),
    });
    jsonResponse(res, 500, { ok: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ---------------------------------------------------------------------------
// POST /telegram/webhook  — handles callback_query from inline buttons
// ---------------------------------------------------------------------------

async function handleTelegramWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: string;
  try { body = await readBody(req); } catch { res.writeHead(200); res.end(); return; }

  let update: { callback_query?: { id: string; data?: string } };
  try { update = JSON.parse(body); } catch { res.writeHead(200); res.end(); return; }

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
