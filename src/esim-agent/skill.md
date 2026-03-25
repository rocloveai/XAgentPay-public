---
name: xagent-esim
version: "2.0.0"
description: Global eSIM data plans for 190+ countries. Search for free, purchase with x402 payment. Pure x402 protocol.
merchant_did: "did:xagent:196:demo_esim"
protocol: x402/2
category: telecom.esim
currencies: [USDC]
chain_id: 196
x402:
  version: 2
  scheme: exact
  network: "eip155:196"
  asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22"
  assetTransferMethod: eip3009
  description: "x402 payment on purchase_esim only. Search is free."
tools:
  - name: search_and_quote
    role: search (free)
  - name: search_esim_plans
    role: search (free)
  - name: purchase_esim
    role: purchase+x402
---

# XAgent eSIM Agent — MCP Skill

Global eSIM data plan merchant agent powered by XAgent Pay. Search eSIM plans by country for free, then purchase with direct x402 on-chain payment and receive instant activation.

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

### `search_and_quote` (FREE) — Recommended starting point

Search available eSIM data plans by country. Returns a list of plans with data allowance, validity, network, and pricing. **No payment required.**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `country` | string | Yes | Country name or code (e.g. `Japan`, `JP`, `Thailand`, `US`) |
| `days` | number | No | Minimum validity in days (optional filter) |
| `data_gb` | number | No | Minimum data allowance in GB (optional filter) |

**Returns:** All available eSIM plans with offer IDs and prices. Instructions to call `purchase_esim` with a chosen plan.

**Example:**
```
search_and_quote({ country: "Japan" })
```

---

### `search_esim_plans` (FREE)

Search available eSIM data plans. Same as `search_and_quote`. No payment required.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `country` | string | Yes | Country name or code (e.g. `Japan`, `JP`) |
| `days` | number | No | Minimum validity in days |
| `data_gb` | number | No | Minimum data in GB |

---

### `purchase_esim` (x402 payment required)

Purchase an eSIM plan using x402 EIP-3009 on-chain payment. The payment amount equals the exact plan price in USDC.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `plan_id` | string | Yes | eSIM plan offer ID from `search_and_quote` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Flow:**
1. First call (no payment) → returns `PaymentRequired` (402) with exact USDC amount
2. Sign EIP-3009 `transferWithAuthorization` for the exact price
3. Second call with `_meta["x402/payment"]` → agent verifies, settles on-chain, returns activation confirmation + TX hash

**Returns:** eSIM activation confirmation with plan details, TX hash, activation code, and confirmation number.

---

## Purchase Workflow

1. **Search** — Call `search_and_quote` with country. Returns eSIM plan list with offer IDs. **Free.**
2. **Purchase** — Call `purchase_esim(plan_id, payer_wallet)` → get payment requirements (exact price in USDC)
3. **Pay** — Sign EIP-3009 authorization for the exact price, re-call with `_meta["x402/payment"]`
4. **Done** — Agent verifies on-chain, returns activation details instantly

## x402 Payment Protocol

This agent uses the **x402 payment protocol** (v2) exclusively for purchases.

**Payment Details:**
- Network: XLayer (eip155:196)
- Asset: USDC (`0x74b7F16337b8972027F6196A17a631aC6dE26d22`)
- Method: EIP-3009 `transferWithAuthorization`
- Amount: Exact plan price (varies per plan)

## HTTP REST Endpoints

### Search (FREE)

**Endpoint:** `POST https://xagenpay.com/esim/api/search`

No payment header needed. Returns eSIM plan results directly.

**Request body (JSON):**
```json
{
  "country": "Japan",
  "days": 7,
  "data_gb": 5
}
```

**HTTP 200 response body:**
```json
{
  "plans": [...],
  "text": "eSIM Plans for Japan:\n...",
  "network": "eip155:196"
}
```

### Purchase (x402)

**Endpoint:** `POST https://xagenpay.com/esim/api/purchase/esim`

**Request body (JSON):**
```json
{
  "plan_id": "<offer_id from search>",
  "payer_wallet": "0x..."
}
```

**Flow:**
1. No payment header → HTTP 402 with x402 payment requirements (exact plan price)
2. With `PAYMENT-SIGNATURE` header → HTTP 200 with activation confirmation

**HTTP 200 response body:**
```json
{
  "status": "activated",
  "confirmation": "ESIM-...",
  "plan": {...},
  "price_paid_usdc": "12.00",
  "payment_tx": "0x...",
  "network": "eip155:196"
}
```

## Supported Countries

Japan, Thailand, Singapore, South Korea, United States, United Kingdom, and 180+ more via global roaming.
