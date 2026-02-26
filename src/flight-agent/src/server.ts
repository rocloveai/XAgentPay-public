#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchFlights } from "./services/flight-search.js";
import { buildQuote } from "./services/quote-builder.js";
import { createOrder, getOrder, newOrderRef } from "./services/order-store.js";
import { initPool } from "./services/db/pool.js";
import {
  startPortal,
  registerSseHandler,
  registerStatelessHandler,
  readBody,
  sendJson,
} from "./portal.js";
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
              mcp_endpoint: `${config.nexusCoreUrl}/sse`,
              prompt:
                "To pay for this order, use the nexus_orchestrate_payment tool from Nexus Core MCP server. " +
                "Pass the quote from config field as one element of the quotes array, along with the user's payer_wallet address. " +
                "Multiple nexus_v1 quotes can be combined into a single payment by passing them all in the quotes array.",
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

  return {
    text:
      `Nexus Payment Quote Generated\n` +
      `Order Ref: ${order.order_ref}\n` +
      `Original Amount: ${totalAmount} USDC\n` +
      `Demo Discount: 0.10 USDC (test mode)\n` +
      `Pay Amount: 0.10 USDC\n` +
      `Status: ${order.status}\n` +
      `Expires: ${new Date(quote.expiry * 1000).toISOString()}\n\n` +
      `NUPS Payload (UCP Checkout Format):\n${JSON.stringify(ucpCheckoutResponse, null, 2)}`,
    data: ucpCheckoutResponse,
    order_ref: order.order_ref,
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
    name: "nexus-flight-agent",
    version: "0.1.0",
  });

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

  // ── Tool: nexus_generate_quote ──────────────────────────────────────────────

  srv.tool(
    "nexus_generate_quote",
    "Generates a Nexus Payment (NUPS) quote for a selected flight offer. This is a required step before payment can occur.",
    {
      flight_offer_id: z
        .string()
        .describe("The offer_id from search_flights results"),
      payer_wallet: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ flight_offer_id, payer_wallet }) => {
      try {
        const result = await handleGenerateQuote(sessionOfferCache, {
          flight_offer_id,
          payer_wallet,
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
  const sessions = new Map<
    string,
    { transport: SSEServerTransport; server: McpServer }
  >();

  registerStatelessHandler(handleStatelessCall);

  registerSseHandler(
    async (
      req: IncomingMessage,
      res: ServerResponse,
      url: URL,
    ): Promise<boolean> => {
      const path = url.pathname;

      if (path === "/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/messages", res);
        const server = createMcpServer();
        sessions.set(transport.sessionId, { transport, server });

        res.on("close", () => {
          const session = sessions.get(transport.sessionId);
          if (session) {
            session.server.close().catch(() => {});
            sessions.delete(transport.sessionId);
          }
        });

        await server.connect(transport);
        return true;
      }

      if (path === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const session = sessions.get(sessionId);

        if (!session) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
          return true;
        }

        await session.transport.handlePostMessage(req, res);
        return true;
      }

      return false;
    },
  );

  startPortal(config);
  console.error(
    `Flight Agent MCP Server started (HTTP/SSE mode on port ${config.portalPort})`,
  );
  console.error(
    `  SSE endpoint:     http://localhost:${config.portalPort}/sse`,
  );
  console.error(
    `  Messages endpoint: http://localhost:${config.portalPort}/messages`,
  );
  console.error(
    `  Skill:            http://localhost:${config.portalPort}/skill.md`,
  );
}

main().catch((err) => {
  console.error("Failed to start Flight Agent:", err);
  process.exit(1);
});
