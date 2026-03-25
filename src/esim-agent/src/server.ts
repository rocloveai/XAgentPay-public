#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { searchEsimPlans } from "./services/esim-search.js";
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

// Auto-register with xagent-core so webhooks work immediately on startup
async function registerWithXAgentCore() {
  try {
    const signerAddress = privateKeyToAccount(
      config.signerPrivateKey as `0x${string}`,
    ).address;
    // Use internal Docker URL for webhooks (avoids nginx dependency).
    // XAGENT_CORE_URL is already the internal address (http://xagent-core:10000),
    // so we derive our internal hostname from Docker service name.
    const internalWebhookUrl =
      process.env.WEBHOOK_URL || "http://esim-agent:10000/webhook";
    const body = {
      merchant_did: config.merchantDid,
      name: "XAgent eSIM",
      description: "Global eSIM data plans for 190+ countries. Instant activation with USDC payments on XLayer. Search plans, purchase eSIMs, and get QR codes for instant activation.",
      category: "travel.esim",
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
      console.error("[eSIM Agent] Registered with xagent-core successfully");
    } else {
      console.error(
        `[eSIM Agent] Registration failed: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err: any) {
    console.error(`[eSIM Agent] Registration error: ${err.message}`);
  }
}
registerWithXAgentCore();

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
    text:
      header +
      lines.join("\n\n") +
      "\n\nTo purchase an eSIM: call purchase_esim(plan_id=\"<offer_id>\", payer_wallet=\"<wallet>\")",
    data: plans,
  };
}

async function handleSearchAndQuote(
  cache: Map<string, EsimPlan>,
  args: { country: string; days?: number; data_gb?: number },
) {
  return handleSearchPlans(cache, args);
}

async function handlePurchaseEsim(
  cache: Map<string, EsimPlan>,
  { plan_id, payer_wallet }: { plan_id: string; payer_wallet: string },
): Promise<{ text: string; priceAtomic: string; plan: EsimPlan }> {
  const plan = cache.get(plan_id);
  if (!plan) {
    throw new Error(`eSIM plan "${plan_id}" not found. Please search for plans first.`);
  }
  const priceAtomic = String(Math.round(parseFloat(plan.price.amount) * 1_000_000));
  return {
    text: `${plan.provider} ${plan.data_gb}GB ${plan.country} | ${plan.days} days | ${plan.price.amount} USDC`,
    priceAtomic,
    plan,
  };
}

// ── McpServer factory (one instance per SSE connection) ─────────────────────

function createMcpServer(): McpServer {
  const sessionOfferCache = new Map<string, EsimPlan>();
  const srv = new McpServer({
    name: "xagent-esim",
    version: "2.0.0",
  });

  // ── Tool: search_and_quote (FREE) ─────────────────────────────────────────

  srv.tool(
    "search_and_quote",
    "Search available eSIM data plans by country. Returns a list of plans with data allowance, validity, network, and pricing. FREE — no payment required for search.",
    {
      country: z.string().describe("Country name or code (e.g. 'Japan', 'JP', 'Thailand', 'US')"),
      days: z.number().int().min(1).optional().describe("Minimum validity in days (optional filter)"),
      data_gb: z.number().min(0.5).optional().describe("Minimum data allowance in GB (optional filter)"),
    },
    async ({ country, days, data_gb }) => {
      const result = await handleSearchPlans(sessionOfferCache, { country, days, data_gb });
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  // ── Tool: search_esim_plans (FREE) ────────────────────────────────────────

  srv.tool(
    "search_esim_plans",
    "Search available eSIM data plans by country. Returns plans with offer IDs. FREE — no payment required.",
    {
      country: z.string().describe("Country name or code (e.g. 'Japan', 'JP', 'Thailand', 'US')"),
      days: z.number().int().min(1).optional().describe("Minimum validity in days (optional filter)"),
      data_gb: z.number().min(0.5).optional().describe("Minimum data allowance in GB (optional filter)"),
    },
    async ({ country, days, data_gb }) => {
      const result = await handleSearchPlans(sessionOfferCache, { country, days, data_gb });
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  // ── Tool: purchase_esim (x402 payment) ───────────────────────────────────

  srv.tool(
    "purchase_esim",
    "Purchase an eSIM plan with x402 payment. Requires x402 EIP-3009 payment in _meta['x402/payment'] for the exact plan price in USDC. First call returns payment requirements; include payment on second call to activate eSIM.",
    {
      plan_id: z.string().describe("eSIM plan offer ID from search_and_quote results"),
      payer_wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Payer's EVM wallet address (0x...)"),
    },
    async ({ plan_id, payer_wallet }, extra) => {
      let info: Awaited<ReturnType<typeof handlePurchaseEsim>>;
      try {
        info = await handlePurchaseEsim(sessionOfferCache, { plan_id, payer_wallet });
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }

      const purchaseConfig: X402ToolConfig = {
        toolName: "purchase_esim",
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

      const confirmNum = `ESIM-${Date.now().toString(36).toUpperCase()}`;
      return buildPaidToolResult(
        `✅ eSIM Activated!\n` +
        `${info.plan.provider} - ${info.plan.data_gb}GB for ${info.plan.country}\n` +
        `Validity: ${info.plan.days} days\n` +
        `Price paid: ${info.plan.price.amount} USDC\n` +
        `TX: ${payResult.settled.transaction}\n` +
        `Activation code: [mock QR code would appear here]\n` +
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
  console.error("eSIM Agent MCP Server started (stdio mode)");
}

async function handleStatelessCall(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const reqUrl = new URL(req.url ?? "/", "http://localhost");

  // ── HTTP search endpoint (FREE — no x402 gate) ────────────────────────────
  if (
    reqUrl.pathname === "/api/search" ||
    reqUrl.pathname === "/api/search/esim"
  ) {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      });
      res.end();
      return true;
    }

    let args: any;
    if (req.method === "GET") {
      // Support GET with query params: ?country=Thailand&data_gb=5
      args = {
        country: reqUrl.searchParams.get("country") || "",
        data_gb: reqUrl.searchParams.has("data_gb")
          ? parseFloat(reqUrl.searchParams.get("data_gb")!)
          : undefined,
        days: reqUrl.searchParams.has("days")
          ? parseInt(reqUrl.searchParams.get("days")!)
          : undefined,
      };
    } else {
      // POST with JSON body
      const rawBody = await readBody(req);
      args = JSON.parse(rawBody);
    }

    // Free search — no payment required
    try {
      const result = await handleSearchPlans(statelessOfferCache, args);
      sendJson(res, 200, {
        plans: result.data,
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
    reqUrl.pathname === "/api/purchase/esim"
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

    let info: Awaited<ReturnType<typeof handlePurchaseEsim>>;
    try {
      info = await handlePurchaseEsim(statelessOfferCache, args);
    } catch (err: any) {
      sendJson(res, 400, { error: err.message });
      return true;
    }

    const httpConfig = {
      toolName: "purchase_esim",
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

    const confirmNum = `ESIM-${Date.now().toString(36).toUpperCase()}`;
    sendJson(res, 200, {
      status: "activated",
      confirmation: confirmNum,
      plan: info.plan,
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
    if (tool === "search_esim_plans") {
      result = await handleSearchPlans(statelessOfferCache, args);
    } else if (tool === "search_and_quote") {
      result = await handleSearchAndQuote(statelessOfferCache, args);
    } else if (tool === "purchase_esim") {
      const info = await handlePurchaseEsim(statelessOfferCache, args);
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
    `eSIM Agent MCP Server started (HTTP mode on port ${config.portalPort})`,
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
  console.error("Failed to start eSIM Agent:", err);
  process.exit(1);
});
