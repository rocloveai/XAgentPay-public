// Re-export xagent-core types so existing imports from "../types.js" keep working
export type {
  LineItem,
  XAgentQuotePayload,
  PaymentMethod,
  PaymentStatus,
  WebhookEventType,
  WebhookPayload,
} from "./types/xagent-core-types.js";

import type { XAgentQuotePayload } from "./types/xagent-core-types.js";

export interface HotelOffer {
  readonly offer_id: string;
  readonly hotel_name: string;
  readonly star_rating: number;
  readonly room_type: string;
  readonly location: string;
  readonly city: string;
  readonly price_per_night: {
    readonly amount: string;
    readonly currency: string;
  };
  readonly amenities: readonly string[];
}

export type OrderStatus = "UNPAID" | "PAID" | "EXPIRED";

export interface Order {
  readonly order_ref: string;
  readonly status: OrderStatus;
  readonly quote_payload: XAgentQuotePayload;
  readonly payer_wallet?: string;
  readonly created_at: string;
  readonly updated_at: string;
}
