import type { NexusQuotePayload, Order, OrderStatus } from "../types.js";

const orders = new Map<string, Order>();

function generateOrderRef(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `HTL-${ts}-${rand}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export function createOrder(quotePayload: NexusQuotePayload): Order {
  const order: Order = {
    order_ref: quotePayload.merchant_order_ref,
    status: "UNPAID",
    quote_payload: quotePayload,
    created_at: nowISO(),
    updated_at: nowISO(),
  };

  orders.set(order.order_ref, order);
  return order;
}

export function getOrder(ref: string): Order | undefined {
  return orders.get(ref);
}

export function updateStatus(ref: string, status: OrderStatus): Order | undefined {
  const existing = orders.get(ref);
  if (!existing) return undefined;

  const updated: Order = {
    ...existing,
    status,
    updated_at: nowISO(),
  };

  orders.set(ref, updated);
  return updated;
}

export function newOrderRef(): string {
  return generateOrderRef();
}

export function listOrders(): readonly Order[] {
  return Array.from(orders.values());
}
