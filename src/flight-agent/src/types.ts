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
  };
  readonly signature: string;
}
