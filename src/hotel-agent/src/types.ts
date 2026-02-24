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
  readonly quote_payload: NexusQuotePayload;
  readonly payer_wallet?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface LineItem {
  readonly name: string;
  readonly qty: number;
  readonly amount: string;
}

export interface NexusQuotePayload {
  readonly merchant_did: string;
  readonly merchant_order_ref: string;
  readonly amount: string;
  readonly currency: string;
  readonly chain_id: number;
  readonly expiry: number;
  readonly context: {
    readonly summary: string;
    readonly line_items: readonly LineItem[];
    readonly original_amount?: string;
    readonly payer_wallet?: string;
  };
  readonly signature: string;
}
