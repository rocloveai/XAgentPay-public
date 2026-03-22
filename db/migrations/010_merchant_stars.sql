-- Migration 010: Merchant star/rating system
-- Allows wallets to "star" merchant agents for ranking in marketplace

CREATE TABLE IF NOT EXISTS merchant_stars (
  merchant_did   TEXT NOT NULL REFERENCES merchant_registry(merchant_did) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_did, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_merchant_stars_did ON merchant_stars(merchant_did);
CREATE INDEX IF NOT EXISTS idx_merchant_stars_wallet ON merchant_stars(wallet_address);
