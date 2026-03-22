import type {
  WebhookDeliveryLog,
  CreateWebhookLogParams,
} from "../../types.js";

export interface WebhookRepository {
  /** Insert a new webhook delivery log. */
  insert(params: CreateWebhookLogParams): Promise<WebhookDeliveryLog>;

  /** Mark a delivery as successfully delivered. */
  markDelivered(
    logId: string,
    responseStatus: number,
    responseBody: string,
  ): Promise<WebhookDeliveryLog | null>;

  /** Mark a delivery as failed, schedule next retry. */
  markFailed(
    logId: string,
    responseStatus: number | null,
    responseBody: string | null,
    nextRetryAt: string | null,
  ): Promise<WebhookDeliveryLog | null>;

  /** Find logs pending retry (next_retry_at <= now, not delivered, under max attempts). */
  findPendingRetries(now: string): Promise<readonly WebhookDeliveryLog[]>;
}
