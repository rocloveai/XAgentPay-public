#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchHotels } from "./services/hotel-search.js";
import { initPool, closePool } from "./services/db/pool.js";
import {
  startPortal,
  registerMcpHandler,
  registerStatelessHandler,
  readBody,
  sendJson,
} from "./portal.js";
import { privateKeyToAccount } from "viem/accounts";
import {
  extractX402Payment,
  buildPaymentRequired,
  buildPaymentRequiredResult,
  buildPaidToolResult,
  processX402Payment,
  type X402ToolConfig,
  buildHTTP402Body,
  extractHTTPPayment,
  processHTTPPayment,
} from "@xagentpay/x402";
import type { HotelOffer } from "./types.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const config = loadConfig();
const transportMode = process.env.TRANSPORT ?? "stdio";

// Initialize DB pool if DATABASE_URL is set
if (config.databaseUrl) {
  initPool(config.databaseUrl);
} else {
  console.error("Warning: DATABASE_URL not set. Using in-memory storage only.");
}

// Auto-register with xagent-core so webhooks work immediately on startup
async function registerWithXAgentCore() {
  try {
    const signerAddress = privateKeyToAccount(
      config.signerPrivateKey as `0x${string}`,
    ).address;
    // Use internal Docker URL for webhooks (avoids nginx roundtrip)
    const internalWebhookUrl =
      process.env.WEBHOOK_URL || "http://hotel-agent:10000/webhook";
    const body = {
      merchant_did: config.merchantDid,
      name: "XAgent Hotel Booking",
      description: "AI-powered hotel booking with USDC payments on XLayer. Find and book hotels worldwide.",
      category: "travel.hotels",
      signer_address: signerAddress,
      payment_address: config.paymentAddress,
      skill_md_url: `${config.portalBaseUrl}/skill.md`,
      health_url: `${config.portalBaseUrl}/health`,
      webhook_url: internalWebhookUrl,
      webhook_secret: config.webhookSecret,
    };
    const res = await fetch(`${config.xagentCoreUrl}/api/market/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.error("[Hotel Agent] Registered with xagent-core successfully");
    } else {
      console.error(
        `[Hotel Agent] Registration failed: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err: any) {
    console.error(`[Hotel Agent] Registration error: ${err.message}`);
  }
}
registerWithXAgentCore();

type HotelCacheEntry = { offer: HotelOffer; nights: number };

// Stateless REST calls share a process-level cache (offer_id contains unique
// timestamp prefix so there's no cross-user collision risk)
const statelessOfferCache = new Map<string, HotelCacheEntry>();

// ── Tool Implementations (accept offerCache as parameter) ───────────────────

async function handleSearchHotels(
  cache: Map<string, HotelCacheEntry>,
  {
    city,
    check_in,
    check_out,
    guests,
  }: { city: string; check_in: string; check_out: string; guests: number },
) {
  const { offers, nights, error } = await searchHotels({
    city,
    check_in,
    check_out,
    guests,
  });

  if (error && offers.length === 0) {
    throw new Error(error);
  }

  for (const offer of offers) {
    cache.set(offer.offer_id, { offer, nights });
  }

  const stars = (n: number) => "\u2605".repeat(n) + "\u2606".repeat(5 - n);

  const lines = offers.map(
    (o, i) =>
      `${i + 1}. [${o.offer_id}] ${o.hotel_name} ${stars(o.star_rating)}\n` +
      `   Room: ${o.room_type}\n` +
      `   Location: ${o.location}\n` +
      `   Price: ${o.price_per_night.amount} ${o.price_per_night.currency}/night` +
      ` (${nights} nights = ${(parseFloat(o.price_per_night.amount) * nights).toFixed(2)} ${o.price_per_night.currency})\n` +
      `   Amenities: ${o.amenities.join(", ")}`,
  );

  return {
    text:
      `Hotels in ${city} (${check_in} to ${check_out}, ${nights} nights, ${guests} guest(s)):\n\n` +
      lines.join("\n\n") +
      "\n\nTo book a hotel: call purchase_hotel(hotel_id=\"<offer_id>\", payer_wallet=\"<wallet>\")",
    data: { offers, nights },
  };
}

async function handleSearchAndQuote(
  cache: Map<string, HotelCacheEntry>,
  args: { city: string; check_in: string; check_out: string; guests: number },
) {
  return handleSearchHotels(cache, args);
}

async function handlePurchaseHotel(
  cache: Map<string, HotelCacheEntry>,
  { hotel_id, payer_wallet }: { hotel_id: string; payer_wallet: string },
): Promise<{ text: string; priceAtomic: string; offer: HotelOffer; nights: number; totalAmount: string }> {
  const cached = cache.get(hotel_id);
  if (!cached) {
    throw new Error(`Hotel offer "${hotel_id}" not found. Please search for hotels first.`);
  }
  const { offer, nights } = cached;
  const totalAmount = (parseFloat(offer.price_per_night.amount) * nights).toFixed(2);
  const priceAtomic = String(Math.round(parseFloat(totalAmount) * 1_000_000));
  return {
    text: `${offer.hotel_name} ${offer.location} | ${offer.city} | ${nights} nights | ${totalAmount} USDC`,
    priceAtomic,
    offer,
    nights,
    totalAmount,
  };
}

// ── McpServer factory (one instance per SSE connection) ─────────────────────

function createMcpServer(): McpServer {
  const sessionOfferCache = new Map<string, HotelCacheEntry>();
  const srv = new McpServer({
    name: "xagent-hotel",
    version: "2.0.0",
  });

  // ── Tool: search_and_quote (FREE) ─────────────────────────────────────────

  srv.tool(
    "search_and_quote",
    "Search available hotels in a city. Returns a list of hotel offers with nightly rates. FREE — no payment required for search.",
    {
      city: z.string().describe("City name (e.g. Tokyo, Singapore, Bangkok, Shanghai)"),
      check_in: z.string().describe("Check-in date in YYYY-MM-DD format"),
      check_out: z.string().describe("Check-out date in YYYY-MM-DD format"),
      guests: z.number().int().min(1).max(10).default(1).describe("Number of guests (1-10)"),
    },
    async ({ city, check_in, check_out, guests }) => {
      try {
        const result = await handleSearchHotels(sessionOfferCache, { city, check_in, check_out, guests });
        return { content: [{ type: "text" as const, text: result.text }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ── Tool: search_hotels (FREE) ────────────────────────────────────────────

  srv.tool(
    "search_hotels",
    "Search available hotels. Returns hotel offers with offer IDs. FREE — no payment required.",
    {
      city: z.string().describe("City name (e.g. Tokyo, Singapore, Bangkok, Shanghai)"),
      check_in: z.string().describe("Check-in date in YYYY-MM-DD format"),
      check_out: z.string().describe("Check-out date in YYYY-MM-DD format"),
      guests: z.number().int().min(1).max(10).default(1).describe("Number of guests (1-10)"),
    },
    async ({ city, check_in, check_out, guests }) => {
      try {
        const result = await handleSearchHotels(sessionOfferCache, { city, check_in, check_out, guests });
        return { content: [{ type: "text" as const, text: result.text }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // ── Tool: purchase_hotel (x402 payment) ──────────────────────────────────

  srv.tool(
    "purchase_hotel",
    "Purchase a hotel booking with x402 payment. Requires x402 EIP-3009 payment in _meta['x402/payment'] for the exact hotel price in USDC. First call returns payment requirements; include payment on second call to confirm booking.",
    {
      hotel_id: z.string().describe("Hotel offer ID from search_and_quote results"),
      payer_wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ hotel_id, payer_wallet }, extra) => {
      let info: Awaited<ReturnType<typeof handlePurchaseHotel>>;
      try {
        info = await handlePurchaseHotel(sessionOfferCache, { hotel_id, payer_wallet });
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }

      const purchaseConfig: X402ToolConfig = {
        toolName: "purchase_hotel",
        priceUsdcAtomic: info.priceAtomic,
        payTo: config.paymentAddress,
        resourceDescription: info.text,
        signerPrivateKey: config.relayerPrivateKey,
      };

      const payment = extractX402Payment((extra as any)?._meta ?? (extra as any)?.meta);
      if (!payment) {
        return buildPaymentRequiredResult(buildPaymentRequired(purchaseConfig));
      }

      const payResult = await processX402Payment(payment, purchaseConfig);
      if ("error" in payResult) {
        return buildPaymentRequiredResult(payResult.error);
      }

      const confirmNum = `HTL-${Date.now().toString(36).toUpperCase()}`;
      return buildPaidToolResult(
        `✅ Hotel Booked!\n` +
        `${info.offer.hotel_name}\n` +
        `${info.offer.location}\n` +
        `Check-in: ${info.offer.city} | Nights: ${info.nights}\n` +
        `Price paid: ${info.totalAmount} USDC\n` +
        `TX: ${payResult.settled.transaction}\n` +
        `Confirmation: ${confirmNum}\n` +
        `Payer: ${payer_wallet}`,
        payResult.settled,
      );
    },
  );

  return srv;
}

// ── Start server ──────────────────────────────────────────────────────────────

async function main() {
  if (transportMode === "http") {
    await startHttpMode();
  } else {
    await startStdioMode();
  }
}

async function startStdioMode() {
  startPortal(config);
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hotel Agent MCP Server started (stdio mode)");
}

async function handleStatelessCall(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const reqUrl = new URL(req.url ?? "/", "http://localhost");

  // ── HTTP search endpoint (FREE — no x402 gate) ────────────────────────────
  if (
    reqUrl.pathname === "/api/search" ||
    reqUrl.pathname === "/api/search/hotels"
  ) {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
      res.end();
      return true;
    }

    // Free search — no payment required
    try {
      const rawBody = await readBody(req);
      const args = JSON.parse(rawBody);
      const result = await handleSearchHotels(statelessOfferCache, args);
      sendJson(res, 200, {
        hotels: result.data,
        text: result.text,
        network: "eip155:196",
      });
    } catch (err: any) {
      sendJson(res, 400, { error: err.message });
    }
    return true;
  }

  // ── HTTP purchase endpoint (x402 payment gate) ────────────────────────────
  if (
    reqUrl.pathname === "/api/purchase" ||
    reqUrl.pathname === "/api/purchase/hotels"
  ) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
      res.end();
      return true;
    }

    const rawBody = await readBody(req);
    const args = JSON.parse(rawBody);

    let info: Awaited<ReturnType<typeof handlePurchaseHotel>>;
    try {
      info = await handlePurchaseHotel(statelessOfferCache, args);
    } catch (err: any) {
      sendJson(res, 400, { error: err.message });
      return true;
    }

    const httpConfig = {
      toolName: "purchase_hotel",
      priceUsdcAtomic: info.priceAtomic,
      payTo: config.paymentAddress,
      resourceDescription: info.text,
      signerPrivateKey: config.relayerPrivateKey,
    };
    const http402Body = buildHTTP402Body(httpConfig);

    const payment = extractHTTPPayment(req.headers as any);
    if (!payment) {
      res.writeHead(402, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      res.end(http402Body);
      return true;
    }

    const payResult = await processHTTPPayment(payment, httpConfig);
    if (!payResult.success) {
      res.writeHead(402, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      res.end(http402Body);
      return true;
    }

    const confirmNum = `HTL-${Date.now().toString(36).toUpperCase()}`;
    sendJson(res, 200, {
      status: "booked",
      confirmation: confirmNum,
      hotel: info.offer,
      nights: info.nights,
      price_paid_usdc: (Number(info.priceAtomic) / 1e6).toFixed(2),
      payment_tx: payResult.settled.transaction,
      network: "eip155:196",
    });
    return true;
  }

  // ── existing stateless handler ─────────────────────────────────────────────
  try {
    const rawBody = await readBody(req);
    const { tool, arguments: args } = JSON.parse(rawBody);

    let result;
    if (tool === "search_hotels") {
      result = await handleSearchHotels(statelessOfferCache, args);
    } else if (tool === "search_and_quote") {
      result = await handleSearchAndQuote(statelessOfferCache, args);
    } else if (tool === "purchase_hotel") {
      const info = await handlePurchaseHotel(statelessOfferCache, args);
      sendJson(res, 402, {
        message: "Payment required",
        offer: info.text,
        price_usdc: (Number(info.priceAtomic) / 1e6).toFixed(2),
        price_atomic: info.priceAtomic,
        pay_to: config.paymentAddress,
        network: "eip155:196",
        asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
      });
      return true;
    } else {
      sendJson(res, 400, { error: `Unknown tool: ${tool}` });
      return true;
    }

    sendJson(res, 200, result);
    return true;
  } catch (err: any) {
    sendJson(res, 500, { error: err.message });
    return true;
  }
}

async function startHttpMode() {
  registerStatelessHandler(handleStatelessCall);

  registerMcpHandler(
    async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res);
      await server.close();
      return true;
    },
  );

  startPortal(config);
  console.error(
    `Hotel Agent MCP Server started (HTTP mode on port ${config.portalPort})`,
  );
  console.error(`  MCP endpoint:  http://localhost:${config.portalPort}/mcp`);
  console.error(
    `  Skill:         http://localhost:${config.portalPort}/skill.md`,
  );
}

process.on("SIGTERM", () => {
  closePool().catch(() => {});
});

main().catch((err) => {
  console.error("Failed to start Hotel Agent:", err);
  process.exit(1);
});
