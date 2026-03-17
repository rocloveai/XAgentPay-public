-- Migration 015: Add ACP payment statuses to chk_status constraint
--
-- The ACP (ERC-8183) flow uses additional payment statuses:
--   JOB_FUNDED, JOB_SUBMITTED, JOB_COMPLETED, JOB_REJECTED

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS chk_status;

ALTER TABLE payments
  ADD CONSTRAINT chk_status CHECK (status IN (
    'CREATED', 'AWAITING_TX', 'BROADCASTED',
    'SETTLED', 'COMPLETED', 'EXPIRED',
    'TX_FAILED', 'RISK_REJECTED',
    'ESCROWED', 'REFUNDED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED',
    'JOB_FUNDED', 'JOB_SUBMITTED', 'JOB_COMPLETED', 'JOB_REJECTED'
  ));
