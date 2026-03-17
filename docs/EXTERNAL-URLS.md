# xXAgent Pay External URLs & API Reference

All public-facing URLs, endpoints, and skill.md files for the xXAgent Pay platform.

---

## Deployed Services

| Service | URL | Type |
|---------|-----|------|
| Website | `https://xagentpay.com` | Static SPA (Vite + React) |
| XAgent Pay Core API | `https://api.xagentpay.com` | MCP Server + HTTP API |
| Flight Agent | `https://nexus-flight-agent-3xb1.onrender.com` | MCP Merchant Agent |
| Hotel Agent | `https://nexus-hotel-agent-d2lj.onrender.com` | MCP Merchant Agent |
| Telegram Bot | `https://nexus-telegram-bot-8fzu.onrender.com` | Telegram Integration |

---

## Skill.md Files

Each service provides two skill files: **skill.md** (MCP connection + tool definitions) and **skill-user.md** (HTTP REST API docs).

| Skill | URL | Description |
|-------|-----|-------------|
| XAgent Pay Core (MCP) | `https://api.xagentpay.com/skill.md` | MCP connection + 9 tool definitions |
| XAgent Pay Core (HTTP) | `https://api.xagentpay.com/skill-user.md` | HTTP REST API with curl examples |
| Flight Agent (MCP) | `https://nexus-flight-agent-3xb1.onrender.com/skill.md` | MCP connection + 3 tool definitions |
| Flight Agent (HTTP) | `https://nexus-flight-agent-3xb1.onrender.com/skill-user.md` | HTTP REST API with curl examples |
| Hotel Agent (MCP) | `https://nexus-hotel-agent-d2lj.onrender.com/skill.md` | MCP connection + 3 tool definitions |
| Hotel Agent (HTTP) | `https://nexus-hotel-agent-d2lj.onrender.com/skill-user.md` | HTTP REST API with curl examples |
| LINE Messaging | `https://api.xagentpay.com/skills/nexus-line-skill.md` | LINE Flex Message skill |
| Telegram Bot | `https://nexus-telegram-bot-8fzu.onrender.com/skill.md` | Telegram bot skill |

---

## Website Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `https://xagentpay.com/#/` | Landing page |
| Marketplace | `https://xagentpay.com/#/market` | Agent marketplace (discover & register) |

---

## XAgent Pay Core API Endpoints

### Health & Status

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Quick health check (no I/O) |
| GET | `/api/health` | None | Detailed health with relayer balance |

### MCP Transport (Streamable HTTP)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/mcp` | None | Stateless Streamable HTTP transport for MCP |

### Payment Orchestration

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/orchestrate` | None | Create payment group, returns 402 with checkout instructions |
| POST | `/api/merchant/confirm-fulfillment` | None | Merchant triggers escrow release after fulfillment |

### Checkout Flow

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/checkout/:token` | None | Checkout HTML page (token = `tok_*`, `GRP-*`, `grp_*`) |
| GET | `/api/checkout/:token` | None | Checkout data as JSON |
| POST | `/api/checkout/:token/confirm` | None | Submit user's on-chain tx hash |

### Portal Dashboard (Admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Bearer | Dashboard HTML page |
| GET | `/api/payments` | Bearer | List payments (filters: `group_id`, `merchant_order_ref`, `nexus_payment_id`) |
| GET | `/api/payments/:id` | Bearer | Single payment detail (id = `PAY-*`) |
| GET | `/api/groups` | Bearer | List payment groups |
| GET | `/api/groups/:id` | Bearer | Group detail (id = `GRP-*` / `grp_*`) |
| GET | `/api/stats` | Bearer | Payment statistics |
| GET | `/api/relayer` | Bearer | Relayer account info + LAT balance |

### Merchant Reconciliation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/merchant/payments` | None | Query payments by `merchant_did`, `since`, `status`, `group_id` |

### Agent Discovery

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents` | None | List all registered merchant agents |
| GET | `/api/agents/:did/skill` | None | Fetch agent's skill.md content |

### Marketplace API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/market` | None | Marketplace HTML page |
| GET | `/api/market/agents` | None | List all market agents (filters: `category`, `status`) |
| GET | `/api/market/agents/:did` | None | Single agent detail |
| POST | `/api/market/register` | Bearer | Register new merchant (unified payment + marketplace) |
| POST | `/api/market/agents/:did/star` | None | Star an agent (body: `{ wallet_address }`) |
| DELETE | `/api/market/agents/:did/star` | None | Remove star (body: `{ wallet_address }`) |
| GET | `/api/market/agents/:did/stars` | None | Get star info (query: `wallet_address`) |

### Debug

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/debug/last-errors` | None | Last orchestration errors |

---

## Merchant Agent Endpoints (Flight / Hotel)

Both agents expose identical endpoint patterns:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/mcp` | None | Stateless Streamable HTTP transport for MCP |
| POST | `/api/v1/call-tool` | None | Stateless tool invocation (`{ tool, arguments }`) |
| GET | `/skill.md` | None | MCP skill (connection + tool definitions) |
| GET | `/skill-user.md` | None | HTTP REST API skill (curl examples) |
| GET | `/health` | None | Health check |
| POST | `/webhook` | HMAC | Payment event webhook receiver |

**Flight Agent MCP Tools:** `search_flights`, `xagent_generate_quote`, `xagent_check_status`
**Hotel Agent MCP Tools:** `search_hotels`, `xagent_generate_quote`, `xagent_check_status`

---

## Telegram Bot Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/render-order` | None | Render payment order as Telegram Flex Message |
| GET | `/health` | None | Health check (returns `active_polls` count) |
| GET | `/skill.md` | None | Bot skill documentation |

---

## On-Chain Addresses (XLayer Devnet, chainId 20250407)

| Contract | Address |
|----------|---------|
| USDC (FiatToken Proxy) | `0xFF8dEe9983768D0399673014cf77826896F97e4d` |
| xXAgent PayEscrow (UUPS Proxy) | `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236` |
| Relayer/Owner | `0xf7EA5d3f0Bf8185c4f3C2F405D9a71009CF4D920` |
| RPC | `https://devnet3openapi.platon.network/rpc` |

---

## Authentication

- **Bearer Token:** Portal dashboard and merchant registration require `Authorization: Bearer <PORTAL_TOKEN>` header
- **CORS:** All API endpoints support `Access-Control-Allow-Origin: *`
- **Webhook HMAC:** Merchant webhook deliveries are signed with `X-XAgent Pay-Signature` header

## ID Formats

| Type | Pattern | Example |
|------|---------|---------|
| Payment ID | `PAY-*` | `PAY-abc123def` |
| Group ID | `GRP-*` / `grp_*` | `GRP-20250302-xyz` |
| Checkout Token | `tok_*` / `GRP-*` / `grp_*` | `tok_abc123` |
| Merchant DID | `did:nexus:<chainId>:<name>` | `did:nexus:20250407:demo_flight` |
