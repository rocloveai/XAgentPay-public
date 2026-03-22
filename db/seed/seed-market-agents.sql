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
  webhook_secret = 'hotel_webhook_secret_dev',
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
  webhook_secret = 'flight_webhook_secret_dev',
  skill_name = 'xagent-flight',
  skill_version = '0.1.0',
  skill_protocol = 'MCP',
  skill_tools = '[{"name":"search_flights","role":"search"},{"name":"generate_flight_quote","role":"quote"}]'::jsonb,
  currencies = '["USDC"]'::jsonb,
  chain_id = 196,
  is_verified = TRUE,
  updated_at = NOW()
WHERE merchant_did = 'did:xagent:196:demo_flight';
