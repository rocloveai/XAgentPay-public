/**
 * xNexus Core — Stateless REST API routes.
 *
 * Pure HTTP endpoints for LLM tools that cannot use MCP SSE transport.
 * All endpoints are stateless — no session or cookie required.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NexusOrchestrator } from "./services/orchestrator.js";
import type { MerchantRepository } from "./db/interfaces/merchant-repo.js";
import type { PaymentRepository } from "./db/interfaces/payment-repo.js";
import type { StarRepository } from "./db/interfaces/star-repo.js";
import type { KVRepository } from "./db/interfaces/kv-repo.js";
import type { MerchantRecord, Hex } from "./types.js";
import type { NexusRelayer } from "./services/relayer.js";
import { createLogger } from "./logger.js";
import { keccak256, toHex } from "viem";

const log = createLogger("REST-API");

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface RestApiDeps {
  readonly orchestrator: NexusOrchestrator;
  readonly merchantRepo: MerchantRepository;
  readonly paymentRepo: PaymentRepository;
  readonly starRepo: StarRepository;
  readonly kvRepo: KVRepository | null;
  readonly portalToken: string;
  readonly relayer: NexusRelayer | null;
}

// ---------------------------------------------------------------------------
// IP Rate Limiter (Token Bucket, in-memory fallback)
// ---------------------------------------------------------------------------

interface RateBucket {
  tokens: number;
  lastRefill: number;
}

const RATE_BUCKETS = new Map<string, RateBucket>();
const RATE_CAPACITY = 30; // max burst
const RATE_REFILL_PER_SEC = 0.5; // 30 req/min
const RATE_CLEANUP_INTERVAL = 60_000;

// Periodic cleanup of stale buckets (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of RATE_BUCKETS) {
    if (now - bucket.lastRefill > 300_000) {
      RATE_BUCKETS.delete(key);
    }
  }
}, RATE_CLEANUP_INTERVAL).unref();

function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  let bucket = RATE_BUCKETS.get(ip);

  if (!bucket) {
    bucket = { tokens: RATE_CAPACITY - 1, lastRefill: now };
    RATE_BUCKETS.set(ip, bucket);
    return { allowed: true, remaining: bucket.tokens, resetMs: now + 60_000 };
  }

  // Refill tokens
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  const refilled = Math.min(
    RATE_CAPACITY,
    bucket.tokens + elapsedSec * RATE_REFILL_PER_SEC,
  );

  if (refilled >= 1) {
    const updated = { tokens: refilled - 1, lastRefill: now };
    RATE_BUCKETS.set(ip, updated);
    return {
      allowed: true,
      remaining: Math.floor(updated.tokens),
      resetMs: now + 60_000,
    };
  }

  return { allowed: false, remaining: 0, resetMs: now + 60_000 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  const envelope = Array.isArray(body)
    ? { http_status: status, data: body }
    : { http_status: status, ...(body as object) };
  res.end(JSON.stringify(envelope, null, 2));
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function addRateLimitHeaders(
  res: ServerResponse,
  remaining: number,
  resetMs: number,
): void {
  res.setHeader("X-RateLimit-Limit", String(RATE_CAPACITY));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.floor(resetMs / 1000)));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handle stateless REST API requests.
 * Returns true if the request was handled, false otherwise.
 */
export async function handleRestApiRequest(
  deps: RestApiDeps,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  // Portal dashboard requests carry a Bearer token — let portal handler
  // handle /api/payments and /api/payments/:id to avoid route conflict.
  if (deps.portalToken && url.pathname.startsWith("/api/payments")) {
    const auth = req.headers.authorization ?? "";
    if (auth === `Bearer ${deps.portalToken}`) {
      return false; // skip — portal handler will serve this
    }
  }

  // CORS preflight for all /api/ routes
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return true;
  }

  // Rate limit check (applies to all REST API endpoints below)
  const ip = getClientIp(req);
  const rateResult = checkRateLimit(ip);
  addRateLimitHeaders(res, rateResult.remaining, rateResult.resetMs);

  if (!rateResult.allowed) {
    jsonResponse(res, 429, {
      error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" },
    });
    return true;
  }

  // --- GET /api/payments/:id ---
  const paymentByIdMatch = url.pathname.match(
    /^\/api\/payments\/(PAY-[A-Za-z0-9_-]+)$/,
  );
  if (paymentByIdMatch && req.method === "GET") {
    return handlePaymentStatus(deps, res, {
      nexusPaymentId: paymentByIdMatch[1],
    });
  }

  // --- GET /api/payments?group_id=...&merchant_order_ref=...&nexus_payment_id=... ---
  if (url.pathname === "/api/payments" && req.method === "GET") {
    const groupId = url.searchParams.get("group_id") ?? undefined;
    const orderRef = url.searchParams.get("merchant_order_ref") ?? undefined;
    const paymentId = url.searchParams.get("nexus_payment_id") ?? undefined;

    if (!groupId && !orderRef && !paymentId) {
      jsonResponse(res, 400, {
        error: {
          code: "MISSING_PARAMS",
          message:
            "Provide at least one of: group_id, merchant_order_ref, nexus_payment_id",
        },
      });
      return true;
    }

    return handlePaymentStatus(deps, res, {
      nexusPaymentId: paymentId,
      merchantOrderRef: orderRef,
      groupId,
    });
  }

  // --- GET /api/agents ---
  if (url.pathname === "/api/agents" && req.method === "GET") {
    return handleAgentDiscovery(deps, res, {
      query: url.searchParams.get("query") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      limit: url.searchParams.has("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
    });
  }

  // --- GET /api/agents/:did/skill ---
  // DID format: did:nexus:20250407:demo_flight (contains colons)
  const agentSkillMatch = url.pathname.match(
    /^\/api\/agents\/(did:nexus:[^/]+)\/skill$/,
  );
  if (agentSkillMatch && req.method === "GET") {
    return handleAgentSkill(deps, res, agentSkillMatch[1]);
  }

  // --- GET /api/merchant/payments?merchant_did=...&since=...&status=...&group_id=... ---
  if (url.pathname === "/api/merchant/payments" && req.method === "GET") {
    return handleMerchantPayments(deps, res, url);
  }

  // --- POST /api/acp/submit-deliverable ---
  if (
    url.pathname === "/api/acp/submit-deliverable" &&
    req.method === "POST"
  ) {
    return handleACPSubmitDeliverable(deps, req, res);
  }

  return false;
}

// ---------------------------------------------------------------------------
// GET /api/payments — Payment Status
// ---------------------------------------------------------------------------

async function handlePaymentStatus(
  deps: RestApiDeps,
  res: ServerResponse,
  params: {
    nexusPaymentId?: string;
    merchantOrderRef?: string;
    groupId?: string;
  },
): Promise<true> {
  try {
    const result = await deps.orchestrator.getPaymentStatus({
      nexusPaymentId: params.nexusPaymentId,
      merchantOrderRef: params.merchantOrderRef,
      groupId: params.groupId,
    });

    if (!result.payment && !result.group) {
      jsonResponse(res, 404, {
        error: { code: "NOT_FOUND", message: "Payment or group not found" },
      });
      return true;
    }

    // Build safe response (exclude sensitive fields like quote_payload, iso_metadata)
    const payment = result.payment
      ? {
          nexus_payment_id: result.payment.nexus_payment_id,
          group_id: result.payment.group_id,
          status: result.payment.status,
          amount: result.payment.amount,
          amount_display: result.payment.amount_display,
          currency: result.payment.currency,
          chain_id: result.payment.chain_id,
          merchant_did: result.payment.merchant_did,
          merchant_order_ref: result.payment.merchant_order_ref,
          tx_hash: result.payment.tx_hash,
          block_number: result.payment.block_number,
          payment_id_bytes32: result.payment.payment_id_bytes32,
          created_at: result.payment.created_at,
          escrowed_at: result.payment.settled_at
            ? undefined
            : result.payment.updated_at,
          settled_at: result.payment.settled_at,
          completed_at: result.payment.completed_at,
        }
      : null;

    const group = result.group
      ? {
          group_id: result.group.group_id,
          status: result.group.status,
          total_amount: result.group.total_amount,
          total_amount_display: result.group.total_amount_display,
          currency: result.group.currency,
          chain_id: result.group.chain_id,
          payment_count: result.group.payment_count,
          tx_hash: result.group.tx_hash,
          created_at: result.group.created_at,
        }
      : null;

    const groupPayments = result.groupPayments.map((p) => ({
      nexus_payment_id: p.nexus_payment_id,
      status: p.status,
      amount_display: p.amount_display,
      currency: p.currency,
      merchant_did: p.merchant_did,
      merchant_order_ref: p.merchant_order_ref,
    }));

    jsonResponse(res, 200, { payment, group, group_payments: groupPayments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("GET /api/payments error", { error: message });
    jsonResponse(res, 500, {
      error: { code: "INTERNAL_ERROR", message },
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/agents — Agent Discovery
// ---------------------------------------------------------------------------

interface AgentJSON {
  readonly merchant_did: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly mcp_endpoint: string | null;
  readonly skill_md_url: string | null;
  readonly skill_user_url: string | null;
  readonly currencies: readonly string[];
  readonly health_status: string;
  readonly stars: number;
  readonly tools: readonly { name: string; role: string }[];
}

async function handleAgentDiscovery(
  deps: RestApiDeps,
  res: ServerResponse,
  params: { query?: string; category?: string; limit?: number },
): Promise<true> {
  try {
    const merchants = await deps.merchantRepo.listForMarket({
      category: params.category,
    });

    const dids = merchants.map((m) => m.merchant_did);
    const starCounts = await deps.starRepo.getStarCounts(dids);

    // Text filter
    let filtered: readonly MerchantRecord[] = merchants;
    if (params.query) {
      const q = params.query.toLowerCase();
      filtered = merchants.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          (m.skill_name?.toLowerCase().includes(q) ?? false),
      );
    }

    // Sort: stars DESC → ONLINE first → name ASC
    const sorted = [...filtered].sort((a, b) => {
      const starsA = starCounts.get(a.merchant_did) ?? 0;
      const starsB = starCounts.get(b.merchant_did) ?? 0;
      if (starsB !== starsA) return starsB - starsA;
      const onlineA = a.health_status === "ONLINE" ? 0 : 1;
      const onlineB = b.health_status === "ONLINE" ? 0 : 1;
      if (onlineA !== onlineB) return onlineA - onlineB;
      return a.name.localeCompare(b.name);
    });

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const results = sorted.slice(0, limit);

    const agents: AgentJSON[] = results.map((m) => ({
      merchant_did: m.merchant_did,
      name: m.name,
      description: m.description,
      category: m.category,
      mcp_endpoint: m.mcp_endpoint,
      skill_md_url: m.skill_md_url,
      skill_user_url: m.skill_user_url,
      currencies: m.currencies,
      health_status: m.health_status,
      stars: starCounts.get(m.merchant_did) ?? 0,
      tools: m.skill_tools,
    }));

    jsonResponse(res, 200, {
      agents,
      total: agents.length,
      limit,
      offset: 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("GET /api/agents error", { error: message });
    jsonResponse(res, 500, {
      error: { code: "INTERNAL_ERROR", message },
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/agents/:did/skill — Agent Skill
// ---------------------------------------------------------------------------

async function handleAgentSkill(
  deps: RestApiDeps,
  res: ServerResponse,
  merchantDid: string,
): Promise<true> {
  try {
    const merchant = await deps.merchantRepo.findByDid(merchantDid);
    if (!merchant) {
      jsonResponse(res, 404, {
        error: {
          code: "AGENT_NOT_FOUND",
          message: `Agent not found: ${merchantDid}`,
        },
      });
      return true;
    }

    if (!merchant.skill_md_url) {
      jsonResponse(res, 404, {
        error: {
          code: "NO_SKILL",
          message: `Agent ${merchantDid} has no skill.md configured`,
        },
      });
      return true;
    }

    const response = await fetch(merchant.skill_md_url, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      jsonResponse(res, 502, {
        error: {
          code: "SKILL_FETCH_FAILED",
          message: `Failed to fetch skill.md: HTTP ${response.status}`,
        },
      });
      return true;
    }

    const skillContent = await response.text();

    // Return as markdown with proper content type
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      ...CORS_HEADERS,
    });
    res.end(skillContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("GET /api/agents/:did/skill error", { error: message });
    jsonResponse(res, 500, {
      error: { code: "INTERNAL_ERROR", message },
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/merchant/payments — Merchant Payment Query (reconciliation + group sub-orders)
// ---------------------------------------------------------------------------

function parseSinceDuration(raw: string): string | null {
  const match = raw.match(/^(\d+)(h|m|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms =
    unit === "h"
      ? value * 3_600_000
      : unit === "m"
        ? value * 60_000
        : value * 86_400_000;
  return new Date(Date.now() - ms).toISOString();
}

async function handleMerchantPayments(
  deps: RestApiDeps,
  res: ServerResponse,
  url: URL,
): Promise<true> {
  try {
    const merchantDid = url.searchParams.get("merchant_did");
    if (!merchantDid) {
      jsonResponse(res, 400, {
        error: {
          code: "MISSING_PARAMS",
          message: "merchant_did is required",
        },
      });
      return true;
    }

    // Verify merchant exists
    const merchant = await deps.merchantRepo.findByDid(merchantDid);
    if (!merchant) {
      jsonResponse(res, 404, {
        error: { code: "MERCHANT_NOT_FOUND", message: "Merchant not found" },
      });
      return true;
    }

    // Parse optional filters
    const sinceRaw = url.searchParams.get("since");
    const since = sinceRaw
      ? (parseSinceDuration(sinceRaw) ?? sinceRaw) // try duration (4h), fallback to ISO
      : undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const groupId = url.searchParams.get("group_id") ?? undefined;
    const limit = url.searchParams.has("limit")
      ? Math.min(Math.max(Number(url.searchParams.get("limit")), 1), 200)
      : 100;

    // If group_id is provided, query group sub-orders directly
    if (groupId) {
      const groupPayments = await deps.paymentRepo.findByGroupId(groupId);
      // Filter to only this merchant's payments in the group
      const filtered = groupPayments.filter(
        (p) => p.merchant_did === merchantDid,
      );
      jsonResponse(res, 200, {
        merchant_did: merchantDid,
        group_id: groupId,
        payments: filtered.map(toPaymentSummary),
        total: filtered.length,
      });
      return true;
    }

    // General merchant payment query
    const payments = await deps.paymentRepo.findByMerchant({
      merchantDid,
      since,
      status: status as import("./types.js").PaymentStatus | undefined,
      limit,
    });

    jsonResponse(res, 200, {
      merchant_did: merchantDid,
      payments: payments.map(toPaymentSummary),
      total: payments.length,
      since: since ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("GET /api/merchant/payments error", { error: message });
    jsonResponse(res, 500, {
      error: { code: "INTERNAL_ERROR", message },
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/acp/submit-deliverable — ACP Deliverable Submission
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function handleACPSubmitDeliverable(
  deps: RestApiDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<true> {
  try {
    if (!deps.relayer) {
      jsonResponse(res, 503, {
        error: {
          code: "RELAYER_NOT_CONFIGURED",
          message: "Relayer is not available (RELAYER_PRIVATE_KEY missing)",
        },
      });
      return true;
    }

    let body: {
      nexus_payment_id?: string;
      merchant_did?: string;
      deliverable?: string;
    };
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      jsonResponse(res, 400, {
        error: { code: "INVALID_JSON", message: "Invalid JSON body" },
      });
      return true;
    }

    const { nexus_payment_id, merchant_did, deliverable } = body;

    if (!nexus_payment_id || !merchant_did || !deliverable) {
      jsonResponse(res, 400, {
        error: {
          code: "MISSING_PARAMS",
          message:
            "Required fields: nexus_payment_id, merchant_did, deliverable",
        },
      });
      return true;
    }

    // Find the payment
    const payment = await deps.paymentRepo.findById(nexus_payment_id);
    if (!payment) {
      jsonResponse(res, 404, {
        error: { code: "PAYMENT_NOT_FOUND", message: "Payment not found" },
      });
      return true;
    }

    // Verify merchant_did matches
    if (payment.merchant_did !== merchant_did) {
      jsonResponse(res, 403, {
        error: {
          code: "MERCHANT_MISMATCH",
          message: "merchant_did does not match payment",
        },
      });
      return true;
    }

    // Verify payment is in JOB_FUNDED status
    if (payment.status !== "JOB_FUNDED") {
      jsonResponse(res, 409, {
        error: {
          code: "INVALID_STATUS",
          message: `Payment status is ${payment.status}, expected JOB_FUNDED`,
        },
      });
      return true;
    }

    // Get acp_job_id from payment record
    const acpJobId = payment.acp_job_id;
    if (!acpJobId) {
      jsonResponse(res, 400, {
        error: {
          code: "NO_ACP_JOB",
          message: "Payment has no associated ACP job ID",
        },
      });
      return true;
    }

    // Hash the deliverable string to bytes32
    const deliverableHash = keccak256(toHex(deliverable)) as Hex;

    // Store deliverable on payment record
    await deps.paymentRepo.updateStatus(nexus_payment_id, "JOB_FUNDED", {
      acp_deliverable: deliverable,
    });

    // Call relayer to submit on-chain
    const result = await deps.relayer.submitACPSubmit(
      BigInt(acpJobId),
      deliverableHash,
    );

    // Update submit tx hash
    await deps.paymentRepo.updateStatus(nexus_payment_id, "JOB_FUNDED", {
      acp_submit_tx_hash: result.txHash,
    });

    log.info("ACP deliverable submitted", {
      nexus_payment_id,
      acp_job_id: acpJobId,
      tx_hash: result.txHash,
    });

    jsonResponse(res, 200, {
      nexus_payment_id,
      acp_job_id: acpJobId,
      deliverable_hash: deliverableHash,
      tx_hash: result.txHash,
      block_number: result.blockNumber.toString(),
      status: "submitted",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log.error("POST /api/acp/submit-deliverable error", { error: message });
    jsonResponse(res, 500, {
      error: { code: "INTERNAL_ERROR", message },
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Payment summary helper
// ---------------------------------------------------------------------------

function toPaymentSummary(p: import("./types.js").PaymentRecord) {
  return {
    nexus_payment_id: p.nexus_payment_id,
    group_id: p.group_id,
    merchant_order_ref: p.merchant_order_ref,
    status: p.status,
    amount: p.amount,
    amount_display: p.amount_display,
    currency: p.currency,
    chain_id: p.chain_id,
    payer_wallet: p.payer_wallet,
    tx_hash: p.tx_hash,
    deposit_tx_hash: p.deposit_tx_hash,
    release_tx_hash: p.release_tx_hash,
    settled_at: p.settled_at,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}
