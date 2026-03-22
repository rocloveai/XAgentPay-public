-- Migration 011: Add GROUP_DEPOSITED status to payment_groups
--
-- Allows group status to reflect batch deposit confirmation.
-- This is a transitional status between GROUP_CREATED and GROUP_ESCROWED
-- when the user submits a batchDepositWithAuthorization transaction.

-- Drop and recreate the CHECK constraint to include GROUP_DEPOSITED
ALTER TABLE payment_groups
  DROP CONSTRAINT IF EXISTS payment_groups_status_check;

ALTER TABLE payment_groups
  ADD CONSTRAINT payment_groups_status_check
  CHECK (status IN (
    'GROUP_CREATED', 'GROUP_AWAITING_TX', 'GROUP_DEPOSITED', 'GROUP_ESCROWED',
    'GROUP_SETTLED', 'GROUP_COMPLETED', 'GROUP_EXPIRED', 'GROUP_PARTIAL'
  ));
