import type { WebhookRepository } from "../../db/interfaces/webhook-repo.js";
import type {
  WebhookDeliveryLog,
  WebhookEventType,
  CreateWebhookLogParams,
} from "../../types.js";
import { WEBHOOK_MAX_ATTEMPTS } from "../../constants.js";

export class MockWebhookRepository implements WebhookRepository {
  private readonly store = new Map<string, WebhookDeliveryLog>();

  clear(): void {
    this.store.clear();
  }

  async insert(params: CreateWebhookLogParams): Promise<WebhookDeliveryLog> {
    const log: WebhookDeliveryLog = {
      log_id: params.log_id,
      nexus_payment_id: params.nexus_payment_id,
      merchant_did: params.merchant_did,
      webhook_url: params.webhook_url,
      event_type: params.event_type as WebhookEventType,
      request_body: params.request_body,
      response_status: null,
      response_body: null,
      attempt_number: 1,
      next_retry_at: null,
      delivered_at: null,
      created_at: new Date().toISOString(),
    };
    this.store.set(params.log_id, log);
    return log;
  }

  async markDelivered(
    logId: string,
    responseStatus: number,
    responseBody: string,
  ): Promise<WebhookDeliveryLog | null> {
    const existing = this.store.get(logId);
    if (!existing) return null;

    const updated: WebhookDeliveryLog = {
      ...existing,
      response_status: responseStatus,
      response_body: responseBody,
      delivered_at: new Date().toISOString(),
      next_retry_at: null,
    };
    this.store.set(logId, updated);
    return updated;
  }

  async markFailed(
    logId: string,
    responseStatus: number | null,
    responseBody: string | null,
    nextRetryAt: string | null,
  ): Promise<WebhookDeliveryLog | null> {
    const existing = this.store.get(logId);
    if (!existing) return null;

    const updated: WebhookDeliveryLog = {
      ...existing,
      response_status: responseStatus,
      response_body: responseBody,
      attempt_number: existing.attempt_number + 1,
      next_retry_at: nextRetryAt,
    };
    this.store.set(logId, updated);
    return updated;
  }

  async findPendingRetries(now: string): Promise<readonly WebhookDeliveryLog[]> {
    const cutoff = new Date(now).getTime();
    const results: WebhookDeliveryLog[] = [];
    for (const log of this.store.values()) {
      if (
        log.delivered_at === null &&
        log.next_retry_at !== null &&
        new Date(log.next_retry_at).getTime() <= cutoff &&
        log.attempt_number < WEBHOOK_MAX_ATTEMPTS
      ) {
        results.push(log);
      }
    }
    return results.sort(
      (a, b) =>
        new Date(a.next_retry_at!).getTime() - new Date(b.next_retry_at!).getTime(),
    );
  }
}
