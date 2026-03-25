-- seed-market-agents.sql
-- Update the 2 demo merchants with marketplace fields.
-- Run AFTER migration 009_unify_merchant_market.sql.

UPDATE merchant_registry SET
  description = 'AI-powered hotel booking with USDC payments on XLayer. Find and book hotels worldwide.',
  category = 'travel.hotels',
  skill_md_url = 'https://xagenpay.com/hotel/skill.md',
  health_url = 'https://xagenpay.com/hotel/health',
  mcp_endpoint = 'https://xagenpay.com/hotel/mcp',
  webhook_url = 'https://xagenpay.com/hotel/webhook',
  webhook_secret = 'REDACTED_WEBHOOK_SECRET',
  skill_name = 'xagent-hotel',
  skill_version = '0.1.0',
  skill_protocol = 'MCP',
  skill_tools = '[{"name":"search_hotels","role":"search"},{"name":"generate_hotel_quote","role":"quote"}]'::jsonb,
  currencies = '["USDC"]'::jsonb,
  chain_id = 196,
  is_verified = TRUE,
  updated_at = NOW()
WHERE merchant_did = 'did:xagent:196:demo_hotel';

UPDATE merchant_registry SET
  description = 'AI-powered flight booking with USDC payments on XLayer. Search and book flights globally.',
  category = 'travel.flights',
  skill_md_url = 'https://xagenpay.com/flight/skill.md',
  health_url = 'https://xagenpay.com/flight/health',
  mcp_endpoint = 'https://xagenpay.com/flight/mcp',
  webhook_url = 'https://xagenpay.com/flight/webhook',
  webhook_secret = 'REDACTED_WEBHOOK_SECRET',
  skill_name = 'xagent-flight',
  skill_version = '0.1.0',
  skill_protocol = 'MCP',
  skill_tools = '[{"name":"search_flights","role":"search"},{"name":"generate_flight_quote","role":"quote"}]'::jsonb,
  currencies = '["USDC"]'::jsonb,
  chain_id = 196,
  is_verified = TRUE,
  updated_at = NOW()
WHERE merchant_did = 'did:xagent:196:demo_flight';

-- Register destination-info-agent (x402)
INSERT INTO merchant_registry (
  merchant_did, name, description, category,
  signer_address, payment_address,
  skill_md_url, health_url, mcp_endpoint,
  webhook_url, webhook_secret,
  skill_name, skill_version, skill_protocol, skill_tools,
  currencies, chain_id, is_verified, created_at, updated_at
) VALUES (
  'did:xagent:196:demo_destination',
  'XAgent Destination Info',
  'Travel destination info: visa requirements, weather, currency, and local tips. Pay-per-query via x402 on XLayer. 0.01 USDC per query.',
  'travel.info',
  '0xac9d5239b597f8903da93b9b8d92e6cff564e989',
  '0xac9d5239b597f8903da93b9b8d92e6cff564e989',
  'https://xagenpay.com/destination/skill.md',
  'https://xagenpay.com/destination/health',
  'https://xagenpay.com/destination/mcp',
  NULL, NULL,
  'xagent-destination-info', '1.0.0', 'MCP',
  '[{"name":"get_destination_info","role":"query","payment":"x402","price":"0.01 USDC"}]'::jsonb,
  '["USDC"]'::jsonb,
  196, TRUE, NOW(), NOW()
) ON CONFLICT (merchant_did) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  skill_md_url = EXCLUDED.skill_md_url,
  health_url = EXCLUDED.health_url,
  mcp_endpoint = EXCLUDED.mcp_endpoint,
  skill_name = EXCLUDED.skill_name,
  skill_version = EXCLUDED.skill_version,
  skill_tools = EXCLUDED.skill_tools,
  updated_at = NOW();
