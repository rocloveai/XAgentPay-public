#!/usr/bin/env node
/**
 * NexusPay Core — MCP Server.
 *
 * Exposes payment orchestration as MCP tools.
 * Dual transport: stdio (default) + SSE.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadNexusCoreConfig } from "./config.js";
import { initPool } from "./db/pool.js";
import { NeonPaymentRepository } from "./db/payment-repo.js";
import { NeonMerchantRepository } from "./db/merchant-repo.js";
import { NeonEventRepository } from "./db/event-repo.js";
import { NeonGroupRepository } from "./db/group-repo.js";
import { NexusOrchestrator } from "./services/orchestrator.js";
import type { NexusQuotePayload } from "./types.js";

const config = loadNexusCoreConfig();
const transportMode = process.env.TRANSPORT ?? "stdio";

// Initialize DB pool if DATABASE_URL is set
if (config.databaseUrl) {
  initPool(config.databaseUrl);
}

// Repositories
const paymentRepo = new NeonPaymentRepository();
const merchantRepo = new NeonMerchantRepository();
const eventRepo = new NeonEventRepository();
const groupRepo = new NeonGroupRepository();

// Orchestrator
const orchestrator = new NexusOrchestrator(
  merchantRepo,
  paymentRepo,
  eventRepo,
  groupRepo,
  config,
);

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "nexus-core",
  version: "0.2.0",
});

// Tool: nexus_orchestrate_payment
server.tool(
  "nexus_orchestrate_payment",
  "Orchestrate aggregated payment for one or more merchant quotes. Returns a single EIP-3009 signing instruction covering the total amount.",
  {
    quotes: z
      .array(z.any())
      .min(1)
      .describe(
        "Array of NexusQuotePayload objects from merchant UCP responses (config field)",
      ),
    payer_wallet: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("Payer EVM wallet address"),
  },
  async ({ quotes, payer_wallet }) => {
    try {
      const result = await orchestrator.orchestratePayment({
        quotes: quotes as NexusQuotePayload[],
        payerWallet: payer_wallet,
      });

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Payment Group Created\n` +
              `Group ID: ${result.group.group_id}\n` +
              `Total Amount: ${result.group.total_amount_display} ${result.group.currency}\n` +
              `Payments: ${result.payments.length}\n` +
              `Status: ${result.group.status}\n\n` +
              `Payments:\n` +
              result.payments
                .map(
                  (p, i) =>
                    `  ${i + 1}. ${p.merchant_order_ref} — ${p.amount_display} ${p.currency} (${p.nexus_payment_id})`,
                )
                .join("\n") +
              `\n\nSign the EIP-3009 authorization for ${result.group.total_amount_display} ${result.group.currency} to complete payment.\n\n` +
              `UCP Checkout Response:\n` +
              JSON.stringify(
                {
                  group_id: result.group.group_id,
                  status: result.group.status,
                  instruction: result.instruction,
                },
                null,
                2,
              ),
          },
        ],
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      return {
        content: [
          { type: "text" as const, text: `Error: ${message}` },
        ],
        isError: true,
      };
    }
  },
);

// Tool: nexus_get_payment_status
server.tool(
  "nexus_get_payment_status",
  "Check payment status by nexus_payment_id, merchant_order_ref, or group_id.",
  {
    nexus_payment_id: z.string().optional().describe("Nexus payment ID"),
    merchant_order_ref: z.string().optional().describe("Merchant order reference"),
    group_id: z.string().optional().describe("Payment group ID"),
  },
  async ({ nexus_payment_id, merchant_order_ref, group_id }) => {
    try {
      const result = await orchestrator.getPaymentStatus({
        nexusPaymentId: nexus_payment_id,
        merchantOrderRef: merchant_order_ref,
        groupId: group_id,
      });

      const parts: string[] = [];

      if (result.payment) {
        parts.push(
          `Payment: ${result.payment.nexus_payment_id}\n` +
            `  Status: ${result.payment.status}\n` +
            `  Amount: ${result.payment.amount_display} ${result.payment.currency}\n` +
            `  Merchant: ${result.payment.merchant_did}\n` +
            `  Order Ref: ${result.payment.merchant_order_ref}`,
        );
      }

      if (result.group) {
        parts.push(
          `\nGroup: ${result.group.group_id}\n` +
            `  Status: ${result.group.status}\n` +
            `  Total: ${result.group.total_amount_display} ${result.group.currency}\n` +
            `  Payments: ${result.group.payment_count}`,
        );

        if (result.groupPayments.length > 0) {
          parts.push(`\nGroup Payments:`);
          for (const p of result.groupPayments) {
            parts.push(
              `  - ${p.nexus_payment_id}: ${p.status} (${p.amount_display} ${p.currency})`,
            );
          }
        }
      }

      if (parts.length === 0) {
        parts.push("No payment found for the given parameters.");
      }

      return {
        content: [
          { type: "text" as const, text: parts.join("\n") },
        ],
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      return {
        content: [
          { type: "text" as const, text: `Error: ${message}` },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Transport setup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (transportMode === "sse") {
    const sseTransports = new Map<string, SSEServerTransport>();

    const httpServer = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

        // Serve skill.md
        if (url.pathname === "/skill.md" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "text/markdown" });
          res.end(
            "# Nexus Core\n\nPayment orchestration MCP server. Use nexus_orchestrate_payment tool.",
          );
          return;
        }

        if (url.pathname === "/sse" && req.method === "GET") {
          const transport = new SSEServerTransport("/messages", res);
          sseTransports.set(transport.sessionId, transport);
          res.on("close", () => {
            sseTransports.delete(transport.sessionId);
          });
          await server.connect(transport);
          return;
        }

        if (url.pathname === "/messages" && req.method === "POST") {
          const sessionId = url.searchParams.get("sessionId") ?? "";
          const transport = sseTransports.get(sessionId);
          if (transport) {
            await transport.handlePostMessage(req, res);
          } else {
            res.writeHead(404);
            res.end("Session not found");
          }
          return;
        }

        // Health check
        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", version: "0.2.0" }));
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      },
    );

    httpServer.listen(config.port, () => {
      console.error(
        `[NexusCore] SSE server listening on port ${config.port}`,
      );
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[NexusCore] Connected via stdio transport");
  }
}

main().catch((err) => {
  console.error("[NexusCore] Fatal error:", err);
  process.exit(1);
});
