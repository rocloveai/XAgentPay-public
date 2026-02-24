import { getPool } from "./pool.js";
import type { EventRepository } from "./interfaces/event-repo.js";
import type {
  PaymentEvent,
  PaymentEventType,
  PaymentStatus,
  CreateEventParams,
} from "../types.js";

function rowToEvent(row: Record<string, unknown>): PaymentEvent {
  return {
    event_id: row.event_id as string,
    nexus_payment_id: row.nexus_payment_id as string,
    event_type: row.event_type as PaymentEventType,
    from_status: (row.from_status as PaymentStatus) ?? null,
    to_status: row.to_status as PaymentStatus,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: String(row.created_at),
  };
}

export class NeonEventRepository implements EventRepository {
  async append(params: CreateEventParams): Promise<PaymentEvent> {
    const sql = getPool();
    const rows = await sql(
      `INSERT INTO payment_events (
        event_id, nexus_payment_id, event_type,
        from_status, to_status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *`,
      [
        params.event_id,
        params.nexus_payment_id,
        params.event_type,
        params.from_status,
        params.to_status,
        JSON.stringify(params.metadata),
      ],
    );
    return rowToEvent(rows[0]);
  }

  async findByPaymentId(nexusPaymentId: string): Promise<readonly PaymentEvent[]> {
    const sql = getPool();
    const rows = await sql(
      `SELECT * FROM payment_events
       WHERE nexus_payment_id = $1
       ORDER BY created_at ASC`,
      [nexusPaymentId],
    );
    return rows.map(rowToEvent);
  }
}
