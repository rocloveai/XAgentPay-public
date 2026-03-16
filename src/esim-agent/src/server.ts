#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchEsimPlans } from "./services/esim-search.js";
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
import type { EsimPlan } from "./types.js";
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
    const body = {
      merchant_did: config.merchantDid,
      name: "XAgent eSIM",
      description: "Global eSIM data plans for 190+ countries. Instant activation with USDC payments on XLayer. Search plans, purchase eSIMs, and get QR codes for instant activation.",
      category: "telecom.esim",
      signer_address: signerAddress,
      payment_address: config.paymentAddress,
      skill_md_url: `${config.portalBaseUrl}/skill.md`,
      health_url: `${config.portalBaseUrl}/health`,
      webhook_url: `${config.portalBaseUrl}/webhook`,
      webhook_secret: config.webhookSecret,
    };
    const res = await fetch(`${config.nexusCoreUrl}/api/market/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      console.error("[eSIM Agent] Registered with nexus-core successfully");
    } else {
      console.error(
        `[eSIM Agent] Registration failed: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err: any) {
    console.error(`[eSIM Agent] Registration error: ${err.message}`);
  }
}
registerWithNexusCore();

// Stateless REST calls share a process-level cache
const statelessOfferCache = new Map<string, EsimPlan>();

// ── Tool Implementations ────────────────────────────────────────────────────

async function handleSearchPlans(
  cache: Map<string, EsimPlan>,
  {
    country,
    days,
    data_gb,
  }: { country: string; days?: number; data_gb?: number },
) {
  const { plans, error } = await searchEsimPlans({ country, days, data_gb });

  for (const plan of plans) {
    cache.set(plan.offer_id, plan);
  }

  const lines = plans.map(
    (p, i) =>
      `${i + 1}. [${p.offer_id}]\n` +
      `   ${p.country} (${p.country_code}) | ${p.data_gb}GB / ${p.days} days\n` +
      `   Network: ${p.network}\n` +
      `   Provider: ${p.provider}\n` +
      `   Price: ${p.price.amount} ${p.price.currency}`,
  );

  const header = error
    ? `Note: ${error}\n\nAvailable eSIM Plans:\n`
    : `eSIM Plans for ${plans[0]?.country ?? country}:\n`;

  return {
    text: header + lines.join("\n\n"),
    data: plans,
  };
}

async function handleGenerateQuote(
  cache: Map<string, EsimPlan>,
  {
    esim_offer_id,
    payer_wallet,
  }: {
    esim_offer_id: string;
    payer_wallet: string;
  },
) {
  const plan = cache.get(esim_offer_id);
  if (!plan) {
    throw new Error(
      `eSIM plan "${esim_offer_id}" not found. Please search for plans first.`,
    );
  }

  const orderRef = newOrderRef();
  // eSIM is a digital product — no tax
  const totalAmount = plan.price.amount;

  const quote = await buildQuote({
    merchantDid: config.merchantDid,
    orderRef,
    amount: totalAmount,
    currency: "USDC",
    summary: `eSIM ${plan.country} ${plan.data_gb}GB/${plan.days}d (${plan.network})`,
    lineItems: [
      {
        name: `eSIM ${plan.country} ${plan.data_gb}GB ${plan.days}-day plan`,
        qty: 1,
        amount: plan.price.amount,
      },
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

  const quoteJson = JSON.stringify(quote);

  return {
    text:
      `[QUOTE] eSIM ${plan.country} ${plan.data_gb}GB/${plan.days}d | ${(Number(quote.amount) / 1e6).toFixed(2)} USDC | ref:${order.order_ref}\n` +
      `QUOTE_JSON: ${quoteJson}\n` +
      `PAYER: ${payer_wallet}\n\n` +
      `Collect all QUOTE_JSON values, then call:\n` +
      `nexus_orchestrate_payment({ quotes_json: "[" + all_quotes_joined_by_comma + "]", payer_wallet: "${payer_wallet}" })`,
    data: ucpCheckoutResponse,
    order_ref: order.order_ref,
  };
}

async function handleSearchAndQuote(
  cache: Map<string, EsimPlan>,
  {
    country,
    days,
    data_gb,
    payer_wallet,
    offer_index,
  }: {
    country: string;
    days?: number;
    data_gb?: number;
    payer_wallet: string;
    offer_index?: number;
  },
) {
  // Step 1: Search
  const { plans, error } = await searchEsimPlans({ country, days, data_gb });

  if (plans.length === 0) {
    throw new Error(error ?? "No eSIM plans found for this country.");
  }

  for (const plan of plans) {
    cache.set(plan.offer_id, plan);
  }

  // Step 2: Auto-quote the selected (or cheapest) plan
  const idx = offer_index ?? 0;
  const selected =
    idx >= 0 && idx < plans.length
      ? plans[idx]
      : [...plans].sort(
          (a, b) => parseFloat(a.price.amount) - parseFloat(b.price.amount),
        )[0];

  const orderRef = newOrderRef();
  const totalAmount = selected.price.amount; // no tax for digital product

  const quote = await buildQuote({
    merchantDid: config.merchantDid,
    orderRef,
    amount: totalAmount,
    currency: "USDC",
    summary: `eSIM ${selected.country} ${selected.data_gb}GB/${selected.days}d (${selected.network})`,
    lineItems: [
      {
        name: `eSIM ${selected.country} ${selected.data_gb}GB ${selected.days}-day plan`,
        qty: 1,
        amount: selected.price.amount,
      },
    ],
    payerWallet: payer_wallet,
    signerPrivateKey: config.signerPrivateKey,
  });

  // Fire-and-forget order creation
  createOrder(quote).catch((err) =>
    console.error(`createOrder failed for ${orderRef}:`, err.message),
  );
  const quoteJson = JSON.stringify(quote);

  // Build compact options list + selected quote
  const optionLines = plans.map(
    (p, i) =>
      `${i === idx ? "→" : " "} ${i + 1}. ${p.country} ${p.data_gb}GB/${p.days}d ${p.price.amount} ${p.price.currency} (${p.network})`,
  );

  return {
    text:
      `eSIM Plans for ${selected.country}:\n` +
      optionLines.join("\n") +
      `\n\n[QUOTE] eSIM ${selected.country} ${selected.data_gb}GB/${selected.days}d | ${(Number(quote.amount) / 1e6).toFixed(2)} USDC | ref:${orderRef}\n` +
      `QUOTE_JSON: ${quoteJson}\n` +
      `PAYER: ${payer_wallet}\n\n` +
      `To select a different plan, call search_and_quote again with offer_index=N.\n` +
      `When all quotes are ready, call:\n` +
      `nexus_orchestrate_payment({ quotes_json: "[" + all_quotes_joined_by_comma + "]", payer_wallet: "${payer_wallet}" })`,
    data: { plans, selectedIndex: idx, quote },
    order_ref: orderRef,
  };
}

async function handleCheckStatus({ order_ref }: { order_ref: string }) {
  const order = await getOrder(order_ref);
  if (!order) {
    throw new Error(`Order "${order_ref}" not found.`);
  }

  let text =
    `Order Status\n` +
    `Ref: ${order.order_ref}\n` +
    `Status: ${order.status}\n` +
    `Amount: ${order.quote_payload.amount} ${order.quote_payload.currency}\n` +
    `Summary: ${order.quote_payload.context.summary}\n` +
    `Created: ${order.created_at}\n` +
    `Updated: ${order.updated_at}`;

  // If PAID, include QR code delivery info
  if (order.status === "PAID" && order.qr_data_url && order.activation_code) {
    text +=
      `\n\n✅ eSIM Activated!\n` +
      `📱 Scan the QR code below to install your eSIM:\n\n` +
      `QR Code (data URL): ${order.qr_data_url}\n\n` +
      `Activation Code: ${order.activation_code}\n\n` +
      `Instructions:\n` +
      `1. Open your phone Settings → Mobile Data → Add eSIM\n` +
      `2. Scan the QR code or enter the activation code manually\n` +
      `3. Enable the eSIM data plan and enjoy your trip!`;
  }

  return {
    text,
    data: order,
  };
}

// ── McpServer factory (one instance per SSE connection) ─────────────────────

function createMcpServer(): McpServer {
  const sessionOfferCache = new Map<string, EsimPlan>();
  const srv = new McpServer({
    name: "xagent-esim",
    version: "1.0.0",
  });

  // ── Tool: search_esim_plans ───────────────────────────────────────────────

  srv.tool(
    "search_esim_plans",
    "Search available eSIM data plans by country. Returns a list of plans with data allowance, validity, network, and pricing.",
    {
      country: z
        .string()
        .describe("Country name or code (e.g. 'Japan', 'JP', 'Thailand', 'US')"),
      days: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Minimum validity in days (optional filter)"),
      data_gb: z
        .number()
        .min(0.5)
        .optional()
        .describe("Minimum data allowance in GB (optional filter)"),
    },
    async ({ country, days, data_gb }) => {
      const result = await handleSearchPlans(sessionOfferCache, {
        country,
        days,
        data_gb,
      });
      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  // ── Tool: search_and_quote (FAST PATH) ────────────────────────────────────

  srv.tool(
    "search_and_quote",
    "Search eSIM plans AND generate a Nexus quote for the best option in ONE call. " +
      "This is the fastest way to get an eSIM quote. " +
      "Returns all options plus a ready-to-use quote for the cheapest plan (or specify offer_index to pick a different one).",
    {
      country: z
        .string()
        .describe("Country name or code (e.g. 'Japan', 'JP', 'Thailand', 'US')"),
      days: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Minimum validity in days (optional filter)"),
      data_gb: z
        .number()
        .min(0.5)
        .optional()
        .describe("Minimum data allowance in GB (optional filter)"),
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
          "Zero-based index of the plan to quote (default: 0 = cheapest). Use this to pick a different plan after seeing options.",
        ),
    },
    async ({ country, days, data_gb, payer_wallet, offer_index }) => {
      try {
        const result = await handleSearchAndQuote(sessionOfferCache, {
          country,
          days,
          data_gb,
          payer_wallet,
          offer_index,
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

  // ── Tool: nexus_generate_quote ────────────────────────────────────────────

  srv.tool(
    "nexus_generate_quote",
    "Generates a Nexus Payment (NUPS) quote for a selected eSIM plan. Use search_and_quote instead for faster flow.",
    {
      esim_offer_id: z
        .string()
        .describe("The offer_id from search_esim_plans results"),
      payer_wallet: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ esim_offer_id, payer_wallet }) => {
      try {
        const result = await handleGenerateQuote(sessionOfferCache, {
          esim_offer_id,
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

  // ── Tool: nexus_check_status ──────────────────────────────────────────────

  srv.tool(
    "nexus_check_status",
    "Checks the payment status of an eSIM order. If paid, returns the eSIM QR code for activation.",
    {
      order_ref: z.string().describe("The order reference (e.g. ESIM-...)"),
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

  // ── Resource: order state ─────────────────────────────────────────────────

  srv.resource(
    "order-state",
    "nexus://orders/{order_ref}/state",
    { description: "Current state of an eSIM order (RFC-003 compliant)" },
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
              qr_data_url: order.qr_data_url ?? null,
              activation_code: order.activation_code ?? null,
            }),
          },
        ],
      };
    },
  );

  // ── Prompt: checkout flow ─────────────────────────────────────────────────

  srv.prompt(
    "nexus_checkout_flow",
    "Guided flow for searching eSIM plans and generating a Nexus payment quote.",
    {},
    async () => ({
      messages: [
        {
          role: "assistant" as const,
          content: {
            type: "text" as const,
            text: [
              "You are facilitating an eSIM purchase transaction using Nexus Protocol.",
              "",
              "Follow this workflow:",
              "1. Ask the user which country they need an eSIM for and how long they will stay.",
              "2. Call 'search_esim_plans' with the country name.",
              "3. Present the available eSIM plans clearly to the user (data, days, price).",
              "4. When the user selects a plan, call 'nexus_generate_quote' with the offer_id.",
              "5. Display the NUPS payment payload to the user.",
              "6. If the user says they have paid, call 'nexus_check_status' to verify.",
              "7. Once status is 'PAID', show them the QR code and activation instructions.",
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
  console.error("eSIM Agent MCP Server started (stdio mode)");
}

async function handleStatelessCall(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  try {
    const rawBody = await readBody(req);
    const { tool, arguments: args } = JSON.parse(rawBody);

    let result;
    if (tool === "search_esim_plans") {
      result = await handleSearchPlans(statelessOfferCache, args);
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
    `eSIM Agent MCP Server started (HTTP mode on port ${config.portalPort})`,
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
  console.error("Failed to start eSIM Agent:", err);
  process.exit(1);
});
