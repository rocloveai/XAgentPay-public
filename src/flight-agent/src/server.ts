#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchFlights } from "./services/flight-search.js";
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
import type { FlightOffer } from "./types.js";
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
      process.env.WEBHOOK_URL || "http://flight-agent:10000/webhook";
    const body = {
      merchant_did: config.merchantDid,
      name: "XAgent Flight Booking",
      description: "AI-powered flight booking with USDC payments on XLayer. Search and book flights globally.",
      category: "travel.flights",
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
      console.error("[Flight Agent] Registered with xagent-core successfully");
    } else {
      console.error(
        `[Flight Agent] Registration failed: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err: any) {
    console.error(`[Flight Agent] Registration error: ${err.message}`);
  }
}
registerWithXAgentCore();

// Stateless REST calls share a process-level cache (offer_id contains unique
// timestamp prefix so there's no cross-user collision risk)
const statelessOfferCache = new Map<string, FlightOffer>();

// ── Tool Implementations (accept offerCache as parameter) ───────────────────

async function handleSearchFlights(
  cache: Map<string, FlightOffer>,
  {
    origin,
    destination,
    date,
    passengers,
  }: { origin: string; destination: string; date: string; passengers: number },
) {
  const { offers, error } = await searchFlights({
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    date,
    passengers,
  });

  for (const offer of offers) {
    cache.set(offer.offer_id, offer);
  }

  const lines = offers.map(
    (o, i) =>
      `${i + 1}. [${o.offer_id}] ${o.airline} ${o.flight_number}\n` +
      `   ${o.origin} → ${o.destination}\n` +
      `   Depart: ${o.departure_time} | Arrive: ${o.arrival_time}\n` +
      `   Duration: ${o.duration} | Class: ${o.cabin_class}\n` +
      `   Price: ${o.price.amount} ${o.price.currency}`,
  );

  const header = error
    ? `Note: ${error}\n\nAvailable Flights:\n`
    : "Available Flights:\n";

  return {
    text:
      header +
      lines.join("\n\n") +
      "\n\nTo book a flight: call purchase_flight(offer_id=\"<id>\", payer_wallet=\"<wallet>\")",
    data: offers,
  };
}

async function handleSearchAndQuote(
  cache: Map<string, FlightOffer>,
  args: { origin: string; destination: string; date: string; passengers: number },
) {
  return handleSearchFlights(cache, args);
}

async function handlePurchaseFlight(
  cache: Map<string, FlightOffer>,
  { offer_id, payer_wallet }: { offer_id: string; payer_wallet: string },
): Promise<{ text: string; priceAtomic: string; offer: FlightOffer }> {
  const offer = cache.get(offer_id);
  if (!offer) {
    throw new Error(`Flight offer "${offer_id}" not found. Please search for flights first.`);
  }
  const priceAtomic = String(Math.round(parseFloat(offer.price.amount) * 1_000_000));
  return {
    text: `${offer.airline} ${offer.flight_number} ${offer.origin}→${offer.destination} | ${offer.departure_time.slice(0, 16)} | ${offer.price.amount} USDC`,
    priceAtomic,
    offer,
  };
}

// ── McpServer factory (one instance per SSE connection) ─────────────────────

function createMcpServer(): McpServer {
  const sessionOfferCache = new Map<string, FlightOffer>();
  const srv = new McpServer({
    name: "xagent-flight",
    version: "2.0.0",
  });

  // ── Tool: search_and_quote (FREE) ─────────────────────────────────────────

  srv.tool(
    "search_and_quote",
    "Search available flights between airports. Returns a list of flight offers with prices. FREE — no payment required for search.",
    {
      origin: z.string().describe("IATA airport code for departure (e.g. PVG, SHA)"),
      destination: z.string().describe("IATA airport code for arrival (e.g. NRT, HND)"),
      date: z.string().describe("Departure date in YYYY-MM-DD format"),
      passengers: z.number().int().min(1).max(9).default(1).describe("Number of passengers (1-9)"),
    },
    async ({ origin, destination, date, passengers }) => {
      const result = await handleSearchFlights(sessionOfferCache, { origin, destination, date, passengers });
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  // ── Tool: search_flights (FREE) ───────────────────────────────────────────

  srv.tool(
    "search_flights",
    "Search available flights. Returns flight offers with offer IDs. FREE — no payment required.",
    {
      origin: z.string().describe("IATA airport code for departure"),
      destination: z.string().describe("IATA airport code for arrival"),
      date: z.string().describe("Departure date in YYYY-MM-DD format"),
      passengers: z.number().int().min(1).max(9).default(1).describe("Number of passengers"),
    },
    async ({ origin, destination, date, passengers }) => {
      const result = await handleSearchFlights(sessionOfferCache, { origin, destination, date, passengers });
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  // ── Tool: purchase_flight (x402 payment) ─────────────────────────────────

  srv.tool(
    "purchase_flight",
    "Purchase a flight ticket with x402 payment. Requires x402 EIP-3009 payment in _meta['x402/payment'] for the exact flight price in USDC. First call returns payment requirements; include payment on second call to confirm booking.",
    {
      offer_id: z.string().describe("Flight offer ID from search_and_quote results"),
      payer_wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ offer_id, payer_wallet }, extra) => {
      let info: Awaited<ReturnType<typeof handlePurchaseFlight>>;
      try {
        info = await handlePurchaseFlight(sessionOfferCache, { offer_id, payer_wallet });
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }

      const purchaseConfig: X402ToolConfig = {
        toolName: "purchase_flight",
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

      const confirmNum = `FLT-${Date.now().toString(36).toUpperCase()}`;
      return buildPaidToolResult(
        `✅ Flight Booked!\n` +
        `${info.offer.airline} ${info.offer.flight_number}\n` +
        `${info.offer.origin} → ${info.offer.destination}\n` +
        `Depart: ${info.offer.departure_time}\n` +
        `Arrive: ${info.offer.arrival_time}\n` +
        `Price paid: ${info.offer.price.amount} USDC\n` +
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
  console.error("Flight Agent MCP Server started (stdio mode)");
}

async function handleStatelessCall(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const reqUrl = new URL(req.url ?? "/", "http://localhost");

  // ── HTTP search endpoint (FREE — no x402 gate) ────────────────────────────
  if (
    reqUrl.pathname === "/api/search" ||
    reqUrl.pathname === "/api/search/flights"
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
      const result = await handleSearchFlights(statelessOfferCache, args);
      sendJson(res, 200, {
        flights: result.data,
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
    reqUrl.pathname === "/api/purchase/flights"
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

    let info: Awaited<ReturnType<typeof handlePurchaseFlight>>;
    try {
      info = await handlePurchaseFlight(statelessOfferCache, args);
    } catch (err: any) {
      sendJson(res, 400, { error: err.message });
      return true;
    }

    const httpConfig = {
      toolName: "purchase_flight",
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

    const confirmNum = `FLT-${Date.now().toString(36).toUpperCase()}`;
    sendJson(res, 200, {
      status: "booked",
      confirmation: confirmNum,
      flight: info.offer,
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
    if (tool === "search_flights") {
      result = await handleSearchFlights(statelessOfferCache, args);
    } else if (tool === "search_and_quote") {
      result = await handleSearchAndQuote(statelessOfferCache, args);
    } else if (tool === "purchase_flight") {
      const info = await handlePurchaseFlight(statelessOfferCache, args);
      // For REST stateless, return the price requirement (no way to attach payment in stateless call)
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
    `Flight Agent MCP Server started (HTTP mode on port ${config.portalPort})`,
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
  console.error("Failed to start Flight Agent:", err);
  process.exit(1);
});
