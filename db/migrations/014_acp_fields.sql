-- 014_acp_fields.sql
-- Add ERC-8183 Agentic Commerce Protocol (ACP) fields to the payments table.
-- These columns store the on-chain job lifecycle data alongside existing escrow fields.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS acp_contract TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS acp_job_id BIGINT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS acp_deliverable TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS acp_submit_tx_hash TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS acp_complete_tx_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_acp_job ON payments (acp_job_id) WHERE acp_job_id IS NOT NULL;
