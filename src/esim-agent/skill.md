---
name: xagent-esim
version: "2.0.0"
description: Global eSIM data plans for 190+ countries. Instant activation, pay with USDC on XLayer. Supports x402 payment protocol.
merchant_did: "did:xagent:196:demo_esim"
protocol: NUPS/1.5
category: telecom.esim
currencies: [USDC]
chain_id: 196
x402:
  version: 2
  scheme: exact
  network: "eip155:196"
  asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22"
  assetTransferMethod: eip3009
  description: "Supports x402 payment protocol. Tools accept payment via _meta['x402/payment']."
tools:
  - name: search_and_quote
    role: search+quote+x402
  - name: search_esim_plans
    role: search
  - name: xagent_generate_quote
    role: quote+x402
  - name: xagent_check_status
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

### `search_and_quote` (role: search+quote+x402) — Recommended

Search eSIM plans AND generate a quote in one call. Supports **x402 payment protocol** — include `_meta["x402/payment"]` with a signed EIP-3009 `transferWithAuthorization` to pay and receive the eSIM instantly.

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

### `xagent_generate_quote` (role: quote)

Generate a NUPS quote for a selected eSIM plan. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `esim_offer_id` | string | Yes | The `offer_id` from `search_esim_plans` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

---

### `xagent_check_status` (role: status)

Checks the payment status of an eSIM order. If paid, returns the eSIM activation QR code.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `ESIM-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary. When `PAID`, also includes eSIM QR code data URL and activation code.

## Checkout Workflow

**Fast path (recommended):**
1. **Search + Quote** — Call `search_and_quote` with country and payer wallet. Returns plans + ready-to-use quote.
2. **Pay** — Call `xagent_orchestrate_payment` on XAgent Pay Core with the `QUOTE_JSON` from step 1.
3. **Verify** — Call `xagent_check_status` to verify. When status is `PAID`, the response includes the eSIM activation QR code.

## x402 Payment Protocol

This agent supports the **x402 payment protocol** (v2) for direct on-chain payments via MCP tool calls.

**How it works:**
1. Call `search_and_quote` without payment → returns search results + `PaymentRequired` (402)
2. Sign an EIP-3009 `transferWithAuthorization` with the payment details
3. Call `search_and_quote` again with `_meta["x402/payment"]` containing the signed authorization
4. Agent verifies signature → settles on-chain → returns results + `_meta["x402/payment-response"]` with TX hash

**Payment Details:**
- Network: XLayer (eip155:196)
- Asset: USDC (`0x74b7F16337b8972027F6196A17a631aC6dE26d22`)
- Method: EIP-3009 `transferWithAuthorization`
- Amount: 0.10 USDC (demo)

## HTTP REST Endpoint (OKX OnchainOS x402)

This agent also exposes a plain HTTP endpoint compatible with the **OKX OnchainOS x402 skill** standard. No MCP client required.

**Endpoint:** `POST https://xagenpay.com/esim/api/search`

**Flow:**

1. **No payment header** → HTTP 402 response with base64-encoded payment requirements body
2. **With `PAYMENT-SIGNATURE` header** (base64-encoded x402 payload) → HTTP 200 with eSIM plan results

**Request body (JSON):**
```json
{
  "country": "Japan",
  "days": 7,
  "data_gb": 5
}
```

**HTTP 402 response body** (base64-decoded):
```json
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:196",
    "asset": "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
    "amount": "<price_in_atomic_usdc>",
    "payTo": "<merchant_address>",
    "maxTimeoutSeconds": 300
  }]
}
```

**HTTP 200 response body:**
```json
{
  "plans": [...],
  "text": "eSIM Plans for Japan:\n...",
  "payment_tx": "0x...",
  "network": "eip155:196"
}
```

**Headers:**
- `PAYMENT-SIGNATURE`: base64-encoded JSON containing `accepts` array and `payload` with `signature` and `authorization` fields (EIP-3009)
- Alternative: `X-PAYMENT` header (same format)

## Supported Countries

Japan, Thailand, Singapore, South Korea, United States, United Kingdom, and 180+ more via global roaming.
