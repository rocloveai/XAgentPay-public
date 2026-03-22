# NMSS Merchant Skill Template

Copy these two files into your new merchant agent's package root directory.

---

## File 1: `skill.md` (MCP tool definitions)

```markdown
---
name: nexus-<category>-agent
version: "0.1.0"
description: <Category> booking MCP agent — search <items>, generate NUPS quotes, verify on-chain payments
merchant_did: "did:xagent:20250407:<merchant_id>"
protocol: NUPS/1.5
category: <domain>.<subcategory>
currencies: [USDC]
chain_id: 20250407
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

# XAgent Pay <Category> Agent — MCP Skill

<2-3 sentence description of what this merchant agent does and what it provides.>

> For HTTP REST API docs (no MCP client required), see [skill-user.md](https://<agent>.onrender.com/skill-user.md).

## MCP Connection

\`\`\`json
{
  "mcpServers": {
    "<agent-name>": {
      "url": "https://<agent>.onrender.com/mcp"
    }
  }
}
\`\`\`

Transport: **Streamable HTTP** (stateless, single `POST /mcp` per request).

## Available Tools

### `search_and_quote` (role: search+quote) — Recommended

Search <items> AND generate a NUPS quote in one call. Fastest way to get a quote.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<param1>` | string | Yes | <description> |
| `<param2>` | string | Yes | <description, e.g. date YYYY-MM-DD> |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of item to quote (default: `0`). Call again with different index to re-quote |

**Returns:** All available <items> + a ready-to-use `QUOTE_JSON` for the selected item.

**Example:**
\`\`\`
search_and_quote({ <param1>: "<value>", <param2>: "2026-04-01", payer_wallet: "0x..." })
\`\`\`

---

### `search_<items>` (role: search)

Search available <items>. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<param1>` | string | Yes | <description> |
| `<param2>` | string | Yes | <description> |

---

### `xagent_generate_quote` (role: quote)

Generate a NUPS quote for a selected <item> offer. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<item>_offer_id` | string | Yes | The `offer_id` from `search_<items>` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

---

### `xagent_check_status` (role: status)

Checks the payment status of a <category> order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `<PREFIX>-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow

**Fast path (recommended):**
1. **Search + Quote** — Call `search_and_quote` with required params + payer wallet. Returns <items> + ready-to-use quote.
2. **Pay** — Call `xagent_orchestrate_payment` on XAgent Pay Core with the `QUOTE_JSON` from step 1. Multiple quotes from different merchants can be combined into a single call.
3. **Verify** — Call `xagent_check_status` to verify. Only confirm booking when status is `PAID`.
```

---

## File 2: `skill-user.md` (HTTP REST API, no MCP client required)

```markdown
---
name: nexus-<category>-agent
version: "0.1.0"
description: <Category> booking HTTP REST API — search <items>, generate NUPS quotes, verify payments
merchant_did: "did:xagent:20250407:<merchant_id>"
protocol: NUPS/1.5
category: <domain>.<subcategory>
currencies: [USDC]
chain_id: 20250407
---

# XAgent Pay <Category> Agent — HTTP REST API

<Category> booking merchant agent powered by XAgent Pay. **No MCP client required** — all tools are available via HTTP POST.

> For MCP connection config and tool definitions, see [skill.md](https://<agent>.onrender.com/skill.md).

**Base URL:** `https://<agent>.onrender.com`

## Call Tool Endpoint

**`POST /api/v1/call-tool`**

All agent tools are invoked via this single endpoint.

\`\`\`json
{
  "tool": "tool_name",
  "arguments": { ... }
}
\`\`\`

## Available Tools

### `search_and_quote` (Recommended — Fast Path)

Search <items> AND generate a NUPS quote in ONE call.

\`\`\`bash
curl -X POST https://<agent>.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_and_quote",
    "arguments": {
      "<param1>": "<value>",
      "<param2>": "2026-04-01",
      "payer_wallet": "0xYourWalletAddress"
    }
  }'
\`\`\`

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<param1>` | string | Yes | <description> |
| `<param2>` | string | Yes | <description> |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index (default: `0`). Call again with different index to re-quote |

**Returns:** All available <items> + a ready-to-use NUPS quote (QUOTE_JSON). The quote can be passed directly to `xagent_orchestrate_payment`.

---

### `search_<items>`

Search available <items> (without quote). Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<param1>` | string | Yes | <description> |

---

### `xagent_generate_quote`

Generate a NUPS quote for a selected <item> offer.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `<item>_offer_id` | string | Yes | The `offer_id` from `search_<items>` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** UCP Checkout Response containing a NUPS quote payload.

---

### `xagent_check_status`

Check the payment status of a <category> order.

\`\`\`bash
curl -X POST https://<agent>.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "xagent_check_status",
    "arguments": {
      "order_ref": "<PREFIX>-abc123"
    }
  }'
\`\`\`

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `<PREFIX>-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow (HTTP)

**Fast path (recommended):**
1. **Search + Quote** — `POST /api/v1/call-tool` with `search_and_quote` tool (returns quote directly).
2. **Pay** — `POST https://api.xagentpay.com/api/orchestrate` with the quote + payer wallet.
3. **Confirm** — `POST https://api.xagentpay.com/api/checkout/:token/confirm` with `tx_hash`.
4. **Verify** — `POST /api/v1/call-tool` with `xagent_check_status` to confirm `PAID` status.
```
