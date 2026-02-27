#!/usr/bin/env node
/**
 * Telegram Bot — HTTP server + entry point.
 *
 * POST /api/render-order — Send an order message to a Telegram chat.
 * GET  /health           — Health check.
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
  maxPollDurationMs: config.maxPollDurationMs,
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

  // Telegram webhook (callback queries from inline buttons)
  if (method === "POST" && url === "/telegram-webhook") {
    await telegramClient.handleWebhook(req, res);
    return;
  }

  // Render order
  if (method === "POST" && url === "/api/render-order") {
    await handleRenderOrder(req, res);
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
// Startup & shutdown
// ---------------------------------------------------------------------------

server.listen(config.port, async () => {
  log.info("Telegram bot server started", {
    port: config.port,
    nexus_core_url: config.nexusCoreUrl,
  });

  // Set up Telegram webhook for callback queries (inline button presses)
  if (config.baseUrl) {
    try {
      await telegramClient.setupWebhook(config.baseUrl);
    } catch (err) {
      log.error("Failed to set webhook", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    log.warn(
      "BASE_URL not set — Telegram webhook not configured (callback buttons won't respond)",
    );
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
