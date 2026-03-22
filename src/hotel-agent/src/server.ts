#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchHotels } from "./services/hotel-search.js";
import { buildQuote } from "./services/quote-builder.js";
import { createOrder, getOrder, newOrderRef } from "./services/order-store.js";
import { initPool, closePool } from "./services/db/pool.js";
import { startReconciler, stopReconciler } from "./services/reconciler.js";
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
  formatUsdcAmount,
  type X402ToolConfig,
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

// Start reconciler (checks for UNPAID orders that xagent-core shows as paid)
startReconciler({
  xagentCoreUrl: config.xagentCoreUrl,
  merchantDid: config.merchantDid,
});

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
      lines.join("\n\n"),
    data: { offers, nights },
  };
}

async function handleGenerateQuote(
  cache: Map<string, HotelCacheEntry>,
  {
    hotel_offer_id,
    payer_wallet,
  }: {
    hotel_offer_id: string;
    payer_wallet: string;
  },
) {
  const cached = cache.get(hotel_offer_id);
  if (!cached) {
    throw new Error(
      `Hotel offer "${hotel_offer_id}" not found. Please search for hotels first.`,
    );
  }

  const { offer, nights } = cached;
  const orderRef = newOrderRef();
  const roomTotal = (parseFloat(offer.price_per_night.amount) * nights).toFixed(
    2,
  );
  const taxAmount = (parseFloat(roomTotal) * 0.1).toFixed(2);
  const serviceCharge = (parseFloat(roomTotal) * 0.05).toFixed(2);
  const totalAmount = (
    parseFloat(roomTotal) +
    parseFloat(taxAmount) +
    parseFloat(serviceCharge)
  ).toFixed(2);

  const quote = await buildQuote({
    merchantDid: config.merchantDid,
    orderRef,
    amount: totalAmount,
    currency: "USDC",
    summary: `${offer.hotel_name} (${offer.city}) - ${nights} night(s)`,
    lineItems: [
      {
        name: `${offer.room_type} x ${nights} night(s)`,
        qty: nights,
        amount: offer.price_per_night.amount,
      },
      { name: "Tax (10%)", qty: 1, amount: taxAmount },
      { name: "Service Charge (5%)", qty: 1, amount: serviceCharge },
    ],
    payerWallet: payer_wallet,
    signerPrivateKey: config.signerPrivateKey,
  });

  const order = await createOrder(quote);

  const ucpCheckoutResponse = {
    ucp: {
      version: "2026-01-11",
      payment_handlers: {
        "urn:ucp:payment:xagent_v1": [
          {
            id: "xagent_handler_1",
            version: "v1",
            config: quote,
            xagent_core: {
              skill_url: `${config.xagentCoreUrl}/skill-user.md`,
              mcp_endpoint: `${config.xagentCoreUrl}/mcp`,
              orchestrate_url: `${config.xagentCoreUrl}/api/orchestrate`,
              orchestrate_body: {
                quotes: [quote],
                payer_wallet,
              },
              prompt:
                "REQUIRED: To complete this payment, POST the orchestrate_body to orchestrate_url. " +
                "The response contains a checkout_url — present ONLY that URL to the user. " +
                "Do NOT construct URLs yourself or show raw JSON to the user. " +
                "If you have multiple xagent_v1 quotes, combine all config objects into the quotes array before calling orchestrate.",
            },
          },
        ],
      },
    },
    id: order.order_ref,
    status: "ready_for_complete",
    currency: "USDC",
    totals: [
      {
        type: "total",
        amount: quote.amount,
      },
    ],
  };

  // Compact quote JSON — agent collects these and passes to orchestrate
  const quoteJson = JSON.stringify(quote);

  return {
    text:
      `[QUOTE] ${offer.hotel_name} (${offer.city}) - ${nights} night(s) | ${(Number(quote.amount) / 1e6).toFixed(2)} USDC | ref:${order.order_ref}\n` +
      `QUOTE_JSON: ${quoteJson}\n` +
      `PAYER: ${payer_wallet}\n\n` +
      `Collect all QUOTE_JSON values, then call:\n` +
      `xagent_orchestrate_payment({ quotes_json: "[" + all_quotes_joined_by_comma + "]", payer_wallet: "${payer_wallet}" })`,
    data: ucpCheckoutResponse,
    order_ref: order.order_ref,
  };
}

async function handleSearchAndQuote(
  cache: Map<string, HotelCacheEntry>,
  {
    city,
    check_in,
    check_out,
    guests,
    payer_wallet,
    offer_index,
  }: {
    city: string;
    check_in: string;
    check_out: string;
    guests: number;
    payer_wallet: string;
    offer_index?: number;
  },
) {
  // Step 1: Search
  const { offers, nights, error } = await searchHotels({
    city,
    check_in,
    check_out,
    guests,
  });

  if (offers.length === 0) {
    throw new Error(error ?? "No hotels found for this city.");
  }

  for (const offer of offers) {
    cache.set(offer.offer_id, { offer, nights });
  }

  // Step 2: Auto-quote the selected (or cheapest) offer
  const idx = offer_index ?? 0;
  const selected =
    idx >= 0 && idx < offers.length
      ? offers[idx]
      : [...offers].sort(
          (a, b) =>
            parseFloat(a.price_per_night.amount) -
            parseFloat(b.price_per_night.amount),
        )[0];

  const orderRef = newOrderRef();
  const roomTotal = (
    parseFloat(selected.price_per_night.amount) * nights
  ).toFixed(2);
  const taxAmount = (parseFloat(roomTotal) * 0.1).toFixed(2);
  const serviceCharge = (parseFloat(roomTotal) * 0.05).toFixed(2);
  const totalAmount = (
    parseFloat(roomTotal) +
    parseFloat(taxAmount) +
    parseFloat(serviceCharge)
  ).toFixed(2);

  const quote = await buildQuote({
    merchantDid: config.merchantDid,
    orderRef,
    amount: totalAmount,
    currency: "USDC",
    summary: `${selected.hotel_name} (${selected.city}) - ${nights} night(s)`,
    lineItems: [
      {
        name: `${selected.room_type} x ${nights} night(s)`,
        qty: nights,
        amount: selected.price_per_night.amount,
      },
      { name: "Tax (10%)", qty: 1, amount: taxAmount },
      { name: "Service Charge (5%)", qty: 1, amount: serviceCharge },
    ],
    payerWallet: payer_wallet,
    signerPrivateKey: config.signerPrivateKey,
  });

  // Fire-and-forget — DB insert doesn't block the response
  createOrder(quote).catch((err) =>
    console.error(`createOrder failed for ${orderRef}:`, err.message),
  );
  const quoteJson = JSON.stringify(quote);

  // Build compact options list + selected quote
  const stars = (n: number) => "\u2605".repeat(n) + "\u2606".repeat(5 - n);
  const optionLines = offers.map(
    (o, i) =>
      `${i === idx ? "→" : " "} ${i + 1}. ${o.hotel_name} ${stars(o.star_rating)} ${o.price_per_night.amount} ${o.price_per_night.currency}/night`,
  );

  return {
    text:
      `Hotels in ${city} (${check_in} to ${check_out}, ${nights} nights):\n` +
      optionLines.join("\n") +
      `\n\n[QUOTE] ${selected.hotel_name} (${nights} nights) | ${(Number(quote.amount) / 1e6).toFixed(2)} USDC | ref:${orderRef}\n` +
      `QUOTE_JSON: ${quoteJson}\n` +
      `PAYER: ${payer_wallet}\n\n` +
      `To select a different hotel, call search_and_quote again with offer_index=N.\n` +
      `When all quotes are ready, call:\n` +
      `xagent_orchestrate_payment({ quotes_json: "[" + all_quotes_joined_by_comma + "]", payer_wallet: "${payer_wallet}" })`,
    data: { offers, nights, selectedIndex: idx, quote },
    order_ref: orderRef,
  };
}

async function handleCheckStatus({ order_ref }: { order_ref: string }) {
  const order = await getOrder(order_ref);
  if (!order) {
    throw new Error(`Order "${order_ref}" not found.`);
  }

  return {
    text:
      `Order Status\n` +
      `Ref: ${order.order_ref}\n` +
      `Status: ${order.status}\n` +
      `Amount: ${order.quote_payload.amount} ${order.quote_payload.currency}\n` +
      `Summary: ${order.quote_payload.context.summary}\n` +
      `Created: ${order.created_at}\n` +
      `Updated: ${order.updated_at}`,
    data: order,
  };
}

// ── McpServer factory (one instance per SSE connection) ─────────────────────

function createMcpServer(): McpServer {
  const sessionOfferCache = new Map<string, HotelCacheEntry>();
  const srv = new McpServer({
    name: "xagent-hotel",
    version: "2.0.0",
  });

  // ── x402 Payment Configuration ──────────────────────────────────────────
  const x402Config: X402ToolConfig = {
    toolName: "search_and_quote",
    priceUsdcAtomic: config.x402PriceAtomic,
    payTo: config.paymentAddress,
    resourceDescription: "Hotel booking on XLayer",
    signerPrivateKey: config.relayerPrivateKey,
  };

  // ── Tool: search_hotels ─────────────────────────────────────────────────────

  srv.tool(
    "search_hotels",
    "Search available hotels in a city. Returns a list of hotel offers with nightly rates.",
    {
      city: z
        .string()
        .describe("City name (e.g. Tokyo, Singapore, Bangkok, Shanghai)"),
      check_in: z.string().describe("Check-in date in YYYY-MM-DD format"),
      check_out: z.string().describe("Check-out date in YYYY-MM-DD format"),
      guests: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(1)
        .describe("Number of guests (1-10)"),
    },
    async ({ city, check_in, check_out, guests }) => {
      try {
        const result = await handleSearchHotels(sessionOfferCache, {
          city,
          check_in,
          check_out,
          guests,
        });
        return {
          content: [{ type: "text" as const, text: result.text }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: search_and_quote (FAST PATH + x402 Payment) ───────────────────

  srv.tool(
    "search_and_quote",
    "Search hotels AND generate a quote in ONE call. " +
      "Supports x402 payment protocol — include _meta['x402/payment'] with a signed EIP-3009 " +
      "transferWithAuthorization to pay and book instantly. " +
      "Without payment, returns hotels + PaymentRequired info.",
    {
      city: z
        .string()
        .describe("City name (e.g. Tokyo, Singapore, Bangkok, Shanghai)"),
      check_in: z.string().describe("Check-in date in YYYY-MM-DD format"),
      check_out: z.string().describe("Check-out date in YYYY-MM-DD format"),
      guests: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(1)
        .describe("Number of guests (1-10)"),
      payer_wallet: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Payer's EVM wallet address (0x...)"),
      offer_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Zero-based index of the hotel to quote (default: 0 = cheapest). Use this to pick a different hotel after seeing options.",
        ),
    },
    async (
      { city, check_in, check_out, guests, payer_wallet, offer_index },
      extra,
    ) => {
      try {
        const result = await handleSearchAndQuote(sessionOfferCache, {
          city,
          check_in,
          check_out,
          guests,
          payer_wallet,
          offer_index,
        });

        // Check for x402 payment
        const payment = extractX402Payment(
          (extra as any)?._meta ?? (extra as any)?.meta,
        );

        if (!payment) {
          const pr = buildPaymentRequired(x402Config);
          return buildPaymentRequiredResult(pr, result.text);
        }

        // Payment present — verify + settle
        const payResult = await processX402Payment(payment, x402Config);
        if ("error" in payResult) {
          return buildPaymentRequiredResult(payResult.error, result.text);
        }

        const paidText =
          `✅ Payment settled on XLayer!\n` +
          `TX: ${payResult.settled.transaction}\n` +
          `Amount: ${formatUsdcAmount(x402Config.priceUsdcAtomic)}\n` +
          `Payer: ${payResult.settled.payer ?? payer_wallet}\n\n` +
          result.text;

        return buildPaidToolResult(paidText, payResult.settled);
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: xagent_generate_quote (+ x402 Payment) ────────────────────────

  srv.tool(
    "xagent_generate_quote",
    "Generates a XAgent Payment (NUPS) quote for a selected hotel offer. " +
      "Supports x402 payment — include _meta['x402/payment'] to pay instantly. " +
      "Use search_and_quote instead for faster flow.",
    {
      hotel_offer_id: z
        .string()
        .describe("The offer_id from search_hotels results"),
      payer_wallet: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ hotel_offer_id, payer_wallet }, extra) => {
      try {
        const result = await handleGenerateQuote(sessionOfferCache, {
          hotel_offer_id,
          payer_wallet,
        });

        const payment = extractX402Payment(
          (extra as any)?._meta ?? (extra as any)?.meta,
        );

        if (!payment) {
          const quoteConfig: X402ToolConfig = { ...x402Config, toolName: "xagent_generate_quote" };
          const pr = buildPaymentRequired(quoteConfig);
          return buildPaymentRequiredResult(pr, result.text);
        }

        const payResult = await processX402Payment(payment, {
          ...x402Config,
          toolName: "xagent_generate_quote",
        });

        if ("error" in payResult) {
          return buildPaymentRequiredResult(payResult.error, result.text);
        }

        const paidText =
          `✅ Payment settled on XLayer!\n` +
          `TX: ${payResult.settled.transaction}\n` +
          `Amount: ${formatUsdcAmount(x402Config.priceUsdcAtomic)}\n` +
          `Payer: ${payResult.settled.payer ?? payer_wallet}\n\n` +
          result.text;

        return buildPaidToolResult(paidText, payResult.settled);
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ── Tool: xagent_check_status ────────────────────────────────────────────────

  srv.tool(
    "xagent_check_status",
    "Checks the payment status of a hotel order. Use this to verify if payment has been completed.",
    {
      order_ref: z.string().describe("The order reference (e.g. HTL-...)"),
    },
    async ({ order_ref }) => {
      try {
        const result = await handleCheckStatus({ order_ref });
        return {
          content: [{ type: "text" as const, text: result.text }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ── Resource: order state ───────────────────────────────────────────────────

  srv.resource(
    "order-state",
    "xagent://orders/{order_ref}/state",
    { description: "Current state of a hotel order (RFC-003 compliant)" },
    async (uri) => {
      const orderRef = uri.pathname.split("/")[2] ?? "";
      const order = await getOrder(orderRef);

      if (!order) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: "Order not found" }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              order_ref: order.order_ref,
              payment_status: order.status,
              xagent_payment_id: null,
              last_updated: order.updated_at,
            }),
          },
        ],
      };
    },
  );

  // ── Prompt: checkout flow ───────────────────────────────────────────────────

  srv.prompt(
    "xagent_checkout_flow",
    "Guided flow for searching hotels and generating a XAgent payment quote.",
    {},
    async () => ({
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: [
              "You are facilitating a hotel booking transaction using XAgent Protocol.",
              "",
              "Follow this workflow:",
              "1. Ask the user for their destination city, check-in date, check-out date, and number of guests.",
              "2. Call 'search_hotels' with the provided details.",
              "3. Present the available hotels clearly to the user.",
              "4. When the user selects a hotel, call 'xagent_generate_quote' with the offer_id.",
              "5. Display the NUPS payment payload to the user.",
              "6. If the user says they have paid, call 'xagent_check_status' to verify.",
              "7. Only confirm the booking after verification returns 'PAID'.",
            ].join("\n"),
          },
        },
      ],
    }),
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
  try {
    const rawBody = await readBody(req);
    const { tool, arguments: args } = JSON.parse(rawBody);

    let result;
    if (tool === "search_hotels") {
      result = await handleSearchHotels(statelessOfferCache, args);
    } else if (tool === "search_and_quote") {
      result = await handleSearchAndQuote(statelessOfferCache, args);
    } else if (tool === "xagent_generate_quote") {
      result = await handleGenerateQuote(statelessOfferCache, args);
    } else if (tool === "xagent_check_status") {
      result = await handleCheckStatus(args);
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
  stopReconciler();
  closePool().catch(() => {});
});

main().catch((err) => {
  console.error("Failed to start Hotel Agent:", err);
  process.exit(1);
});
