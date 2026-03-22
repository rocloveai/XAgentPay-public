-- Agent Marketplace table
CREATE TABLE IF NOT EXISTS market_agents (
  agent_id        TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general',
  skill_md_url    TEXT NOT NULL,
  health_url      TEXT NOT NULL,
  mcp_endpoint    TEXT,
  merchant_did    TEXT,

  -- skill.md parsed metadata cache
  skill_name      TEXT,
  skill_version   TEXT,
  skill_protocol  TEXT,
  skill_tools     JSONB DEFAULT '[]',
  currencies      JSONB DEFAULT '["USDC"]',
  chain_id        INTEGER,

  -- Health status
  health_status   TEXT NOT NULL DEFAULT 'UNKNOWN'
                  CHECK (health_status IN ('ONLINE', 'OFFLINE', 'DEGRADED', 'UNKNOWN')),
  last_health_check TIMESTAMPTZ,
  last_health_latency_ms INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_agents_category ON market_agents(category);
CREATE INDEX IF NOT EXISTS idx_market_agents_health ON market_agents(health_status);
CREATE INDEX IF NOT EXISTS idx_market_agents_active ON market_agents(is_active) WHERE is_active = TRUE;
