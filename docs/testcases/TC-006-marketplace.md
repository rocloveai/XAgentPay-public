# TC-006: Marketplace & Agent Discovery

## Module
`discover_agents` / `get_agent_skill` (MCP) / `/api/market/*` / `/api/agents` (REST)

## Prerequisites
- merchant_registry populated with at least 2 agents

---

## A. Agent Discovery

### TC-006-01: List All Agents (MCP)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `discover_agents` with no filters

**Expected:**
- Returns array of agents
- Each agent has: merchant_did, name, description, category, health_status, stars
- Sorted by stars DESC, ONLINE first, name ASC

---

### TC-006-02: Search by Keyword

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `discover_agents` with `query: "flight"`

**Expected:**
- Returns agents matching "flight" in name, description, or skill_name
- Non-matching agents excluded

---

### TC-006-03: Filter by Category

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `discover_agents` with `category: "travel"`

**Expected:**
- Returns agents with category starting with "travel" (e.g. travel.flights, travel.hotels)
- Other categories excluded

---

### TC-006-04: Limit Results

**Priority:** P1
**Type:** Functional

**Steps:**
1. Call `discover_agents` with `limit: 1`

**Expected:**
- Returns at most 1 agent
- Total count still available

---

### TC-006-05: Maximum Limit (50)

**Priority:** P2
**Type:** Boundary

**Steps:**
1. Call with `limit: 100`

**Expected:**
- Capped at 50 results
- Default limit is 20

---

### TC-006-06: REST API - GET /api/agents

**Priority:** P0
**Type:** Functional

**Steps:**
1. `GET /api/agents?query=hotel&category=travel&limit=10`

**Expected:**
- HTTP 200
- Response: `{ "http_status": 200, "agents": [...], "total": N, "limit": 10, "offset": 0 }`
- Each agent includes: `merchant_did`, `name`, `description`, `category`, `mcp_endpoint`, `skill_md_url`, `skill_user_url`, `currencies`, `health_status`, `stars`, `tools`

**Note:** The field is `tools` (not `skill_tools`).

---

## B. Agent Skill

### TC-006-07: Get Agent Skill (MCP)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `get_agent_skill` with `merchant_did: "did:xagent:20250407:demo_flight"`

**Expected:**
- Returns full skill.md markdown content
- Contains MCP connection info, available tools, checkout workflow

---

### TC-006-08: Get Agent Skill (REST)

**Priority:** P0
**Type:** Functional

**Steps:**
1. `GET /api/agents/did:xagent:20250407:demo_flight/skill`

**Expected:**
- HTTP 200
- Content-Type: text/markdown
- Full skill.md content returned

---

### TC-006-09: Skill for Non-existent Agent

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call `get_agent_skill` with unknown DID

**Expected:**
- HTTP 404 with `{ "http_status": 404, "error": "Agent not found" }`

---

## C. Marketplace Management

### TC-006-10: Register New Agent

**Priority:** P0
**Type:** Functional

**Steps:**
1. `POST /api/market/register` with Bearer token and body:
   ```json
   {
     "merchant_did": "did:xagent:20250407:test_agent",
     "name": "Test Agent",
     "description": "Test description",
     "category": "travel.test",
     "signer_address": "0x...",
     "payment_address": "0x...",
     "skill_md_url": "https://example.com/skill.md",
     "health_url": "https://example.com/health"
   }
   ```

**Expected:**
- HTTP 201
- Agent created in merchant_registry
- Discoverable via `discover_agents`

**Note:** All fields including `health_url` are **required**. Registration will fail with 400 if any field is missing.

---

### TC-006-11: Update Existing Agent

**Priority:** P1
**Type:** Functional

**Steps:**
1. Register agent
2. Register again with same DID but updated description

**Expected:**
- Agent updated (UPSERT behavior)
- New description reflected in queries

---

### TC-006-12: Register Without Auth

**Priority:** P0
**Type:** Security

**Steps:**
1. `POST /api/market/register` without Bearer token

**Expected:**
- HTTP 401 Unauthorized
- Agent not created

---

## D. Star System

### TC-006-13: Star an Agent

**Priority:** P1
**Type:** Functional

**Steps:**
1. `POST /api/market/agents/:did/star` with `{ "wallet_address": "0x..." }`

**Expected:**
- HTTP 201 (new star) or HTTP 200 (duplicate star, idempotent)
- Response: `{ "http_status": 201, "starred": true, "star_count": N }`
- Star count incremented

---

### TC-006-14: Remove Star

**Priority:** P1
**Type:** Functional

**Steps:**
1. Star an agent
2. `DELETE /api/market/agents/:did/star` with `{ "wallet_address": "0x..." }`

**Expected:**
- HTTP 200 with `{ "http_status": 200, "starred": false, "star_count": N }`
- Star count decremented

---

### TC-006-15: Double Star (Idempotent)

**Priority:** P2
**Type:** Edge Case

**Steps:**
1. Star same agent twice with same wallet

**Expected:**
- First star: HTTP 201
- Second star: HTTP 200 (idempotent)
- Star count only incremented once

---

## E. Marketplace Skill File

### TC-006-16: Marketplace Discovery Skill

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /skill-market.md` on xagent-core

**Expected:**
- HTTP 200, Content-Type: text/markdown
- Contains marketplace discovery API documentation
- Describes agent search, skill retrieval, and star endpoints
- Distinct from `/skill.md` (payment skill) and `/skill-user.md` (HTTP payment skill)
