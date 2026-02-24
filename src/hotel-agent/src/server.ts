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
import { startPortal, registerSseHandler } from "./portal.js";
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

// In-memory cache: offer_id -> { offer, nights } (for quote generation)
const offerCache = new Map<string, { offer: HotelOffer; nights: number }>();

const server = new McpServer({
  name: "nexus-hotel-agent",
  version: "0.1.0",
});

// ── Tool: search_hotels ───────────────────────────────────────────────────────

server.tool(
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
    const { offers, nights, error } = await searchHotels({
      city,
      check_in,
      check_out,
      guests,
    });

    if (error && offers.length === 0) {
      return {
        content: [{ type: "text" as const, text: `Error: ${error}` }],
        isError: true,
      };
    }

    // Cache offers for later quote generation
    for (const offer of offers) {
      offerCache.set(offer.offer_id, { offer, nights });
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
      content: [
        {
          type: "text" as const,
          text:
            `Hotels in ${city} (${check_in} to ${check_out}, ${nights} nights, ${guests} guest(s)):\n\n` +
            lines.join("\n\n"),
        },
      ],
    };
  },
);

// ── Tool: nexus_generate_quote ────────────────────────────────────────────────

server.tool(
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
    const cached = offerCache.get(hotel_offer_id);
    if (!cached) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Hotel offer "${hotel_offer_id}" not found. Please search for hotels first.`,
          },
        ],
        isError: true,
      };
    }

    const { offer, nights } = cached;
    const orderRef = newOrderRef();
    const roomTotal = (
      parseFloat(offer.price_per_night.amount) * nights
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
    });

    const order = await createOrder(quote);

    const paymentMethodsWrapper = {
      payment_methods: [
        {
          type: "urn:ucp:payment:nexus_v1",
          payload: quote,
        },
      ],
    };

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Nexus Payment Quote Generated\n` +
            `Order Ref: ${order.order_ref}\n` +
            `Original Amount: ${totalAmount} USDC\n` +
            `Demo Discount: 0.10 USDC (test mode)\n` +
            `Pay Amount: 0.10 USDC\n` +
            `Status: ${order.status}\n` +
            `Expires: ${new Date(quote.expiry * 1000).toISOString()}\n\n` +
            `NUPS Payload:\n${JSON.stringify(paymentMethodsWrapper, null, 2)}`,
        },
      ],
    };
  },
);

// ── Tool: nexus_check_status ──────────────────────────────────────────────────

server.tool(
  "nexus_check_status",
  "Checks the payment status of a hotel order. Use this to verify if payment has been completed.",
  {
    order_ref: z.string().describe("The order reference (e.g. HTL-...)"),
  },
  async ({ order_ref }) => {
    const order = await getOrder(order_ref);
    if (!order) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Order "${order_ref}" not found.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Order Status\n` +
            `Ref: ${order.order_ref}\n` +
            `Status: ${order.status}\n` +
            `Amount: ${order.quote_payload.amount} ${order.quote_payload.currency}\n` +
            `Summary: ${order.quote_payload.context.summary}\n` +
            `Created: ${order.created_at}\n` +
            `Updated: ${order.updated_at}`,
        },
      ],
    };
  },
);

// ── Resource: order state ─────────────────────────────────────────────────────

server.resource(
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

// ── Prompt: checkout flow ─────────────────────────────────────────────────────

server.prompt(
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hotel Agent MCP Server started (stdio mode)");
}

async function startHttpMode() {
  // SSE session registry
  const transports = new Map<string, SSEServerTransport>();

  registerSseHandler(
    async (
      req: IncomingMessage,
      res: ServerResponse,
      url: URL,
    ): Promise<boolean> => {
      const path = url.pathname;

      // GET /sse — establish SSE stream
      if (path === "/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/messages", res);
        transports.set(transport.sessionId, transport);

        res.on("close", () => {
          transports.delete(transport.sessionId);
        });

        await server.connect(transport);
        return true;
      }

      // POST /messages?sessionId=xxx — send message to server
      if (path === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const transport = transports.get(sessionId);

        if (!transport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
          return true;
        }

        await transport.handlePostMessage(req, res);
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
