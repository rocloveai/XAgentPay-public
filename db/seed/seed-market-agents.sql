-- seed-market-agents.sql
-- Update the 2 demo merchants with marketplace fields.
-- Run AFTER migration 009_unify_merchant_market.sql.

UPDATE merchant_registry SET
  description = 'AI-powered hotel booking with Nexus Payment. Search and book hotels worldwide with real-time availability and instant USDC checkout.',
  category = 'travel.hotels',
  skill_md_url = 'https://nexus-hotel-agent-nr8m.onrender.com/skill.md',
  health_url = 'https://nexus-hotel-agent-nr8m.onrender.com/health',
  mcp_endpoint = 'https://nexus-hotel-agent-nr8m.onrender.com/sse',
  skill_name = 'nexus-hotel-agent',
  skill_version = '0.1.0',
  skill_protocol = 'MCP',
  skill_tools = '[{"name":"search_hotels","role":"search"},{"name":"generate_hotel_quote","role":"quote"}]'::jsonb,
  currencies = '["USDC"]'::jsonb,
  chain_id = 20250407,
  is_verified = TRUE,
  updated_at = NOW()
WHERE merchant_did = 'did:nexus:20250407:demo_hotel';

UPDATE merchant_registry SET
  description = 'AI-powered flight booking with Nexus Payment. Search and book flights via Duffel with real-time pricing and instant USDC checkout.',
  category = 'travel.flights',
  skill_md_url = 'https://nexus-flight-agent-nr8m.onrender.com/skill.md',
  health_url = 'https://nexus-flight-agent-nr8m.onrender.com/health',
  mcp_endpoint = 'https://nexus-flight-agent-nr8m.onrender.com/sse',
  skill_name = 'nexus-flight-agent',
  skill_version = '0.1.0',
  skill_protocol = 'MCP',
  skill_tools = '[{"name":"search_flights","role":"search"},{"name":"generate_flight_quote","role":"quote"}]'::jsonb,
  currencies = '["USDC"]'::jsonb,
  chain_id = 20250407,
  is_verified = TRUE,
  updated_at = NOW()
WHERE merchant_did = 'did:nexus:20250407:demo_flight';
