-- Migration 005: Payment Groups (aggregated multi-merchant payments)
--
-- A PaymentGroup represents a single user payment action that covers
-- one or more merchant orders. The user signs once for the total amount.

CREATE TABLE IF NOT EXISTS payment_groups (
  group_id            TEXT PRIMARY KEY,
  payer_wallet        TEXT NOT NULL,
  total_amount        TEXT NOT NULL,
  total_amount_display TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USDC',
  chain_id            INTEGER NOT NULL DEFAULT 20250407,
  status              TEXT NOT NULL DEFAULT 'GROUP_CREATED'
    CHECK (status IN (
      'GROUP_CREATED', 'GROUP_AWAITING_TX', 'GROUP_ESCROWED',
      'GROUP_SETTLED', 'GROUP_COMPLETED', 'GROUP_EXPIRED', 'GROUP_PARTIAL'
    )),
  payment_count       INTEGER NOT NULL DEFAULT 0,
  tx_hash             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_groups_status
  ON payment_groups (status);

CREATE INDEX IF NOT EXISTS idx_payment_groups_payer
  ON payment_groups (payer_wallet);

CREATE INDEX IF NOT EXISTS idx_payment_groups_created
  ON payment_groups (created_at DESC);

-- Add group_id column to payments table (nullable for standalone payments)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES payment_groups(group_id);

CREATE INDEX IF NOT EXISTS idx_payments_group_id
  ON payments (group_id)
  WHERE group_id IS NOT NULL;
