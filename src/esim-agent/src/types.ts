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

export interface EsimPlan {
  readonly offer_id: string;
  readonly country: string;
  readonly country_code: string;
  readonly data_gb: number;
  readonly days: number;
  readonly provider: string;
  readonly network: string;
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
  /** QR Code data URL (set after payment confirmed) */
  readonly qr_data_url?: string;
  /** LPA activation code (set after payment confirmed) */
  readonly activation_code?: string;
}
