-- seed-market-agents.sql
-- Seed the 2 demo merchant agents into the marketplace.
-- Run AFTER migration 008_market_agents.sql.

INSERT INTO market_agents (
  agent_id, name, description, category,
  skill_md_url, health_url, mcp_endpoint, merchant_did,
  skill_name, skill_version, skill_protocol,
  skill_tools, currencies, chain_id,
  is_verified
) VALUES (
  'AGT-hotel001',
  'Nexus Hotel Agent',
  'AI-powered hotel booking with Nexus Payment. Search and book hotels worldwide with real-time availability and instant USDC checkout.',
  'travel.hotels',
  'https://nexus-hotel-agent.onrender.com/skill.md',
  'https://nexus-hotel-agent.onrender.com/health',
  'https://nexus-hotel-agent.onrender.com/sse',
  'did:nexus:20250407:demo_hotel',
  'nexus-hotel-agent', '0.1.0', 'MCP',
  '[{"name":"search_hotels","role":"search"},{"name":"generate_hotel_quote","role":"quote"}]'::jsonb,
  '["USDC"]'::jsonb,
  20250407,
  TRUE
)
ON CONFLICT (agent_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  skill_md_url = EXCLUDED.skill_md_url,
  health_url = EXCLUDED.health_url,
  mcp_endpoint = EXCLUDED.mcp_endpoint,
  skill_name = EXCLUDED.skill_name,
  skill_version = EXCLUDED.skill_version,
  skill_tools = EXCLUDED.skill_tools,
  is_verified = EXCLUDED.is_verified,
  updated_at = NOW();

INSERT INTO market_agents (
  agent_id, name, description, category,
  skill_md_url, health_url, mcp_endpoint, merchant_did,
  skill_name, skill_version, skill_protocol,
  skill_tools, currencies, chain_id,
  is_verified
) VALUES (
  'AGT-flght001',
  'Nexus Flight Agent',
  'AI-powered flight booking with Nexus Payment. Search and book flights via Duffel with real-time pricing and instant USDC checkout.',
  'travel.flights',
  'https://nexus-flight-agent.onrender.com/skill.md',
  'https://nexus-flight-agent.onrender.com/health',
  'https://nexus-flight-agent.onrender.com/sse',
  'did:nexus:20250407:demo_flight',
  'nexus-flight-agent', '0.1.0', 'MCP',
  '[{"name":"search_flights","role":"search"},{"name":"generate_flight_quote","role":"quote"}]'::jsonb,
  '["USDC"]'::jsonb,
  20250407,
  TRUE
)
ON CONFLICT (agent_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  skill_md_url = EXCLUDED.skill_md_url,
  health_url = EXCLUDED.health_url,
  mcp_endpoint = EXCLUDED.mcp_endpoint,
  skill_name = EXCLUDED.skill_name,
  skill_version = EXCLUDED.skill_version,
  skill_tools = EXCLUDED.skill_tools,
  is_verified = EXCLUDED.is_verified,
  updated_at = NOW();
