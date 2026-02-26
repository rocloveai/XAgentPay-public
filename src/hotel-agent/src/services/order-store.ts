import type { NexusQuotePayload, Order, OrderStatus } from "../types.js";
import { isPoolInitialized } from "./db/pool.js";
import {
  insertOrder,
  selectOrder,
  updateOrderStatus,
  selectAllOrders,
} from "./db/order-repo.js";

// In-memory fallback (used when DATABASE_URL is not set)
const memOrders = new Map<string, Order>();

function generateOrderRef(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `HTL-${ts}-${rand}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

export async function createOrder(
  quotePayload: NexusQuotePayload,
): Promise<Order> {
  const payerWallet = quotePayload.context.payer_wallet;

  if (isPoolInitialized()) {
    return insertOrder(quotePayload, payerWallet);
  }

  const order: Order = {
    order_ref: quotePayload.merchant_order_ref,
    status: "UNPAID",
    quote_payload: quotePayload,
    payer_wallet: payerWallet,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  memOrders.set(order.order_ref, order);
  return order;
}

export async function getOrder(ref: string): Promise<Order | undefined> {
  if (isPoolInitialized()) {
    return selectOrder(ref);
  }
  return memOrders.get(ref);
}

export async function updateStatus(
  ref: string,
  status: OrderStatus,
): Promise<Order | undefined> {
  if (isPoolInitialized()) {
    return updateOrderStatus(ref, status);
  }

  const existing = memOrders.get(ref);
  if (!existing) return undefined;

  const updated: Order = { ...existing, status, updated_at: nowISO() };
  memOrders.set(ref, updated);
  return updated;
}

export function newOrderRef(): string {
  return generateOrderRef();
}

export async function listOrders(
  payerWallet?: string,
): Promise<readonly Order[]> {
  if (isPoolInitialized()) {
    return selectAllOrders(payerWallet);
  }
  const all = Array.from(memOrders.values());
  if (payerWallet) {
    return all.filter((o) => o.payer_wallet === payerWallet);
  }
  return all;
}
