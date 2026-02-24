import type { EventRepository } from "../../db/interfaces/event-repo.js";
import type {
  PaymentEvent,
  PaymentEventType,
  PaymentStatus,
  CreateEventParams,
} from "../../types.js";

export class MockEventRepository implements EventRepository {
  private readonly store = new Map<string, PaymentEvent>();

  clear(): void {
    this.store.clear();
  }

  async append(params: CreateEventParams): Promise<PaymentEvent> {
    const event: PaymentEvent = {
      event_id: params.event_id,
      nexus_payment_id: params.nexus_payment_id,
      event_type: params.event_type as PaymentEventType,
      from_status: params.from_status as PaymentStatus | null,
      to_status: params.to_status as PaymentStatus,
      metadata: params.metadata,
      created_at: new Date().toISOString(),
    };
    this.store.set(params.event_id, event);
    return event;
  }

  async findByPaymentId(nexusPaymentId: string): Promise<readonly PaymentEvent[]> {
    const events: PaymentEvent[] = [];
    for (const e of this.store.values()) {
      if (e.nexus_payment_id === nexusPaymentId) {
        events.push(e);
      }
    }
    return events.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }
}
