-- 003_xagent_core_schema.sql
-- XAgentPay Core tables: payments, payment_events, merchant_registry, webhook_delivery_logs
-- Each statement ends with ";" on its own line (Neon HTTP driver constraint)

-- payments: core payment records (12-state machine)
CREATE TABLE IF NOT EXISTS payments (
  nexus_payment_id    TEXT PRIMARY KEY,
  quote_hash          TEXT NOT NULL,
  merchant_did        TEXT NOT NULL,
  merchant_order_ref  TEXT NOT NULL,
  payer_wallet        TEXT,
  payment_address     TEXT NOT NULL,
  amount              TEXT NOT NULL,
  amount_display      TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USDC',
  chain_id            INTEGER NOT NULL DEFAULT 210425,
  status              TEXT NOT NULL DEFAULT 'CREATED',
  payment_method      TEXT NOT NULL DEFAULT 'DIRECT_TRANSFER',
  tx_hash             TEXT,
  block_number        BIGINT,
  block_timestamp     TIMESTAMPTZ,
  quote_payload       JSONB NOT NULL,
  iso_metadata        JSONB,
  expires_at          TIMESTAMPTZ NOT NULL,
  settled_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_status CHECK (status IN (
    'CREATED', 'AWAITING_TX', 'BROADCASTED',
    'SETTLED', 'COMPLETED', 'EXPIRED',
    'TX_FAILED', 'RISK_REJECTED',
    'ESCROWED', 'REFUNDED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED'
  )),
  CONSTRAINT chk_payment_method CHECK (payment_method IN (
    'DIRECT_TRANSFER', 'ESCROW_CONTRACT'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_quote_hash_active
  ON payments (quote_hash) WHERE status NOT IN ('EXPIRED', 'TX_FAILED');

CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments (merchant_did);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments (payer_wallet);

CREATE INDEX IF NOT EXISTS idx_payments_expires ON payments (expires_at)
  WHERE status IN ('CREATED', 'AWAITING_TX');

-- payment_events: append-only event sourcing table
CREATE TABLE IF NOT EXISTS payment_events (
  event_id            TEXT PRIMARY KEY,
  nexus_payment_id    TEXT NOT NULL REFERENCES payments(nexus_payment_id),
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_payment ON payment_events (nexus_payment_id);

CREATE INDEX IF NOT EXISTS idx_events_type ON payment_events (event_type);

-- merchant_registry: merchant identity (MVP local version)
CREATE TABLE IF NOT EXISTS merchant_registry (
  merchant_did        TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  signer_address      TEXT NOT NULL,
  payment_address     TEXT NOT NULL,
  webhook_url         TEXT,
  webhook_secret      TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- webhook_delivery_logs: webhook delivery tracking
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  log_id              TEXT PRIMARY KEY,
  nexus_payment_id    TEXT NOT NULL REFERENCES payments(nexus_payment_id),
  merchant_did        TEXT NOT NULL,
  webhook_url         TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  request_body        JSONB NOT NULL,
  response_status     INTEGER,
  response_body       TEXT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  next_retry_at       TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_payment ON webhook_delivery_logs (nexus_payment_id);

CREATE INDEX IF NOT EXISTS idx_webhook_retry ON webhook_delivery_logs (next_retry_at)
  WHERE delivered_at IS NULL AND attempt_number < 6;
