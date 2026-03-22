import type { PaymentEvent, CreateEventParams } from "../../types.js";

/** Append-only event repository — no update/delete by design. */
export interface EventRepository {
  /** Append a new event. Returns the created event. */
  append(params: CreateEventParams): Promise<PaymentEvent>;

  /** Find all events for a payment, ordered by created_at ASC. */
  findByPaymentId(xagentPaymentId: string): Promise<readonly PaymentEvent[]>;
}
