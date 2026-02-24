-- seed-merchants.sql
-- Test merchant entries for NexusPay Core development (PlatON Devnet)

INSERT INTO merchant_registry (merchant_did, name, signer_address, payment_address, webhook_url, webhook_secret, is_active)
VALUES (
  'did:nexus:210425:demo_flight',
  'NexusPay Demo Flight Agent',
  '0xdd31F8EcD2F5DE824238AB1A761212006A1E11b6',
  '0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1',
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
  '0x5916667cfBD5f329c0A6474bf81d7F58c3BFB2C4',
  '0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd',
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
