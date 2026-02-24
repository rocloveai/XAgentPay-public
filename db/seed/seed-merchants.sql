-- seed-merchants.sql
-- Test merchant entries for NexusPay Core development

INSERT INTO merchant_registry (merchant_did, name, signer_address, payment_address, webhook_url, webhook_secret, is_active)
VALUES (
  'did:nexus:210425:demo_flight',
  'NexusPay Demo Flight Agent',
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  'http://localhost:3001/webhook',
  'REDACTED_WEBHOOK_SECRET',
  TRUE
)
ON CONFLICT (merchant_did) DO UPDATE SET
  name = EXCLUDED.name,
  signer_address = EXCLUDED.signer_address,
  payment_address = EXCLUDED.payment_address,
  webhook_url = EXCLUDED.webhook_url,
  webhook_secret = EXCLUDED.webhook_secret,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

INSERT INTO merchant_registry (merchant_did, name, signer_address, payment_address, webhook_url, webhook_secret, is_active)
VALUES (
  'did:nexus:210425:demo_hotel',
  'NexusPay Demo Hotel Agent',
  '0x0000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000004',
  'http://localhost:3002/webhook',
  'REDACTED_WEBHOOK_SECRET',
  TRUE
)
ON CONFLICT (merchant_did) DO UPDATE SET
  name = EXCLUDED.name,
  signer_address = EXCLUDED.signer_address,
  payment_address = EXCLUDED.payment_address,
  webhook_url = EXCLUDED.webhook_url,
  webhook_secret = EXCLUDED.webhook_secret,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
