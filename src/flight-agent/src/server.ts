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
import { startPortal, registerSseHandler } from "./portal.js";
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

// In-memory cache: offer_id -> FlightOffer (for quote generation)
const offerCache = new Map<string, FlightOffer>();

const server = new McpServer({
  name: "nexus-flight-agent",
  version: "0.1.0",
});

// ── Tool: search_flights ──────────────────────────────────────────────────────

server.tool(
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
    const { offers, error } = await searchFlights({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      date,
      passengers,
    });

    // Cache offers for later quote generation
    for (const offer of offers) {
      offerCache.set(offer.offer_id, offer);
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
      content: [
        {
          type: "text" as const,
          text: header + lines.join("\n\n"),
        },
      ],
    };
  },
);

// ── Tool: nexus_generate_quote ────────────────────────────────────────────────

server.tool(
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
    const offer = offerCache.get(flight_offer_id);
    if (!offer) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Flight offer "${flight_offer_id}" not found. Please search for flights first.`,
          },
        ],
        isError: true,
      };
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
  "Checks the payment status of a flight order. Use this to verify if payment has been completed.",
  {
    order_ref: z.string().describe("The order reference (e.g. FLT-...)"),
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

// ── Prompt: checkout flow ─────────────────────────────────────────────────────

server.prompt(
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
  console.error("Flight Agent MCP Server started (stdio mode)");
}

async function startHttpMode() {
  const transports = new Map<string, SSEServerTransport>();

  registerSseHandler(
    async (
      req: IncomingMessage,
      res: ServerResponse,
      url: URL,
    ): Promise<boolean> => {
      const path = url.pathname;

      if (path === "/sse" && req.method === "GET") {
        const transport = new SSEServerTransport("/messages", res);
        transports.set(transport.sessionId, transport);

        res.on("close", () => {
          transports.delete(transport.sessionId);
        });

        await server.connect(transport);
        return true;
      }

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
