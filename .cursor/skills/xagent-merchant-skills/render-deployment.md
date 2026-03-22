# Render Deployment & Merchant Registration Reference

## Current Deployed Services

| Service Name (render.yaml) | Type | URL | Health |
|---------------------------|------|-----|--------|
| `nexuspay-db` | PostgreSQL | — (internal) | — |
| `xagent-website` | Static (Vite) | https://xagentpay.com (assumed) | — |
| `xagent-core` | Docker | https://api.xagentpay.com | `/health` |
| `nexus-hotel-agent` | Docker | https://nexus-hotel-agent-d2lj.onrender.com | — |
| `nexus-flight-agent` | Docker | https://nexus-flight-agent-3xb1.onrender.com | — |
| `nexus-telegram-bot` | Docker | https://nexus-telegram-bot-<id>.onrender.com | `/health` |

## Environment Variables Summary

### xagent-core (required secrets — set manually in Render dashboard)

| Env Var | Description |
|---------|-------------|
| `RELAYER_PRIVATE_KEY` | Private key of the Core Operator EOA (`0xaC9d5239...`) — signs group approvals and relays transactions |
| `ESCROW_CONTRACT` | `0x49F9ad8F2c480F8cF9e02b30f8c634F004372cc2` (UUPS proxy on XLayer) |
| `RPC_URL` | `https://rpc.xlayer.tech` (XLayer Mainnet) |
| `PORTAL_TOKEN` | Secret token required to call `/api/market/register` |
| `BASE_URL` | Public URL of this service, e.g. `https://api.xagentpay.com` |

### nexus-hotel-agent & nexus-flight-agent (required secrets)

| Env Var | Description |
|---------|-------------|
| `AMADEUS_API_KEY` | Amadeus hotel search API key (hotel agent only) |
| `AMADEUS_API_SECRET` | Amadeus API secret (hotel agent only) |
| `DUFFEL_API_TOKEN` | Duffel flight search API token (flight agent only) |
| `MERCHANT_SIGNER_PRIVATE_KEY` | Private key for signing NUPS quotes (EIP-712) |
| `XAGENT_CORE_URL` | `https://api.xagentpay.com` |

### nexus-telegram-bot (required secrets)

| Env Var | Description |
|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `XAGENT_CORE_URL` | `https://api.xagentpay.com` |
| `BASE_URL` | Public URL of this bot service |

## Deploying a New Merchant Agent

### 1. Add to render.yaml

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
      value: "0x<your_payment_address>"
    - key: MERCHANT_DID
      value: "did:xagent:20250407:<merchant_id>"
    - key: XAGENT_CORE_URL
      sync: false
```

### 2. Commit & Push → Render auto-deploys

Render picks up the new service from `render.yaml` and builds via Docker.

### 3. Set secret env vars in Render Dashboard

Go to: https://dashboard.render.com → your service → Environment

Set values for all `sync: false` vars.

### 4. Register Merchant with XAgent Pay Core

After service is live, register in Core's marketplace DB:

```bash
# Get the PORTAL_TOKEN from Render Dashboard (xagent-core service env vars)
PORTAL_TOKEN="<your_portal_token>"
AGENT_URL="https://nexus-<category>-agent-<id>.onrender.com"

curl -X POST https://api.xagentpay.com/api/market/register \
  -H "Content-Type: application/json" \
  -d "{
    \"merchant_did\": \"did:xagent:20250407:<merchant_id>\",
    \"name\": \"<Display Name>\",
    \"description\": \"<one-line description>\",
    \"category\": \"<domain>.<subcategory>\",
    \"skill_md_url\": \"${AGENT_URL}/skill.md\",
    \"skill_user_url\": \"${AGENT_URL}/skill-user.md\",
    \"mcp_endpoint\": \"${AGENT_URL}/mcp\",
    \"currencies\": [\"USDC\"],
    \"payment_address\": \"0x<address>\",
    \"portal_token\": \"${PORTAL_TOKEN}\"
  }"
```

### 5. Verify Registration

```bash
# Should return the new agent in the list
curl "https://api.xagentpay.com/api/agents?query=<merchant_id>"

# Fetch the agent's skill.md via Core proxy
curl "https://api.xagentpay.com/api/agents/did:xagent:20250407:<merchant_id>/skill"
```

## Checking Health

```bash
# Core health
curl https://api.xagentpay.com/health

# Agent health (portal root)
curl https://nexus-flight-agent-3xb1.onrender.com/
curl https://nexus-hotel-agent-d2lj.onrender.com/

# List all registered merchants
curl https://api.xagentpay.com/api/agents

# Check marketplace (website reads from this)
curl "https://api.xagentpay.com/api/agents?limit=50"
```

## Updating skill.md URLs After Redeployment

When Render assigns a new URL slug (e.g. after deleting and re-creating a service):

1. Update `src/<agent>/skill.md`:
   - MCP Connection `url` field
   - Link to `skill-user.md`

2. Update `src/<agent>/skill-user.md`:
   - `Base URL` heading
   - All curl examples
   - Orchestrate/confirm URLs in Checkout Workflow

3. Update `src/xagent-core/skill-market.md`:
   - `skill_md_url`, `skill_user_url`, `mcp_endpoint` in the example response block

4. Update `src/xagent-website/components/Developers.tsx`:
   - `SKILL_URL` constant (if it points to an agent URL)

5. Update merchant registration in Core DB:
   - Re-run the registration curl command above with the new URL

6. Update Render env vars:
   - `XAGENT_CORE_URL` on each agent service (if Core URL changed)
   - `BASE_URL` on xagent-core and telegram-bot (if their own URL changed)

## On-Chain References

| Contract | Address | Network |
|----------|---------|---------|
| xXAgent PayEscrow (UUPS Proxy) | `0x49F9ad8F2c480F8cF9e02b30f8c634F004372cc2` | XLayer Mainnet (196) |
| xXAgent PayEscrow (Impl v4.0.0) | `0x81CF9E0d2c1ad879c24b19815Ec803015D5B2e9b` | XLayer Mainnet (196) |
| USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` | XLayer Mainnet (196) |
| Core Operator | `0xaC9d5239b597f8903DA93b9B8D92E6CfF564e989` | XLayer Mainnet (196) |
| Flight Merchant Payment | `0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1` | XLayer Mainnet (196) |
| Hotel Merchant Payment | `0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd` | XLayer Mainnet (196) |

RPC: `https://rpc.xlayer.tech`  
Explorer: `https://www.oklink.com/xlayer`
