#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchHotels } from "./services/hotel-search.js";
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
        "urn:ucp:payment:nexus_v1": [
          {
            id: "nexus_handler_1",
            version: "v1",
            config: quote,
            nexus_core: {
              skill_url: `${config.nexusCoreUrl}/skill.md`,
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
  const sessionOfferCache = new Map<string, HotelCacheEntry>();
  const srv = new McpServer({
    name: "nexus-hotel-agent",
    version: "0.1.0",
  });

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

  // ── Tool: nexus_generate_quote ──────────────────────────────────────────────

  srv.tool(
    "nexus_generate_quote",
    "Generates a Nexus Payment (NUPS) quote for a selected hotel offer. This is a required step before payment can occur.",
    {
      hotel_offer_id: z
        .string()
        .describe("The offer_id from search_hotels results"),
      payer_wallet: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ hotel_offer_id, payer_wallet }) => {
      try {
        const result = await handleGenerateQuote(sessionOfferCache, {
          hotel_offer_id,
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
    "nexus://orders/{order_ref}/state",
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
    "Guided flow for searching hotels and generating a Nexus payment quote.",
    {},
    async () => ({
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: [
              "You are facilitating a hotel booking transaction using Nexus Protocol.",
              "",
              "Follow this workflow:",
              "1. Ask the user for their destination city, check-in date, check-out date, and number of guests.",
              "2. Call 'search_hotels' with the provided details.",
              "3. Present the available hotels clearly to the user.",
              "4. When the user selects a hotel, call 'nexus_generate_quote' with the offer_id.",
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
    `Hotel Agent MCP Server started (HTTP/SSE mode on port ${config.portalPort})`,
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
  console.error("Failed to start Hotel Agent:", err);
  process.exit(1);
});
