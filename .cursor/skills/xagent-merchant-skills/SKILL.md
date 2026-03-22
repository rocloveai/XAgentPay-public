---
name: nexus-merchant-skills
description: Configure and maintain NMSS-compliant merchant skill.md files for the nexus-mvp project. Use when creating a new merchant agent, updating skill.md URLs after Render deployment, registering merchants with XAgent Pay Core, or verifying merchant skill compliance against RFC-008.
---

# XAgent Pay Merchant Skills Configuration

Handles creation, validation, and registration of NMSS (XAgent Pay Merchant Skill Standard) `skill.md` files for merchant agents in this project.

## Project Context

| Service | Render URL pattern | skill.md path |
|---------|-------------------|---------------|
| xagent-core | `https://api.xagentpay.com` (custom domain) or `https://xagent-core-<id>.onrender.com` | `src/xagent-core/skill.md` |
| nexus-flight-agent | `https://nexus-flight-agent-<id>.onrender.com` | `src/flight-agent/skill.md` |
| nexus-hotel-agent | `https://nexus-hotel-agent-<id>.onrender.com` | `src/hotel-agent/skill.md` |
| nexus-telegram-bot | `https://nexus-telegram-bot-<id>.onrender.com` | `src/telegram-bot/skill.md` |

Current deployed URLs (update if redeployed):
- Core API: `https://api.xagentpay.com`
- Flight Agent: `https://nexus-flight-agent-3xb1.onrender.com`
- Hotel Agent: `https://nexus-hotel-agent-d2lj.onrender.com`

## Merchant Skill Anatomy (NMSS / RFC-008)

Every merchant agent needs **three files**:

| File | Purpose | Served at |
|------|---------|-----------|
| `skill.md` | MCP tool definitions + connection config | `GET /skill.md` |
| `skill-user.md` | HTTP REST API docs (no MCP client needed) | `GET /skill-user.md` |
| (optional) `skill-market.md` | Market discovery / minimal listing | registered in Core DB |

### Required Frontmatter Fields

```yaml
---
name: nexus-<category>-agent          # npm package name
version: "0.1.0"                       # semver
description: <one-line, max 200 chars>
merchant_did: "did:xagent:20250407:<id>" # Nexus DID (chain_id=20250407 for DID namespace)
protocol: NUPS/1.5
category: <domain>.<subcategory>       # e.g. travel.flights, travel.hotels
currencies: [USDC]
chain_id: 20250407                     # Nexus DID namespace (NOT XLayer chain_id 196)
tools:
  - name: search_and_quote
    role: search+quote
  - name: search_<items>
    role: search
  - name: xagent_generate_quote
    role: quote
  - name: xagent_check_status
    role: status
---
```

> **Note**: `chain_id: 20250407` is the Nexus DID namespace used in `merchant_did`. Settlement happens on XLayer (chain_id: 196) via `src/xagent-core`.

### Required Markdown Sections (skill.md)

1. **MCP Connection** — JSON config block with `url: https://<agent>.onrender.com/mcp`
2. **Available Tools** — one subsection per tool with parameter table and example
3. **Checkout Workflow** — must follow the 3-step fast path:
   - Search + Quote → `xagent_orchestrate_payment` on Core → `xagent_check_status`

### Required Markdown Sections (skill-user.md)

1. **Base URL** — `https://<agent>.onrender.com`
2. **Call Tool Endpoint** — `POST /api/v1/call-tool`
3. **Available Tools** — curl examples for each tool
4. **Checkout Workflow (HTTP)** — 4-step: search → orchestrate → confirm → verify

## Workflow: Add a New Merchant Agent

### Step 1 — Write skill.md

Use [merchant-skill-template.md](merchant-skill-template.md). Fill in:
- `name`, `version`, `description`, `merchant_did`, `category`
- Tools list with correct roles
- MCP URL: `https://<your-render-service>.onrender.com/mcp`

### Step 2 — Write skill-user.md

Use the same template's HTTP section. Set:
- Base URL to `https://<your-render-service>.onrender.com`
- curl examples for each tool

### Step 3 — Add to Dockerfile

```dockerfile
COPY skill.md skill-user.md ./
```

### Step 4 — Serve skill.md via HTTP

The portal must handle `GET /skill.md` and `GET /skill-user.md`. See `src/hotel-agent/src/portal.ts` lines ~809-814 as reference implementation.

### Step 5 — Add to render.yaml

```yaml
- type: web
  name: nexus-<category>-agent
  region: singapore
  runtime: docker
  dockerfilePath: src/<category>-agent/Dockerfile
  dockerContext: src/<category>-agent
  plan: free
  envVars:
    - key: TRANSPORT
      value: http
    - key: PORTAL_PORT
      value: "10000"
    - key: PORTAL_HOST
      value: "0.0.0.0"
    - key: DATABASE_URL
      fromDatabase:
        name: nexuspay-db
        property: connectionString
    - key: MERCHANT_SIGNER_PRIVATE_KEY
      sync: false
    - key: MERCHANT_PAYMENT_ADDRESS
      value: "0x<merchant_evm_address>"
    - key: MERCHANT_DID
      value: "did:xagent:20250407:<merchant_id>"
    - key: XAGENT_CORE_URL
      sync: false
```

### Step 6 — Register with XAgent Pay Core

After deployment, register the merchant in XAgent Pay Core's database so it appears in `GET /api/agents`:

```bash
curl -X POST https://api.xagentpay.com/api/market/register \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_did": "did:xagent:20250407:<id>",
    "name": "<Display Name>",
    "description": "<one-line description>",
    "category": "<domain>.<subcategory>",
    "skill_md_url": "https://<agent>.onrender.com/skill.md",
    "skill_user_url": "https://<agent>.onrender.com/skill-user.md",
    "mcp_endpoint": "https://<agent>.onrender.com/mcp",
    "currencies": ["USDC"],
    "payment_address": "0x<address>",
    "portal_token": "<PORTAL_TOKEN>"
  }'
```

## Workflow: Update URLs After Redeployment

When a Render service gets a new URL slug, update these files:

| File | What to change |
|------|---------------|
| `src/<agent>/skill.md` | `url` in MCP Connection JSON, skill-user.md link |
| `src/<agent>/skill-user.md` | Base URL, curl examples, orchestrate/confirm URLs |
| `src/xagent-core/skill-market.md` | `skill_md_url`, `skill_user_url`, `mcp_endpoint` in example response |
| `src/xagent-website/components/Developers.tsx` | `SKILL_URL` constant |
| Render env vars | `XAGENT_CORE_URL` on agent services; `BASE_URL` on core and bot |

## Validation Checklist

Before shipping a merchant skill:

- [ ] YAML frontmatter has all required fields
- [ ] `merchant_did` format: `did:xagent:20250407:<id>`
- [ ] Each tool in frontmatter has a `role` (search / quote / status / action)
- [ ] At least one `search`, one `quote`, one `status` tool declared
- [ ] MCP Connection JSON in skill.md points to live `/mcp` endpoint
- [ ] skill-user.md Base URL matches Render service URL
- [ ] Dockerfile `COPY skill.md skill-user.md ./`
- [ ] Portal serves `GET /skill.md` (returns `text/markdown`)
- [ ] Portal serves `GET /skill-user.md` (returns `text/markdown`)
- [ ] Merchant registered in XAgent Pay Core (appears in `/api/agents`)

## Additional Resources

- Full NMSS spec: [docs/rfcs/cn/RFC-008-XAgent Pay-Merchant-Skill-Standard.md](../../docs/rfcs/cn/RFC-008-XAgent Pay-Merchant-Skill-Standard.md)
- Merchant skill template: [merchant-skill-template.md](merchant-skill-template.md)
- Render deployment reference: [render-deployment.md](render-deployment.md)
- Category taxonomy: travel.flights / travel.hotels / food.delivery / shopping.electronics / services.saas / entertainment.tickets
