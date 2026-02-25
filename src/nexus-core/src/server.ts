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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadNexusCoreConfig,
  validateConfig,
  type TransportMode,
} from "./config.js";
import { initPool } from "./db/pool.js";
import { NeonPaymentRepository } from "./db/payment-repo.js";
import { NeonMerchantRepository } from "./db/merchant-repo.js";
import { NeonEventRepository } from "./db/event-repo.js";
import { NeonGroupRepository } from "./db/group-repo.js";
import { NeonWebhookRepository } from "./db/webhook-repo.js";
import { NeonKVRepository } from "./db/kv-repo.js";
import { NexusOrchestrator } from "./services/orchestrator.js";
import { PaymentStateMachine } from "./services/state-machine.js";
import { GroupManager } from "./services/group-manager.js";
import { NexusRelayer } from "./services/relayer.js";
import { ChainWatcher } from "./services/chain-watcher.js";
import { TimeoutHandler } from "./services/timeout-handler.js";
import { WebhookNotifier } from "./services/webhook-notifier.js";
import { keccak256, toHex, encodeFunctionData, formatUnits } from "viem";
import { NEXUS_PAY_ESCROW_ABI } from "./abi/nexus-pay-escrow.js";
import type { NexusQuotePayload, Hex } from "./types.js";
import { handlePortalRequest, type PortalDeps } from "./portal.js";
import { handleCheckoutRequest, type CheckoutDeps } from "./checkout.js";
import { normalizeQuotes } from "./normalize-quotes.js";
import { createLogger } from "./logger.js";

const serverLog = createLogger("NexusCore");

// ---------------------------------------------------------------------------
// Debug ring buffer — keeps last N orchestration errors for diagnostics
// ---------------------------------------------------------------------------

interface DebugEntry {
  readonly ts: string;
  readonly error: string;
  readonly details: Record<string, unknown>;
  readonly input_snapshot: Record<string, unknown>;
}

const DEBUG_RING_SIZE = 20;
const debugErrors: DebugEntry[] = [];

const config = loadNexusCoreConfig();
const transportMode = (process.env.TRANSPORT ?? "stdio") as TransportMode;

// Fail-fast: validate config
const configErrors = validateConfig(config, transportMode);
if (configErrors.length > 0) {
  for (const err of configErrors) {
    console.error(`[NexusCore] Config error: ${err.field} — ${err.message}`);
  }
  process.exit(1);
}

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
  const kvRepo = config.databaseUrl ? new NeonKVRepository() : null;
  watcher = new ChainWatcher(
    config,
    paymentRepo,
    stateMachine,
    groupManager,
    webhookNotifier,
    kvRepo,
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

const NEXUS_CORE_VERSION = "0.4.0";

// Read skill.md from disk (fallback to hardcoded string)
const __dirname = dirname(fileURLToPath(import.meta.url));
let skillMdContent: string;
try {
  skillMdContent = readFileSync(join(__dirname, "..", "skill.md"), "utf-8");
} catch {
  skillMdContent =
    "# Nexus Core\n\nPayment orchestration MCP server. Use nexus_orchestrate_payment tool.";
}

const server = new McpServer({
  name: "nexus-core",
  version: NEXUS_CORE_VERSION,
});

// Tool: nexus_orchestrate_payment
server.tool(
  "nexus_orchestrate_payment",
  "Orchestrate aggregated payment for one or more merchant quotes. Returns a single EIP-3009 signing instruction covering the total amount. Pass quotes as EITHER the quotes array OR a quotes_json string (preferred for CLI compatibility).",
  {
    quotes: z
      .array(z.record(z.unknown()))
      .optional()
      .describe(
        "Array of NexusQuotePayload objects. Optional if quotes_json is provided.",
      ),
    quotes_json: z
      .string()
      .optional()
      .describe(
        'JSON string of the quotes array — use this instead of quotes for better CLI compatibility. Example: \'[{"merchant_did":"...","amount":"...","signature":"..."}]\'',
      ),
    payer_wallet: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .describe("Payer EVM wallet address"),
  },
  async ({ quotes, quotes_json, payer_wallet }) => {
    // Declare outside try so catch block can access for diagnostics
    let rawQuotes: Record<string, unknown>[] = [];
    try {
      // Helper: try parsing a JSON string into an array of quote objects
      function tryParseQuotesJson(
        json: string,
      ): Record<string, unknown>[] | null {
        try {
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && typeof parsed === "object") return [parsed];
        } catch {
          /* not valid JSON */
        }
        return null;
      }

      // Helper: check if a value looks like a real quote object
      function isQuoteObject(v: unknown): boolean {
        return (
          v != null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          typeof (v as Record<string, unknown>).merchant_did === "string"
        );
      }

      // Resolve quotes from either parameter, with smart fallbacks
      if (quotes_json) {
        // Prefer quotes_json when provided — it's the most reliable
        const parsed = tryParseQuotesJson(quotes_json);
        if (parsed) {
          rawQuotes = parsed;
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: quotes_json is not valid JSON",
              },
            ],
            isError: true,
          };
        }
      } else if (quotes && Array.isArray(quotes) && quotes.length > 0) {
        // Check if first element is a real quote object
        if (isQuoteObject(quotes[0])) {
          rawQuotes = quotes;
        } else if (
          typeof quotes[0] === "string" &&
          (quotes[0] as string).startsWith("{")
        ) {
          // MCP client may have split a JSON string into array elements
          const joined = quotes.join("");
          const parsed = tryParseQuotesJson(joined);
          if (parsed) {
            rawQuotes = parsed;
          } else {
            rawQuotes = quotes; // let downstream validation catch it
          }
        } else {
          rawQuotes = quotes; // let downstream validation catch it
        }
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Either quotes or quotes_json must be provided",
            },
          ],
          isError: true,
        };
      }

      const normalized = normalizeQuotes(rawQuotes);
      const result = await orchestrator.orchestratePayment({
        quotes: normalized as NexusQuotePayload[],
        payerWallet: payer_wallet,
      });

      const baseUrl = config.baseUrl || `http://localhost:${config.port}`;
      const checkoutUrl = `${baseUrl}/checkout/${result.group.group_id}`;

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
              `\n\nCheckout URL: ${checkoutUrl}\n` +
              `Direct the user to open this URL in their browser to complete payment with MetaMask.\n\n` +
              `UCP Checkout Response:\n` +
              JSON.stringify(
                {
                  group_id: result.group.group_id,
                  status: result.group.status,
                  checkout_url: checkoutUrl,
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

      // Capture debug info
      const details: Record<string, unknown> =
        err instanceof Error && "details" in err
          ? (err as { details: Record<string, unknown> }).details
          : {};
      const inputSnapshot: Record<string, unknown> = {};
      try {
        const firstQuote = rawQuotes[0];
        inputSnapshot.quote_count = rawQuotes.length;
        inputSnapshot.first_quote_keys = firstQuote
          ? Object.keys(firstQuote)
          : [];
        if (firstQuote) {
          inputSnapshot.merchant_did = (
            firstQuote as Record<string, unknown>
          ).merchant_did;
          inputSnapshot.amount = (firstQuote as Record<string, unknown>).amount;
          inputSnapshot.amount_type = typeof (
            firstQuote as Record<string, unknown>
          ).amount;
          inputSnapshot.chain_id = (
            firstQuote as Record<string, unknown>
          ).chain_id;
          inputSnapshot.chain_id_type = typeof (
            firstQuote as Record<string, unknown>
          ).chain_id;
          inputSnapshot.expiry = (firstQuote as Record<string, unknown>).expiry;
          inputSnapshot.signature_length = String(
            (firstQuote as Record<string, unknown>).signature ?? "",
          ).length;
          const ctx = (firstQuote as Record<string, unknown>).context as
            | Record<string, unknown>
            | undefined;
          if (ctx) {
            inputSnapshot.context_keys = Object.keys(ctx);
            if (Array.isArray(ctx.line_items) && ctx.line_items.length > 0) {
              const li = ctx.line_items[0] as Record<string, unknown>;
              inputSnapshot.line_item_0_amount = li.amount;
              inputSnapshot.line_item_0_amount_type = typeof li.amount;
            }
            inputSnapshot.original_amount = ctx.original_amount;
            inputSnapshot.original_amount_type = typeof ctx.original_amount;
          }
        }
      } catch {
        /* ignore snapshot errors */
      }

      const entry: DebugEntry = {
        ts: new Date().toISOString(),
        error: message,
        details,
        input_snapshot: inputSnapshot,
      };
      debugErrors.push(entry);
      if (debugErrors.length > DEBUG_RING_SIZE) debugErrors.shift();

      serverLog.error("orchestrate failed", {
        error: message,
        ...inputSnapshot,
      });

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

      // Transition to AWAITING_TX (skip if already there)
      if (payment.status !== "AWAITING_TX") {
        await stateMachine.transition({
          nexusPaymentId: payment_id,
          toStatus: "AWAITING_TX",
          eventType: "EIP3009_SIGNATURE_RECEIVED",
          metadata: { group_id, v, r, s },
        });
      }

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

// Tool: nexus_dispute_payment
server.tool(
  "nexus_dispute_payment",
  "Open a dispute for an escrowed payment. Returns calldata for the payer to submit on-chain (only payer can call dispute on the contract).",
  {
    payment_id: z.string().describe("Nexus payment ID (PAY-...)"),
    reason: z
      .string()
      .max(256)
      .describe("Dispute reason (UTF-8, max 256 chars)"),
  },
  async ({ payment_id, reason }) => {
    try {
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

      if (payment.status !== "ESCROWED") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Payment must be ESCROWED to dispute (current: ${payment.status})`,
            },
          ],
          isError: true,
        };
      }

      if (
        payment.dispute_deadline &&
        new Date(payment.dispute_deadline).getTime() < Date.now()
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Dispute window has expired (deadline: ${payment.dispute_deadline})`,
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

      const reasonBytes32 = keccak256(toHex(reason));

      // Optimistic DB transition
      await stateMachine.transition({
        nexusPaymentId: payment_id,
        toStatus: "DISPUTE_OPEN",
        eventType: "DISPUTE_OPENED",
        metadata: { reason, reason_bytes32: reasonBytes32 },
        fields: { dispute_reason: reasonBytes32 },
      });

      // Build calldata for payer to submit
      const calldata = encodeFunctionData({
        abi: NEXUS_PAY_ESCROW_ABI,
        functionName: "dispute",
        args: [payment.payment_id_bytes32 as Hex, reasonBytes32],
      });

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Dispute Recorded\n` +
              `Payment: ${payment_id}\n` +
              `Status: DISPUTE_OPEN\n` +
              `Reason: "${reason}"\n\n` +
              `On-chain submission required:\n` +
              `The payer must submit the following transaction to finalize the dispute on-chain:\n` +
              `Contract: ${config.escrowContract}\n` +
              `Calldata: ${calldata}\n\n` +
              `The ChainWatcher will confirm the dispute once the transaction is mined.`,
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

// Tool: nexus_resolve_dispute
server.tool(
  "nexus_resolve_dispute",
  "Resolve a disputed payment by splitting funds between merchant and payer. Only callable when payment is DISPUTE_OPEN.",
  {
    payment_id: z.string().describe("Nexus payment ID (PAY-...)"),
    merchant_bps: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .describe(
        "Basis points (0-10000) of funds to merchant. 0 = full refund, 10000 = full to merchant.",
      ),
    resolution_reason: z
      .string()
      .optional()
      .describe("Reason for resolution decision"),
  },
  async ({ payment_id, merchant_bps, resolution_reason }) => {
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

      if (payment.status !== "DISPUTE_OPEN") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Payment must be DISPUTE_OPEN to resolve (current: ${payment.status})`,
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

      const result = await relayer.submitResolve(
        payment.payment_id_bytes32 as Hex,
        merchant_bps,
      );

      // ChainWatcher will handle the Resolved event → DISPUTE_RESOLVED
      const totalAmount = BigInt(payment.amount);
      const merchantAmount = (totalAmount * BigInt(merchant_bps)) / 10000n;
      const payerAmount = totalAmount - merchantAmount;
      const decimals = config.usdcDecimals;
      const formatAmount = (raw: bigint): string =>
        (Number(raw) / 10 ** decimals).toFixed(decimals);

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Dispute Resolution Submitted\n` +
              `TX Hash: ${result.txHash}\n` +
              `Block: ${result.blockNumber}\n` +
              `Payment: ${payment_id}\n` +
              `Merchant BPS: ${merchant_bps} (${(merchant_bps / 100).toFixed(2)}%)\n` +
              `Merchant receives: ${formatAmount(merchantAmount)} USDC\n` +
              `Payer receives: ${formatAmount(payerAmount)} USDC` +
              (resolution_reason
                ? `\nResolution reason: ${resolution_reason}`
                : ""),
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

// Tool: nexus_confirm_fulfillment
server.tool(
  "nexus_confirm_fulfillment",
  "Confirm fulfillment of a payment. If ESCROWED, submits release to escrow contract (async — call again after SETTLED). If SETTLED, transitions to COMPLETED. Two-step process: ESCROWED→release→SETTLED, then call again for SETTLED→COMPLETED.",
  {
    payment_id: z.string().describe("Nexus payment ID (PAY-...)"),
    fulfillment_proof: z
      .string()
      .optional()
      .describe("Proof of fulfillment (URL, hash, etc.)"),
  },
  async ({ payment_id, fulfillment_proof }) => {
    try {
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

      if (payment.status === "ESCROWED") {
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

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Release submitted — ChainWatcher will transition to SETTLED\n` +
                `TX Hash: ${result.txHash}\n` +
                `Block: ${result.blockNumber}\n` +
                `Payment: ${payment_id}\n\n` +
                `Call nexus_confirm_fulfillment again after status becomes SETTLED to complete.`,
            },
          ],
        };
      }

      if (payment.status === "SETTLED") {
        const now = new Date().toISOString();

        await stateMachine.transition({
          nexusPaymentId: payment_id,
          toStatus: "COMPLETED",
          eventType: "FULFILLMENT_CONFIRMED",
          metadata: {
            fulfillment_proof: fulfillment_proof ?? null,
          },
          fields: { completed_at: now },
        });

        // Send payment.completed webhook
        webhookNotifier
          .notify(payment, "payment.completed")
          .catch((err) =>
            console.error("[server] webhook notify failed:", err),
          );

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Payment COMPLETED\n` +
                `Payment: ${payment_id}\n` +
                `Completed at: ${now}` +
                (fulfillment_proof
                  ? `\nFulfillment proof: ${fulfillment_proof}`
                  : ""),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Cannot confirm fulfillment — payment status is ${payment.status} (must be ESCROWED or SETTLED)`,
          },
        ],
        isError: true,
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
          res.end(skillMdContent);
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

        // Debug: last orchestration errors
        if (url.pathname === "/api/debug/last-errors" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ errors: debugErrors }, null, 2));
          return;
        }

        // Health check — fast, no I/O (used by Render health check)
        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              version: NEXUS_CORE_VERSION,
              transport: "sse",
            }),
          );
          return;
        }

        // Detailed health — includes relayer balance (async RPC call)
        if (url.pathname === "/api/health") {
          let relayerInfo: Record<string, unknown> | null = null;
          if (relayer) {
            try {
              const address = relayer.getAddress();
              const balance = await relayer.getRelayerBalance();
              relayerInfo = {
                address,
                lat_balance_wei: balance.toString(),
                lat_balance: formatUnits(balance, 18),
                escrow_contract: config.escrowContract,
                chain_id: config.chainId,
                low_balance: balance < 1_000_000_000_000_000n,
              };
            } catch (err) {
              relayerInfo = {
                error: err instanceof Error ? err.message : "RPC call failed",
              };
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              version: NEXUS_CORE_VERSION,
              transport: "sse",
              services: {
                chain_watcher: watcher ? "running" : "disabled",
                timeout_handler: timeoutHandler ? "running" : "disabled",
                webhook_notifier: "running",
              },
              relayer: relayerInfo,
            }),
          );
          return;
        }

        // Checkout routes (before portal, since portal handles /)
        const checkoutDeps: CheckoutDeps = {
          groupRepo,
          paymentRepo,
          stateMachine,
          relayer,
          webhookNotifier,
          config,
        };
        const checkoutHandled = await handleCheckoutRequest(
          checkoutDeps,
          req,
          res,
          url,
        );
        if (checkoutHandled) return;

        // Portal routes
        const portalDeps: PortalDeps = {
          paymentRepo,
          eventRepo,
          relayer,
          escrowContract: config.escrowContract,
          chainId: config.chainId,
          version: NEXUS_CORE_VERSION,
          portalToken: config.portalToken,
        };
        const handled = await handlePortalRequest(portalDeps, req, res, url);
        if (handled) return;

        res.writeHead(404);
        res.end("Not found");
      },
    );

    httpServer.listen(config.port, () => {
      serverLog.info("SSE server listening", { port: config.port });

      // Start background services AFTER HTTP is listening (so health check passes)
      if (watcher) {
        watcher.start().catch((err) =>
          serverLog.error("ChainWatcher start failed", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      if (timeoutHandler) timeoutHandler.start();
      webhookNotifier.startRetryLoop(config.webhookRetryIntervalMs);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    serverLog.info("Connected via stdio transport");
  }
}

main().catch((err) => {
  serverLog.error("Fatal error", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
