---
name: xagent-esim
version: "1.0.0"
description: Global eSIM data plans for 190+ countries. Instant activation, pay with USDC on XLayer.
merchant_did: "did:nexus:196:demo_esim"
protocol: NUPS/1.5
category: telecom.esim
currencies: [USDC]
chain_id: 196
tools:
  - name: search_and_quote
    role: search+quote
  - name: search_esim_plans
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# XAgent eSIM Agent — MCP Skill

Global eSIM data plan merchant agent powered by XAgent Pay. Search eSIM plans by country, generate NUPS payment quotes, verify on-chain payments, and deliver activation QR codes.

## MCP Connection

```json
{
  "mcpServers": {
    "esim-agent": {
      "url": "https://xagenpay.com/esim/mcp"
    }
  }
}
```

Transport: **Streamable HTTP** (stateless, single `POST /mcp` per request).

## Available Tools

### `search_and_quote` (role: search+quote) — Recommended

Search eSIM plans AND generate a NUPS quote in one call. Fastest way to get an eSIM quote.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `country` | string | Yes | Country name or code (e.g. `Japan`, `JP`, `Thailand`, `US`) |
| `days` | number | No | Minimum validity in days (optional filter) |
| `data_gb` | number | No | Minimum data allowance in GB (optional filter) |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of plan to quote (default: `0`). Call again with a different index to re-quote |

**Returns:** All available plans + a ready-to-use `QUOTE_JSON` for the selected plan.

**Example:**
```
search_and_quote({ country: "Japan", payer_wallet: "0x..." })
```

---

### `search_esim_plans` (role: search)

Search available eSIM data plans by country. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `country` | string | Yes | Country name or code (e.g. `Japan`, `JP`) |
| `days` | number | No | Minimum validity in days |
| `data_gb` | number | No | Minimum data in GB |

---

### `nexus_generate_quote` (role: quote)

Generate a NUPS quote for a selected eSIM plan. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `esim_offer_id` | string | Yes | The `offer_id` from `search_esim_plans` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

---

### `nexus_check_status` (role: status)

Checks the payment status of an eSIM order. If paid, returns the eSIM activation QR code.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `ESIM-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary. When `PAID`, also includes eSIM QR code data URL and activation code.

## Checkout Workflow

**Fast path (recommended):**
1. **Search + Quote** — Call `search_and_quote` with country and payer wallet. Returns plans + ready-to-use quote.
2. **Pay** — Call `nexus_orchestrate_payment` on XAgent Pay Core with the `QUOTE_JSON` from step 1.
3. **Verify** — Call `nexus_check_status` to verify. When status is `PAID`, the response includes the eSIM activation QR code.

## Supported Countries

Japan, Thailand, Singapore, South Korea, United States, United Kingdom, and 180+ more via global roaming.
