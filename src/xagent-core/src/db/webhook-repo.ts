import { getPool } from "./pool.js";
import type { WebhookRepository } from "./interfaces/webhook-repo.js";
import type {
  WebhookDeliveryLog,
  WebhookEventType,
  CreateWebhookLogParams,
} from "../types.js";
import { WEBHOOK_MAX_ATTEMPTS } from "../constants.js";

function rowToLog(row: Record<string, unknown>): WebhookDeliveryLog {
  return {
    log_id: row.log_id as string,
    xagent_payment_id: row.nexus_payment_id as string,
    merchant_did: row.merchant_did as string,
    webhook_url: row.webhook_url as string,
    event_type: row.event_type as WebhookEventType,
    request_body: (row.request_body as Record<string, unknown>) ?? {},
    response_status: row.response_status != null ? Number(row.response_status) : null,
    response_body: (row.response_body as string) ?? null,
    attempt_number: Number(row.attempt_number),
    next_retry_at: row.next_retry_at != null ? String(row.next_retry_at) : null,
    delivered_at: row.delivered_at != null ? String(row.delivered_at) : null,
    created_at: String(row.created_at),
  };
}

export class NeonWebhookRepository implements WebhookRepository {
  async insert(params: CreateWebhookLogParams): Promise<WebhookDeliveryLog> {
    const sql = getPool();
    const rows = await sql(
      `INSERT INTO webhook_delivery_logs (
        log_id, nexus_payment_id, merchant_did,
        webhook_url, event_type, request_body
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *`,
      [
        params.log_id,
        params.xagent_payment_id,
        params.merchant_did,
        params.webhook_url,
        params.event_type,
        JSON.stringify(params.request_body),
      ],
    );
    return rowToLog(rows[0]);
  }

  async markDelivered(
    logId: string,
    responseStatus: number,
    responseBody: string,
  ): Promise<WebhookDeliveryLog | null> {
    const sql = getPool();
    const now = new Date().toISOString();
    const rows = await sql(
      `UPDATE webhook_delivery_logs
       SET response_status = $1,
           response_body = $2,
           delivered_at = $3::timestamptz,
           next_retry_at = NULL
       WHERE log_id = $4
       RETURNING *`,
      [responseStatus, responseBody, now, logId],
    );
    return rows.length > 0 ? rowToLog(rows[0]) : null;
  }

  async markFailed(
    logId: string,
    responseStatus: number | null,
    responseBody: string | null,
    nextRetryAt: string | null,
  ): Promise<WebhookDeliveryLog | null> {
    const sql = getPool();
    const rows = await sql(
      `UPDATE webhook_delivery_logs
       SET response_status = $1,
           response_body = $2,
           attempt_number = attempt_number + 1,
           next_retry_at = $3::timestamptz
       WHERE log_id = $4
       RETURNING *`,
      [responseStatus, responseBody, nextRetryAt, logId],
    );
    return rows.length > 0 ? rowToLog(rows[0]) : null;
  }

  async findPendingRetries(now: string): Promise<readonly WebhookDeliveryLog[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM webhook_delivery_logs
       WHERE delivered_at IS NULL
         AND next_retry_at IS NOT NULL
         AND next_retry_at <= $1::timestamptz
         AND attempt_number < $2
       ORDER BY next_retry_at ASC`,
      [now, WEBHOOK_MAX_ATTEMPTS],
    );
    return rows.map(rowToLog);
  }
}
