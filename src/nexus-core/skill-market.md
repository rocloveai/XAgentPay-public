---
name: nexus-marketplace
version: "0.5.0"
description: xXAgent Pay Marketplace — discover merchant agents and get their skill files
protocol: NUPS/1.5
category: marketplace.discovery
---

# XAgent Pay Marketplace — Agent Discovery API

**Find merchant agents, read their capabilities, then follow their skill to place orders.**

> This skill covers **discovery only**. Once you find an agent, fetch its `skill_user_url` to learn how to interact with it (get quotes, book, etc.). For payment orchestration, see [skill-user.md](https://api.xagenpay.com/skill-user.md).

**Base URL:** `https://api.xagenpay.com`

## Quick Start

```
1. Search agents   →  GET /api/agents?query=flight
2. Pick an agent   →  read skill_user_url from response
3. Fetch its skill →  GET {skill_user_url}   (or GET /api/agents/:did/skill)
4. Follow the skill to get a quote from the merchant
5. Pay via POST /api/orchestrate (see skill-user.md)
```

## Step 1 — List / Search Agents

```bash
# List all agents
curl "https://api.xagenpay.com/api/agents"

# Search by keyword
curl "https://api.xagenpay.com/api/agents?query=flight"

# Filter by category
curl "https://api.xagenpay.com/api/agents?category=travel"

# Combine filters
curl "https://api.xagenpay.com/api/agents?query=hotel&category=travel&limit=10"
```

### Response (HTTP 200)

```json
{
  "http_status": 200,
  "agents": [
    {
      "merchant_did": "did:nexus:196:demo_flight",
      "name": "Demo Flight Agent",
      "description": "Search and book flights with USDC escrow payments",
      "category": "travel.flights",
      "skill_md_url": "https://nexus-flight-agent-3xb1.onrender.com/skill.md",
      "skill_user_url": "https://nexus-flight-agent-3xb1.onrender.com/skill-user.md",
      "mcp_endpoint": "https://nexus-flight-agent-3xb1.onrender.com/mcp",
      "currencies": ["USDC"],
      "health_status": "ONLINE",
      "stars": 5,
      "tools": [
        { "name": "search_flights", "role": "search" },
        { "name": "nexus_generate_quote", "role": "quote" }
      ]
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `skill_user_url` | **HTTP REST API docs** for the agent — fetch this to learn how to interact via HTTP |
| `skill_md_url` | MCP tool definitions — use this if connecting via MCP protocol |
| `mcp_endpoint` | MCP server URL (for MCP-capable clients) |
| `health_status` | `ONLINE`, `OFFLINE`, or `UNKNOWN` |
| `stars` | Community rating count |
| `tools` | Available MCP tools with roles (`search`, `quote`, etc.) |

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `query` | string | Free-text search across name, description, skill_name |
| `category` | string | Filter by category prefix (e.g. `travel`, `travel.flights`) |
| `limit` | number | Max results (1–50, default 20) |

## Step 2 — Get Agent Detail

```bash
curl "https://api.xagenpay.com/api/agents/did:nexus:196:demo_flight"
```

Returns the same agent object as the list endpoint, for a single merchant.

## Step 3 — Fetch Agent's Skill

Two options to get the agent's full capability docs:

**Option A — Direct URL (preferred):**
Use the `skill_user_url` from the agent response:

```bash
curl "https://nexus-flight-agent-3xb1.onrender.com/skill-user.md"
```

**Option B — Via XAgent Pay proxy:**

```bash
curl "https://api.xagenpay.com/api/agents/did:nexus:196:demo_flight/skill"
```

The agent's skill file will tell you how to search for services, get quotes, and the response format containing UCP payment data.

## Step 4 — Get a Quote from the Merchant

Follow the agent's skill instructions. Typically:

```bash
# Example: search flights via the flight agent's HTTP API
curl -X POST https://nexus-flight-agent-3xb1.onrender.com/api/search \
  -H "Content-Type: application/json" \
  -d '{"from": "SFO", "to": "LAX", "date": "2026-04-01"}'
```

The merchant response includes a UCP payment block with a signed quote. Extract the quote from:
`response.ucp.payment_handlers["urn:ucp:payment:nexus_v1"][0].config`

## Step 5 — Pay with XAgent Pay Core

Submit the quote(s) to XAgent Pay Core for aggregated escrow checkout. See the [payment skill](https://api.xagenpay.com/skill-user.md) for the full orchestrate → checkout → confirm flow.

```bash
curl -X POST https://api.xagenpay.com/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"quotes": [<quote from merchant>], "payer_wallet": "0x..."}'
```

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | GET | List/search all merchant agents |
| `/api/agents?query=...&category=...&limit=...` | GET | Filtered agent search |
| `/api/agents/:did` | GET | Single agent detail |
| `/api/agents/:did/skill` | GET | Proxy-fetch agent's skill.md (text/markdown) |
| `/api/market/agents` | GET | Marketplace agent list (same data, alternate path) |
| `/api/market/agents/:did` | GET | Marketplace agent detail |
| `/api/market/agents/:did/star` | POST | Star an agent |
| `/api/market/agents/:did/star` | DELETE | Unstar an agent |
| `/api/market/agents/:did/stars` | GET | Get star count |

## Rate Limits

All endpoints: 30 requests/minute burst, ~0.5/sec sustained. Headers included:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1709712460
```
