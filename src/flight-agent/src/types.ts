// Re-export nexus-core types so existing imports from "../types.js" keep working
export type {
  LineItem,
  NexusQuotePayload,
  PaymentMethod,
  PaymentStatus,
  WebhookEventType,
  WebhookPayload,
} from "./types/nexus-core-types.js";

import type { NexusQuotePayload } from "./types/nexus-core-types.js";

export interface FlightOffer {
  readonly offer_id: string;
  readonly airline: string;
  readonly flight_number: string;
  readonly origin: string;
  readonly destination: string;
  readonly departure_time: string;
  readonly arrival_time: string;
  readonly duration: string;
  readonly cabin_class: string;
  readonly price: {
    readonly amount: string;
    readonly currency: string;
  };
}

export type OrderStatus = "UNPAID" | "PAID" | "EXPIRED";

export interface Order {
  readonly order_ref: string;
  readonly status: OrderStatus;
  readonly quote_payload: NexusQuotePayload;
  readonly payer_wallet?: string;
  readonly created_at: string;
  readonly updated_at: string;
}
