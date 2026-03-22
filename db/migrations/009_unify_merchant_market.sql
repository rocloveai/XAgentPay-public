-- 009_unify_merchant_market.sql
-- Merge marketplace fields into merchant_registry, drop market_agents.
-- Run AFTER migration 008_market_agents.sql.

-- Step 1: Add marketplace columns to merchant_registry
ALTER TABLE merchant_registry
  ADD COLUMN IF NOT EXISTS description      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category         TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS skill_md_url     TEXT,
  ADD COLUMN IF NOT EXISTS health_url       TEXT,
  ADD COLUMN IF NOT EXISTS mcp_endpoint     TEXT,
  ADD COLUMN IF NOT EXISTS skill_name       TEXT,
  ADD COLUMN IF NOT EXISTS skill_version    TEXT,
  ADD COLUMN IF NOT EXISTS skill_protocol   TEXT,
  ADD COLUMN IF NOT EXISTS skill_tools      JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS currencies       JSONB DEFAULT '["USDC"]',
  ADD COLUMN IF NOT EXISTS chain_id         INTEGER,
  ADD COLUMN IF NOT EXISTS health_status    TEXT NOT NULL DEFAULT 'UNKNOWN'
                           CHECK (health_status IN ('ONLINE', 'OFFLINE', 'DEGRADED', 'UNKNOWN')),
  ADD COLUMN IF NOT EXISTS last_health_check      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS consecutive_failures   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_verified      BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: Migrate data from market_agents into merchant_registry
-- Only update merchants whose DID matches a market_agents row
UPDATE merchant_registry mr
SET
  description           = ma.description,
  category              = ma.category,
  skill_md_url          = ma.skill_md_url,
  health_url            = ma.health_url,
  mcp_endpoint          = ma.mcp_endpoint,
  skill_name            = ma.skill_name,
  skill_version         = ma.skill_version,
  skill_protocol        = ma.skill_protocol,
  skill_tools           = ma.skill_tools,
  currencies            = ma.currencies,
  chain_id              = ma.chain_id,
  health_status         = ma.health_status,
  last_health_check     = ma.last_health_check,
  last_health_latency_ms = ma.last_health_latency_ms,
  consecutive_failures  = ma.consecutive_failures,
  is_verified           = ma.is_verified,
  updated_at            = NOW()
FROM market_agents ma
WHERE ma.merchant_did IS NOT NULL
  AND mr.merchant_did = ma.merchant_did;

-- Step 3: Add indexes for marketplace queries
CREATE INDEX IF NOT EXISTS idx_merchant_category ON merchant_registry(category);
CREATE INDEX IF NOT EXISTS idx_merchant_health ON merchant_registry(health_status);
CREATE INDEX IF NOT EXISTS idx_merchant_active_skill ON merchant_registry(is_active) WHERE is_active = TRUE AND skill_md_url IS NOT NULL;

-- Step 4: Drop market_agents table (no longer needed)
DROP TABLE IF EXISTS market_agents;
