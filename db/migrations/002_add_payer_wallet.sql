-- Migration 002: Add payer_wallet column to orders table
-- Stores the EVM wallet address (0x...) of the buyer who placed the order

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payer_wallet TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_payer ON orders (payer_wallet);
