-- 004_escrow_fields.sql
-- Add Escrow-specific columns to payments table
-- Each statement ends with ";" on its own line (Neon HTTP driver constraint)

ALTER TABLE payments ADD COLUMN IF NOT EXISTS escrow_contract TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_id_bytes32 TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS eip3009_nonce TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS deposit_tx_hash TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS release_tx_hash TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_tx_hash TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS release_deadline TIMESTAMPTZ;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS dispute_deadline TIMESTAMPTZ;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS protocol_fee TEXT;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_release_deadline ON payments (release_deadline)
  WHERE status = 'ESCROWED';

CREATE INDEX IF NOT EXISTS idx_payments_dispute_deadline ON payments (dispute_deadline)
  WHERE status = 'ESCROWED';
