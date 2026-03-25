---
name: xagent-esim
version: "2.0.0"
description: Global eSIM agent — search free, purchase with x402 payment on XLayer
merchant_did: "did:xagent:196:demo_esim"
protocol: x402/2
category: travel.esim
currencies: [USDC]
chain_id: 196
payment_address: "0xac9d5239b597f8903da93b9b8d92e6cff564e989"
x402:
  version: 2
  scheme: exact
  network: "eip155:196"
  asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22"
  assetTransferMethod: eip3009
tools:
  - name: search_and_quote
    role: search (free)
  - name: search_esim_plans
    role: search (free)
  - name: purchase_esim
    role: purchase (x402)
---

# XAgent eSIM

Global eSIM data plans for 190+ countries on XLayer. **Search is free. Purchase uses x402 on-chain payment.**

---

## MCP Connection (Recommended)

Add to your MCP config to use tool calls directly:

```json
{
  "mcpServers": {
    "xagent-esim": {
      "url": "https://xagenpay.com/esim/mcp"
    }
  }
}
```

Then call tools: `search_and_quote`, `search_esim_plans`, `purchase_esim`

---

## OKX Onchain OS — Complete Workflow

If you have OKX Onchain OS skills loaded, follow this exact sequence:

### Step 1 — Search eSIM plans (FREE, no payment)

```bash
curl -X GET "https://xagenpay.com/esim/api/search?country=Thailand&data_gb=5"
```

Or POST:
```bash
curl -X POST https://xagenpay.com/esim/api/search \
  -H "Content-Type: application/json" \
  -d '{"country":"Thailand","data_gb":5}'
```

Response:
```json
{
  "plans": [
    { "offer_id": "ESIM-abc123", "country": "Thailand", "country_code": "TH",
      "data_gb": 5, "days": 15, "network": "AIS/DTAC",
      "provider": "Airalo",
      "price": { "amount": "0.50", "currency": "USDC" } }
  ],
  "text": "eSIM Plans for Thailand:\n1. [ESIM-abc123]\n   Thailand (TH) | 5GB / 15 days ..."
}
```

**Pick an offer_id from the response.**

### Step 2 — Trigger purchase to get payment requirement

```bash
curl -X POST https://xagenpay.com/esim/api/purchase/esim \
  -H "Content-Type: application/json" \
  -d '{"plan_id":"ESIM-abc123","payer_wallet":"0xYOUR_WALLET"}'
```

Response: **HTTP 402** with base64-encoded body:
```
eyJ4NDAyVmVyc2lvbiI6MiwiYWNjZXB0cyI6W3sic2NoZW1lIjoiZXhhY3QiLCJuZXR3b3JrIjoiZWlwMTU1OjE5NiIs...
```

Decode it:
```json
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:196",
    "asset": "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
    "amount": "500000",
    "payTo": "0xac9d5239b597f8903da93b9b8d92e6cff564e989",
    "maxTimeoutSeconds": 300
  }]
}
```

### Step 3 — Sign with OKX Onchain OS

```bash
onchainos payment x402-pay \
  --network eip155:196 \
  --amount 500000 \
  --pay-to 0xac9d5239b597f8903da93b9b8d92e6cff564e989 \
  --asset 0x74b7F16337b8972027F6196A17a631aC6dE26d22 \
  --max-timeout-seconds 300
```

Returns: `{ "signature": "0x...", "authorization": { "from": "0x...", "to": "0x...", ... } }`

### Step 4 — Assemble PAYMENT-SIGNATURE header

```javascript
const decoded = JSON.parse(atob(http402Body));
const paymentPayload = { ...decoded, payload: { signature, authorization } };
const headerValue = btoa(JSON.stringify(paymentPayload));
```

### Step 5 — Replay with payment

```bash
curl -X POST https://xagenpay.com/esim/api/purchase/esim \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <headerValue>" \
  -d '{"plan_id":"ESIM-abc123","payer_wallet":"0xYOUR_WALLET"}'
```

Response: **HTTP 200**
```json
{
  "status": "activated",
  "confirmation": "ESIM-K3X9P",
  "plan": { "country": "Thailand", "data_gb": 5, "days": 15, "provider": "Airalo" },
  "price_paid_usdc": "0.50",
  "payment_tx": "0xabc...",
  "network": "eip155:196"
}
```

---

## MCP Tool Reference

### `search_and_quote` / `search_esim_plans` — FREE

```typescript
search_and_quote({ country: "Thailand", data_gb: 5 })
```

Returns eSIM plan list with offer IDs, data allowance, validity, network, and prices. No payment required.

### `purchase_esim` — x402 Payment

```typescript
purchase_esim({ plan_id: "ESIM-abc123", payer_wallet: "0x..." })
```

- **First call (no `_meta["x402/payment"]`)** — returns PaymentRequired with exact USDC price
- **Second call (with `_meta["x402/payment"]` containing signed EIP-3009)** — on-chain settlement + eSIM activation confirmation

---

## Supported Countries

Japan, Thailand, Singapore, South Korea, United States, United Kingdom, and 180+ more via global roaming.

---

## Network & Payment

| Field | Value |
|-------|-------|
| Network | XLayer Mainnet (eip155:196) |
| Payment Token | USDC `0x74b7F16337b8972027F6196A17a631aC6dE26d22` |
| Merchant | `0xac9d5239b597f8903da93b9b8d92e6cff564e989` |
| Method | EIP-3009 `transferWithAuthorization` |
| Price | 0.50 USDC (demo) |
