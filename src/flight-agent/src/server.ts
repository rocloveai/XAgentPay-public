#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchFlights } from "./services/flight-search.js";
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

// Start reconciler (checks for UNPAID orders that nexus-core shows as paid)
startReconciler({
  nexusCoreUrl: config.nexusCoreUrl,
  merchantDid: config.merchantDid,
});

// Auto-register with nexus-core so webhooks work immediately on startup
async function registerWithNexusCore() {
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
    const res = await fetch(`${config.nexusCoreUrl}/api/market/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.error("[Flight Agent] Registered with nexus-core successfully");
    } else {
      console.error(
        `[Flight Agent] Registration failed: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err: any) {
    console.error(`[Flight Agent] Registration error: ${err.message}`);
  }
}
registerWithNexusCore();

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
    text: header + lines.join("\n\n"),
    data: offers,
  };
}

async function handleGenerateQuote(
  cache: Map<string, FlightOffer>,
  {
    flight_offer_id,
    payer_wallet,
  }: {
    flight_offer_id: string;
    payer_wallet: string;
  },
) {
  const offer = cache.get(flight_offer_id);
  if (!offer) {
    throw new Error(
      `Flight offer "${flight_offer_id}" not found. Please search for flights first.`,
    );
  }

  const orderRef = newOrderRef();
  const taxAmount = (parseFloat(offer.price.amount) * 0.06).toFixed(2);
  const totalAmount = (
    parseFloat(offer.price.amount) + parseFloat(taxAmount)
  ).toFixed(2);

  const quote = await buildQuote({
    merchantDid: config.merchantDid,
    orderRef,
    amount: totalAmount,
    currency: "USDC",
    summary: `${offer.airline} ${offer.flight_number} (${offer.origin}-${offer.destination})`,
    lineItems: [
      {
        name: `Flight ${offer.flight_number} ${offer.origin}-${offer.destination}`,
        qty: 1,
        amount: offer.price.amount,
      },
      { name: "Tax & Fees", qty: 1, amount: taxAmount },
    ],
    payerWallet: payer_wallet,
    signerPrivateKey: config.signerPrivateKey,
  });

  const order = await createOrder(quote);

  const ucpCheckoutResponse = {
    ucp: {
      version: "2026-01-11",
      payment_handlers: {
        "urn:ucp:payment:nexus_v1": [
          {
            id: "nexus_handler_1",
            version: "v1",
            config: quote,
            nexus_core: {
              skill_url: `${config.nexusCoreUrl}/skill-user.md`,
              mcp_endpoint: `${config.nexusCoreUrl}/mcp`,
              orchestrate_url: `${config.nexusCoreUrl}/api/orchestrate`,
              orchestrate_body: {
                quotes: [quote],
                payer_wallet,
              },
              prompt:
                "REQUIRED: To complete this payment, POST the orchestrate_body to orchestrate_url. " +
                "The response contains a checkout_url — present ONLY that URL to the user. " +
                "Do NOT construct URLs yourself or show raw JSON to the user. " +
                "If you have multiple nexus_v1 quotes, combine all config objects into the quotes array before calling orchestrate.",
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
      `[QUOTE] ${offer.airline} ${offer.flight_number} (${offer.origin}-${offer.destination}) | ${(Number(quote.amount) / 1e6).toFixed(2)} USDC | ref:${order.order_ref}\n` +
      `QUOTE_JSON: ${quoteJson}\n` +
      `PAYER: ${payer_wallet}\n\n` +
      `Collect all QUOTE_JSON values, then call:\n` +
      `nexus_orchestrate_payment({ quotes_json: "[" + all_quotes_joined_by_comma + "]", payer_wallet: "${payer_wallet}" })`,
    data: ucpCheckoutResponse,
    order_ref: order.order_ref,
  };
}

async function handleSearchAndQuote(
  cache: Map<string, FlightOffer>,
  {
    origin,
    destination,
    date,
    passengers,
    payer_wallet,
    offer_index,
  }: {
    origin: string;
    destination: string;
    date: string;
    passengers: number;
    payer_wallet: string;
    offer_index?: number;
  },
) {
  // Step 1: Search
  const { offers, error } = await searchFlights({
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    date,
    passengers,
  });

  if (offers.length === 0) {
    throw new Error(error ?? "No flights found for this route.");
  }

  for (const offer of offers) {
    cache.set(offer.offer_id, offer);
  }

  // Step 2: Auto-quote the selected (or cheapest) offer
  const idx = offer_index ?? 0;
  const selected =
    idx >= 0 && idx < offers.length
      ? offers[idx]
      : [...offers].sort(
          (a, b) => parseFloat(a.price.amount) - parseFloat(b.price.amount),
        )[0];

  const orderRef = newOrderRef();
  const taxAmount = (parseFloat(selected.price.amount) * 0.06).toFixed(2);
  const totalAmount = (
    parseFloat(selected.price.amount) + parseFloat(taxAmount)
  ).toFixed(2);

  const quote = await buildQuote({
    merchantDid: config.merchantDid,
    orderRef,
    amount: totalAmount,
    currency: "USDC",
    summary: `${selected.airline} ${selected.flight_number} (${selected.origin}-${selected.destination})`,
    lineItems: [
      {
        name: `Flight ${selected.flight_number} ${selected.origin}-${selected.destination}`,
        qty: 1,
        amount: selected.price.amount,
      },
      { name: "Tax & Fees", qty: 1, amount: taxAmount },
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
  const optionLines = offers.map(
    (o, i) =>
      `${i === idx ? "→" : " "} ${i + 1}. ${o.airline} ${o.flight_number} ${o.origin}-${o.destination} ${o.departure_time.slice(11, 16)} ${o.price.amount} ${o.price.currency}`,
  );

  return {
    text:
      `Flights ${origin.toUpperCase()}-${destination.toUpperCase()} on ${date}:\n` +
      optionLines.join("\n") +
      `\n\n[QUOTE] ${selected.airline} ${selected.flight_number} | ${(Number(quote.amount) / 1e6).toFixed(2)} USDC | ref:${orderRef}\n` +
      `QUOTE_JSON: ${quoteJson}\n` +
      `PAYER: ${payer_wallet}\n\n` +
      `To select a different flight, call search_and_quote again with offer_index=N.\n` +
      `When all quotes are ready, call:\n` +
      `nexus_orchestrate_payment({ quotes_json: "[" + all_quotes_joined_by_comma + "]", payer_wallet: "${payer_wallet}" })`,
    data: { offers, selectedIndex: idx, quote },
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
  const sessionOfferCache = new Map<string, FlightOffer>();
  const srv = new McpServer({
    name: "xagent-flight",
    version: "2.0.0",
  });

  // ── x402 Payment Configuration ──────────────────────────────────────────
  const x402Config: X402ToolConfig = {
    toolName: "search_and_quote",
    priceUsdcAtomic: config.x402PriceAtomic,
    payTo: config.paymentAddress,
    resourceDescription: "Flight booking on XLayer",
    signerPrivateKey: config.relayerPrivateKey,
  };

  // ── Tool: search_flights ────────────────────────────────────────────────────

  srv.tool(
    "search_flights",
    "Search available flights between airports. Returns a list of flight offers with prices.",
    {
      origin: z
        .string()
        .describe("IATA airport code for departure (e.g. PVG, SHA)"),
      destination: z
        .string()
        .describe("IATA airport code for arrival (e.g. NRT, HND)"),
      date: z.string().describe("Departure date in YYYY-MM-DD format"),
      passengers: z
        .number()
        .int()
        .min(1)
        .max(9)
        .default(1)
        .describe("Number of passengers (1-9)"),
    },
    async ({ origin, destination, date, passengers }) => {
      const result = await handleSearchFlights(sessionOfferCache, {
        origin,
        destination,
        date,
        passengers,
      });
      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  // ── Tool: search_and_quote (FAST PATH + x402 Payment) ───────────────────

  srv.tool(
    "search_and_quote",
    "Search flights AND generate a quote in ONE call. " +
      "Supports x402 payment protocol — include _meta['x402/payment'] with a signed EIP-3009 " +
      "transferWithAuthorization to pay and book instantly. " +
      "Without payment, returns flights + PaymentRequired info.",
    {
      origin: z
        .string()
        .describe("IATA airport code for departure (e.g. PVG, SHA)"),
      destination: z
        .string()
        .describe("IATA airport code for arrival (e.g. NRT, HND)"),
      date: z.string().describe("Departure date in YYYY-MM-DD format"),
      passengers: z
        .number()
        .int()
        .min(1)
        .max(9)
        .default(1)
        .describe("Number of passengers (1-9)"),
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
          "Zero-based index of the flight to quote (default: 0 = cheapest). Use this to pick a different flight after seeing options.",
        ),
    },
    async (
      { origin, destination, date, passengers, payer_wallet, offer_index },
      extra,
    ) => {
      try {
        const result = await handleSearchAndQuote(sessionOfferCache, {
          origin,
          destination,
          date,
          passengers,
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

  // ── Tool: nexus_generate_quote (+ x402 Payment) ────────────────────────

  srv.tool(
    "nexus_generate_quote",
    "Generates a Nexus Payment (NUPS) quote for a selected flight offer. " +
      "Supports x402 payment — include _meta['x402/payment'] to pay instantly. " +
      "Use search_and_quote instead for faster flow.",
    {
      flight_offer_id: z
        .string()
        .describe("The offer_id from search_flights results"),
      payer_wallet: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ flight_offer_id, payer_wallet }, extra) => {
      try {
        const result = await handleGenerateQuote(sessionOfferCache, {
          flight_offer_id,
          payer_wallet,
        });

        const payment = extractX402Payment(
          (extra as any)?._meta ?? (extra as any)?.meta,
        );

        if (!payment) {
          const quoteConfig: X402ToolConfig = { ...x402Config, toolName: "nexus_generate_quote" };
          const pr = buildPaymentRequired(quoteConfig);
          return buildPaymentRequiredResult(pr, result.text);
        }

        const payResult = await processX402Payment(payment, {
          ...x402Config,
          toolName: "nexus_generate_quote",
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

  // ── Tool: nexus_check_status ────────────────────────────────────────────────

  srv.tool(
    "nexus_check_status",
    "Checks the payment status of a flight order. Use this to verify if payment has been completed.",
    {
      order_ref: z.string().describe("The order reference (e.g. FLT-...)"),
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
    "nexus://orders/{order_ref}/state",
    { description: "Current state of a flight order (RFC-003 compliant)" },
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
              nexus_payment_id: null,
              last_updated: order.updated_at,
            }),
          },
        ],
      };
    },
  );

  // ── Prompt: checkout flow ───────────────────────────────────────────────────

  srv.prompt(
    "nexus_checkout_flow",
    "Guided flow for searching flights and generating a Nexus payment quote.",
    {},
    async () => ({
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: [
              "You are facilitating a flight booking transaction using Nexus Protocol.",
              "",
              "Follow this workflow:",
              "1. Ask the user for their departure city, destination city, and travel date.",
              "2. Call 'search_flights' with the IATA codes and date.",
              "3. Present the available flights clearly to the user.",
              "4. When the user selects a flight, call 'nexus_generate_quote' with the offer_id.",
              "5. Display the NUPS payment payload to the user.",
              "6. If the user says they have paid, call 'nexus_check_status' to verify.",
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
  console.error("Flight Agent MCP Server started (stdio mode)");
}

async function handleStatelessCall(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  try {
    const rawBody = await readBody(req);
    const { tool, arguments: args } = JSON.parse(rawBody);

    let result;
    if (tool === "search_flights") {
      result = await handleSearchFlights(statelessOfferCache, args);
    } else if (tool === "search_and_quote") {
      result = await handleSearchAndQuote(statelessOfferCache, args);
    } else if (tool === "nexus_generate_quote") {
      result = await handleGenerateQuote(statelessOfferCache, args);
    } else if (tool === "nexus_check_status") {
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
    `Flight Agent MCP Server started (HTTP mode on port ${config.portalPort})`,
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
  console.error("Failed to start Flight Agent:", err);
  process.exit(1);
});
