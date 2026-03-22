-- Migration 007: Add instruction JSONB column to payment_groups.
-- Stores the GroupEscrowInstruction for the checkout page to read.
ALTER TABLE payment_groups
  ADD COLUMN IF NOT EXISTS instruction JSONB;
