/**
 * XAgent Core — Webhook Notifier.
 *
 * Sends HMAC-SHA256 signed webhook notifications to merchants on
 * payment state changes. Implements exponential backoff retry.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { WebhookRepository } from "../db/interfaces/webhook-repo.js";
import type { MerchantRepository } from "../db/interfaces/merchant-repo.js";
import type {
  PaymentRecord,
  WebhookEventType,
  WebhookPayload,
  MerchantRecord,
} from "../types.js";
import { WEBHOOK_MAX_ATTEMPTS, WEBHOOK_RETRY_DELAYS_MS } from "../constants.js";

// ---------------------------------------------------------------------------
// WebhookNotifier
// ---------------------------------------------------------------------------

export class WebhookNotifier {
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly merchantRepo: MerchantRepository,
  ) {}

  async notify(
    payment: PaymentRecord,
    eventType: WebhookEventType,
  ): Promise<void> {
    const merchant = await this.merchantRepo.findByDid(payment.merchant_did);
    if (!merchant?.webhook_url) return;

    const payload = buildPayload(payment, eventType);
    const logId = `WH-${randomUUID()}`;

    const log = await this.webhookRepo.insert({
      log_id: logId,
      xagent_payment_id: payment.xagent_payment_id,
      merchant_did: payment.merchant_did,
      webhook_url: merchant.webhook_url,
      event_type: eventType,
      request_body: payload as unknown as Record<string, unknown>,
    });

    await this.deliver(log.log_id, log.attempt_number, merchant, payload);
  }

  async retrySweep(): Promise<void> {
    const now = new Date().toISOString();
    const pending = await this.webhookRepo.findPendingRetries(now);

    for (const log of pending) {
      const merchant = await this.merchantRepo.findByDid(log.merchant_did);
      if (!merchant?.webhook_url) continue;

      const payload = log.request_body as unknown as WebhookPayload;
      await this.deliver(log.log_id, log.attempt_number, merchant, payload);
    }
  }

  startRetryLoop(intervalMs: number): void {
    if (this.retryTimer) return;
    console.error(
      `[WebhookNotifier] Starting retry loop (interval=${intervalMs}ms)`,
    );
    this.retryTimer = setInterval(() => {
      this.retrySweep().catch((err) =>
        console.error("[WebhookNotifier] retry sweep error:", err),
      );
    }, intervalMs);
  }

  stopRetryLoop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async deliver(
    logId: string,
    attemptNumber: number,
    merchant: MerchantRecord,
    payload: WebhookPayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (merchant.webhook_secret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac("sha256", merchant.webhook_secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
      headers["X-XAgent-Timestamp"] = timestamp;
      headers["X-XAgent-Signature"] = `sha256=${signature}`;
    }

    try {
      const response = await fetch(merchant.webhook_url!, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const responseBody = await response.text().catch(() => "");

      if (response.ok) {
        await this.webhookRepo.markDelivered(
          logId,
          response.status,
          responseBody,
        );
      } else {
        await this.scheduleRetry(
          logId,
          attemptNumber,
          response.status,
          responseBody,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.scheduleRetry(logId, attemptNumber, null, message);
    }
  }

  private async scheduleRetry(
    logId: string,
    attemptNumber: number,
    responseStatus: number | null,
    responseBody: string | null,
  ): Promise<void> {
    const retryIndex = Math.min(
      attemptNumber - 1,
      WEBHOOK_RETRY_DELAYS_MS.length - 1,
    );

    let nextRetryAt: string | null = null;
    if (attemptNumber < WEBHOOK_MAX_ATTEMPTS) {
      nextRetryAt = new Date(
        Date.now() + WEBHOOK_RETRY_DELAYS_MS[retryIndex],
      ).toISOString();
    }

    await this.webhookRepo.markFailed(
      logId,
      responseStatus,
      responseBody,
      nextRetryAt,
    );
  }
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

function buildPayload(
  payment: PaymentRecord,
  eventType: WebhookEventType,
): WebhookPayload {
  const settlement =
    payment.tx_hash && payment.block_number != null
      ? {
          tx_hash: payment.tx_hash,
          block_number: payment.block_number,
          block_timestamp: payment.block_timestamp ?? new Date().toISOString(),
          payment_address: payment.payment_address,
        }
      : undefined;

  return {
    event_id: `WHEVT-${randomUUID()}`,
    event_type: eventType,
    created_at: new Date().toISOString(),
    data: {
      xagent_payment_id: payment.xagent_payment_id,
      merchant_order_ref: payment.merchant_order_ref,
      merchant_did: payment.merchant_did,
      status: payment.status,
      amount: payment.amount,
      amount_display: payment.amount_display,
      currency: payment.currency,
      chain_id: payment.chain_id,
      payer_wallet: payment.payer_wallet ?? "",
      settlement,
      iso_metadata: payment.iso_metadata ?? undefined,
    },
  };
}
