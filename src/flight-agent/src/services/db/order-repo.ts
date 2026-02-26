import { getPool } from "./pool.js";
import type { NexusQuotePayload, Order, OrderStatus } from "../../types.js";

const AGENT_TYPE = "flight";

export async function insertOrder(
  quotePayload: NexusQuotePayload,
  payerWallet?: string,
): Promise<Order> {
  const sql = getPool();
  const now = new Date().toISOString();

  await sql(
    `INSERT INTO orders (order_ref, agent_type, status, quote_payload, payer_wallet, created_at, updated_at)
     VALUES ($1, $2, 'UNPAID', $3::jsonb, $4, $5::timestamptz, $6::timestamptz)
     ON CONFLICT (order_ref) DO NOTHING`,
    [
      quotePayload.merchant_order_ref,
      AGENT_TYPE,
      JSON.stringify(quotePayload),
      payerWallet ?? null,
      now,
      now,
    ],
  );

  return {
    order_ref: quotePayload.merchant_order_ref,
    status: "UNPAID",
    quote_payload: quotePayload,
    payer_wallet: payerWallet,
    created_at: now,
    updated_at: now,
  };
}

export async function selectOrder(ref: string): Promise<Order | undefined> {
  const sql = getPool();
  const rows = await sql(
    `SELECT order_ref, status, quote_payload, payer_wallet, created_at, updated_at
     FROM orders WHERE order_ref = $1 AND agent_type = $2`,
    [ref, AGENT_TYPE],
  );

  if (rows.length === 0) return undefined;

  const row = rows[0];
  return {
    order_ref: row.order_ref as string,
    status: row.status as OrderStatus,
    quote_payload: row.quote_payload as unknown as NexusQuotePayload,
    payer_wallet: (row.payer_wallet as string) || undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function updateOrderStatus(
  ref: string,
  status: OrderStatus,
): Promise<Order | undefined> {
  const sql = getPool();
  const now = new Date().toISOString();

  const rows = await sql(
    `UPDATE orders SET status = $1, updated_at = $2::timestamptz
     WHERE order_ref = $3 AND agent_type = $4
     RETURNING order_ref, status, quote_payload, payer_wallet, created_at, updated_at`,
    [status, now, ref, AGENT_TYPE],
  );

  if (rows.length === 0) return undefined;

  const row = rows[0];
  return {
    order_ref: row.order_ref as string,
    status: row.status as OrderStatus,
    quote_payload: row.quote_payload as unknown as NexusQuotePayload,
    payer_wallet: (row.payer_wallet as string) || undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function selectAllOrders(
  payerWallet?: string,
): Promise<readonly Order[]> {
  const sql = getPool();
  const rows = payerWallet
    ? await sql(
        `SELECT order_ref, status, quote_payload, payer_wallet, created_at, updated_at
         FROM orders WHERE agent_type = $1 AND payer_wallet = $2 ORDER BY created_at DESC`,
        [AGENT_TYPE, payerWallet],
      )
    : await sql(
        `SELECT order_ref, status, quote_payload, payer_wallet, created_at, updated_at
         FROM orders WHERE agent_type = $1 ORDER BY created_at DESC`,
        [AGENT_TYPE],
      );

  return rows.map((row) => ({
    order_ref: row.order_ref as string,
    status: row.status as OrderStatus,
    quote_payload: row.quote_payload as unknown as NexusQuotePayload,
    payer_wallet: (row.payer_wallet as string) || undefined,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}
