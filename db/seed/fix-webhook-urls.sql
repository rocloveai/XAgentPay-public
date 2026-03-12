-- fix-webhook-urls.sql
-- One-time fix: ensure webhook_url and webhook_secret are set for demo merchants.
-- Run against the Render production DB via: psql $DATABASE_URL -f db/seed/fix-webhook-urls.sql

UPDATE merchant_registry SET
  webhook_url = 'https://xagenpay.com/flight/webhook',
  webhook_secret = 'REDACTED_WEBHOOK_SECRET',
  updated_at = NOW()
WHERE merchant_did = 'did:nexus:196:demo_flight'
  AND (webhook_url IS NULL OR webhook_url = '');

UPDATE merchant_registry SET
  webhook_url = 'https://xagenpay.com/hotel/webhook',
  webhook_secret = 'REDACTED_WEBHOOK_SECRET',
  updated_at = NOW()
WHERE merchant_did = 'did:nexus:196:demo_hotel'
  AND (webhook_url IS NULL OR webhook_url = '');

-- Verify
SELECT merchant_did, name, webhook_url, webhook_secret IS NOT NULL AS has_secret
FROM merchant_registry
WHERE merchant_did IN ('did:nexus:196:demo_flight', 'did:nexus:196:demo_hotel');
