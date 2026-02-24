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
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { loadNexusCoreConfig } from "./config.js";
import { initPool } from "./db/pool.js";
import { NeonPaymentRepository } from "./db/payment-repo.js";
import { NeonMerchantRepository } from "./db/merchant-repo.js";
import { NeonEventRepository } from "./db/event-repo.js";
import { NeonGroupRepository } from "./db/group-repo.js";
import { NeonWebhookRepository } from "./db/webhook-repo.js";
import { NexusOrchestrator } from "./services/orchestrator.js";
import { PaymentStateMachine } from "./services/state-machine.js";
import { GroupManager } from "./services/group-manager.js";
import { NexusRelayer } from "./services/relayer.js";
import { ChainWatcher } from "./services/chain-watcher.js";
import { TimeoutHandler } from "./services/timeout-handler.js";
import { WebhookNotifier } from "./services/webhook-notifier.js";
import type { NexusQuotePayload, Hex } from "./types.js";

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
const webhookRepo = new NeonWebhookRepository();

// Core services
const stateMachine = new PaymentStateMachine(paymentRepo, eventRepo);
const groupManager = new GroupManager(groupRepo, paymentRepo, eventRepo);
const webhookNotifier = new WebhookNotifier(webhookRepo, merchantRepo);

// Orchestrator
const orchestrator = new NexusOrchestrator(
  merchantRepo,
  paymentRepo,
  eventRepo,
  groupRepo,
  config,
);

// Relayer (only if private key configured)
let relayer: NexusRelayer | null = null;
let watcher: ChainWatcher | null = null;
let timeoutHandler: TimeoutHandler | null = null;

if (config.relayerPrivateKey) {
  relayer = new NexusRelayer(config);
  watcher = new ChainWatcher(
    config,
    paymentRepo,
    stateMachine,
    groupManager,
    webhookNotifier,
  );
  timeoutHandler = new TimeoutHandler(
    relayer,
    paymentRepo,
    stateMachine,
    config.timeoutSweepIntervalMs,
  );
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "nexus-core",
  version: "0.3.0",
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
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
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
    merchant_order_ref: z
      .string()
      .optional()
      .describe("Merchant order reference"),
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
        content: [{ type: "text" as const, text: parts.join("\n") }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// Tool: nexus_submit_eip3009_signature
server.tool(
  "nexus_submit_eip3009_signature",
  "Submit a user's EIP-3009 signature to deposit funds into escrow via the relayer.",
  {
    payment_id: z.string().describe("Nexus payment ID (PAY-...)"),
    group_id: z.string().describe("Payment group ID (GRP-...)"),
    v: z.number().refine((n) => n === 27 || n === 28, "v must be 27 or 28"),
    r: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .describe("Signature r (32 bytes hex)"),
    s: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .describe("Signature s (32 bytes hex)"),
    order_ref_hash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .describe("keccak256 of merchant order ref"),
    merchant_did_hash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .describe("keccak256 of merchant DID"),
    context_hash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .describe("keccak256 of payment context"),
  },
  async ({
    payment_id,
    group_id,
    v,
    r,
    s,
    order_ref_hash,
    merchant_did_hash,
    context_hash,
  }) => {
    try {
      if (!relayer) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Relayer not configured (RELAYER_PRIVATE_KEY missing)",
            },
          ],
          isError: true,
        };
      }

      const payment = await stateMachine.getPayment(payment_id);
      if (!payment) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Payment ${payment_id} not found`,
            },
          ],
          isError: true,
        };
      }

      if (!payment.payment_id_bytes32) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Payment has no payment_id_bytes32",
            },
          ],
          isError: true,
        };
      }

      if (!payment.eip3009_nonce) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Payment has no eip3009_nonce",
            },
          ],
          isError: true,
        };
      }

      // Transition to AWAITING_TX
      await stateMachine.transition({
        nexusPaymentId: payment_id,
        toStatus: "AWAITING_TX",
        eventType: "EIP3009_SIGNATURE_RECEIVED",
        metadata: { group_id, v, r, s },
      });

      const result = await relayer.submitDeposit({
        paymentId: payment.payment_id_bytes32 as Hex,
        from: payment.payer_wallet as Hex,
        merchant: payment.payment_address as Hex,
        amount: BigInt(payment.amount),
        orderRef: order_ref_hash as Hex,
        merchantDid: merchant_did_hash as Hex,
        contextHash: context_hash as Hex,
        validAfter: 0n,
        validBefore: BigInt(payment.quote_payload.expiry),
        nonce: payment.eip3009_nonce as Hex,
        v,
        r: r as Hex,
        s: s as Hex,
      });

      // Transition to BROADCASTED
      await stateMachine.transition({
        nexusPaymentId: payment_id,
        toStatus: "BROADCASTED",
        eventType: "RELAYER_TX_SUBMITTED",
        metadata: { tx_hash: result.txHash },
        fields: { tx_hash: result.txHash },
      });

      // Notify webhook (fire-and-forget with logging)
      webhookNotifier
        .notify(payment, "payment.escrowed")
        .catch((err) => console.error("[server] webhook notify failed:", err));

      return {
        content: [
          {
            type: "text" as const,
            text:
              `EIP-3009 deposit submitted\n` +
              `TX Hash: ${result.txHash}\n` +
              `Block: ${result.blockNumber}\n` +
              `Status: ${result.status}\n` +
              `Payment: ${payment_id}\n` +
              `Group: ${group_id}`,
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// Tool: nexus_release_payment
server.tool(
  "nexus_release_payment",
  "Release escrowed funds to the merchant. Called by merchant agent after fulfillment.",
  {
    payment_id: z.string().describe("Nexus payment ID (PAY-...)"),
  },
  async ({ payment_id }) => {
    try {
      if (!relayer) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Relayer not configured (RELAYER_PRIVATE_KEY missing)",
            },
          ],
          isError: true,
        };
      }

      const payment = await stateMachine.getPayment(payment_id);
      if (!payment) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Payment ${payment_id} not found`,
            },
          ],
          isError: true,
        };
      }

      if (!payment.payment_id_bytes32) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Payment has no payment_id_bytes32",
            },
          ],
          isError: true,
        };
      }

      const result = await relayer.submitRelease(
        payment.payment_id_bytes32 as Hex,
      );

      // ChainWatcher will handle the Released event and transition state

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Release submitted\n` +
              `TX Hash: ${result.txHash}\n` +
              `Block: ${result.blockNumber}\n` +
              `Status: ${result.status}\n` +
              `Payment: ${payment_id}`,
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  },
);

// Tool: nexus_dispute_payment (placeholder for Phase 5)
server.tool(
  "nexus_dispute_payment",
  "Open a dispute for an escrowed payment. (Phase 5 — currently a placeholder.)",
  {
    payment_id: z.string().describe("Nexus payment ID (PAY-...)"),
    reason: z.string().describe("Dispute reason"),
  },
  async ({ payment_id, reason }) => {
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Dispute functionality is not yet implemented (Phase 5).\n` +
            `Payment: ${payment_id}\n` +
            `Reason: ${reason}`,
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Transport setup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (transportMode === "sse") {
    // Start background services in SSE (server) mode
    if (watcher) watcher.start();
    if (timeoutHandler) timeoutHandler.start();
    webhookNotifier.startRetryLoop(config.webhookRetryIntervalMs);

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
          res.end(JSON.stringify({ status: "ok", version: "0.3.0" }));
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      },
    );

    httpServer.listen(config.port, () => {
      console.error(`[NexusCore] SSE server listening on port ${config.port}`);
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
