import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookPayload, WebhookEventType } from "../types.js";
import { updateStatus } from "./order-store.js";

// ---------------------------------------------------------------------------
// Settlement request — fire-and-forget call to nexus-core
// ---------------------------------------------------------------------------

export async function requestSettlement(
  nexusCoreUrl: string,
  nexusPaymentId: string,
  merchantDid: string,
): Promise<void> {
  const url = `${nexusCoreUrl}/api/merchant/confirm-fulfillment`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nexus_payment_id: nexusPaymentId,
        merchant_did: merchantDid,
      }),
      signal: controller.signal,
    });

    const body = await resp.text();
    console.error(`[Settlement] ${nexusPaymentId}: ${resp.status} ${body}`);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// ACP deliverable submission — fire-and-forget call to nexus-core
// ---------------------------------------------------------------------------

export async function submitDeliverable(
  nexusCoreUrl: string,
  nexusPaymentId: string,
  merchantDid: string,
  deliverable: string,
): Promise<void> {
  const url = `${nexusCoreUrl}/api/acp/submit-deliverable`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nexus_payment_id: nexusPaymentId,
        merchant_did: merchantDid,
        deliverable,
      }),
      signal: controller.signal,
    });

    const body = await resp.text();
    console.error(`[ACP Deliverable] ${nexusPaymentId}: ${resp.status} ${body}`);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum age of a webhook timestamp before it's rejected (5 minutes) */
const MAX_TIMESTAMP_DRIFT_S = 300;

/** In-memory idempotency map — prevents duplicate event processing (with TTL) */
const processedEvents = new Map<string, number>();
const EVENT_TTL_MS = 3_600_000; // 1 hour

function pruneProcessedEvents(): void {
  const now = Date.now();
  for (const [id, ts] of processedEvents) {
    if (now - ts > EVENT_TTL_MS) processedEvents.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

export interface VerifyResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
): VerifyResult {
  if (!signatureHeader || !timestampHeader) {
    return { valid: false, reason: "Missing signature or timestamp header" };
  }

  // Validate timestamp freshness
  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    return { valid: false, reason: "Invalid timestamp" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_TIMESTAMP_DRIFT_S) {
    return { valid: false, reason: "Timestamp outside allowed window" };
  }

  // Verify HMAC-SHA256
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const providedHex = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(providedHex, "hex");

  if (expectedBuf.length !== providedBuf.length) {
    return { valid: false, reason: "Signature mismatch" };
  }

  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    return { valid: false, reason: "Signature mismatch" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

/** Maps webhook event types to local order status changes */
const STATUS_MAP: Partial<Record<WebhookEventType, "PAID" | "EXPIRED">> = {
  "payment.escrowed": "PAID",
  "payment.settled": "PAID",
  "payment.expired": "EXPIRED",
  // ACP (ERC-8183) events
  "payment.job_funded": "PAID",
  "payment.job_completed": "PAID",
};

export interface WebhookHandleResult {
  readonly accepted: boolean;
  readonly action: string;
}

export interface SettlementConfig {
  readonly nexusCoreUrl: string;
  readonly merchantDid: string;
}

export async function handleWebhookEvent(
  payload: WebhookPayload,
  settlementConfig?: SettlementConfig,
): Promise<WebhookHandleResult> {
  const { event_id, event_type, data } = payload;

  // Prune expired entries to prevent unbounded growth
  pruneProcessedEvents();

  // Idempotency check
  if (processedEvents.has(event_id)) {
    return { accepted: true, action: "duplicate_ignored" };
  }

  const newStatus = STATUS_MAP[event_type];

  if (newStatus) {
    const updated = await updateStatus(data.merchant_order_ref, newStatus);
    processedEvents.set(event_id, Date.now());

    if (updated) {
      console.error(
        `[Webhook] ${event_type}: order ${data.merchant_order_ref} → ${newStatus}`,
      );

      // Fire-and-forget: request escrow release after marking PAID
      if (event_type === "payment.escrowed" && settlementConfig) {
        requestSettlement(
          settlementConfig.nexusCoreUrl,
          data.nexus_payment_id,
          settlementConfig.merchantDid,
        ).catch((err) =>
          console.error("[Webhook] Settlement request failed:", err),
        );
      }

      // ACP: submit deliverable when job is funded
      if (event_type === "payment.job_funded" && settlementConfig) {
        const deliverable = JSON.stringify({
          type: "hotel_reservation",
          order_ref: data.merchant_order_ref,
          confirmation: `CONF-${data.merchant_order_ref.slice(0, 8).toUpperCase()}`,
          timestamp: new Date().toISOString(),
        });
        submitDeliverable(
          settlementConfig.nexusCoreUrl,
          data.nexus_payment_id,
          settlementConfig.merchantDid,
          deliverable,
        ).catch((err) =>
          console.error("[Webhook] ACP deliverable submission failed:", err),
        );
      }

      return { accepted: true, action: `status_updated_to_${newStatus}` };
    }

    console.error(
      `[Webhook] ${event_type}: order ${data.merchant_order_ref} not found`,
    );
    return { accepted: true, action: "order_not_found" };
  }

  // Acknowledge other events without state change
  processedEvents.set(event_id, Date.now());
  console.error(`[Webhook] ${event_type}: acknowledged (no status change)`);
  return { accepted: true, action: "acknowledged" };
}
