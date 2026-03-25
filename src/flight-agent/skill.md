---
name: xagent-flight
version: "2.0.0"
description: Flight booking agent — search free, purchase with x402 payment on XLayer
merchant_did: "did:xagent:196:demo_flight"
protocol: x402/2
category: travel.flights
currencies: [USDC]
chain_id: 196
payment_address: "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1"
x402:
  version: 2
  scheme: exact
  network: "eip155:196"
  asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22"
  assetTransferMethod: eip3009
tools:
  - name: search_and_quote
    role: search (free)
  - name: search_flights
    role: search (free)
  - name: purchase_flight
    role: purchase (x402)
---

# XAgent Flight Booking

Flight booking on XLayer. **Search is free. Purchase uses x402 on-chain payment.**

---

## MCP Connection (Recommended)

Add to your MCP config to use tool calls directly:

```json
{
  "mcpServers": {
    "xagent-flight": {
      "url": "https://xagenpay.com/flight/mcp"
    }
  }
}
```

Then call tools: `search_and_quote`, `search_flights`, `purchase_flight`

---

## OKX Onchain OS — Complete Workflow

If you have OKX Onchain OS skills loaded, follow this exact sequence:

### Step 1 — Search flights (FREE, no payment)

```bash
curl -X GET "https://xagenpay.com/flight/api/search?origin=SIN&destination=BKK&date=2026-03-26&passengers=1"
```

Or POST:
```bash
curl -X POST https://xagenpay.com/flight/api/search \
  -H "Content-Type: application/json" \
  -d '{"origin":"SIN","destination":"BKK","date":"2026-03-26","passengers":1}'
```

Response:
```json
{
  "flights": [
    { "offer_id": "FLT-abc123", "airline": "Thai Airways", "flight_number": "TG401",
      "origin": "SIN", "destination": "BKK",
      "departure_time": "2026-03-26T08:00:00", "arrival_time": "2026-03-26T09:30:00",
      "price": { "amount": "1.00", "currency": "USDC" } }
  ],
  "text": "Available Flights:\n1. [FLT-abc123] Thai Airways TG401 ..."
}
```

**Pick an offer_id from the response.**

### Step 2 — Trigger purchase to get payment requirement

```bash
curl -X POST https://xagenpay.com/flight/api/purchase/flights \
  -H "Content-Type: application/json" \
  -d '{"offer_id":"FLT-abc123","payer_wallet":"0xYOUR_WALLET"}'
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
    "amount": "1000000",
    "payTo": "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1",
    "maxTimeoutSeconds": 300
  }]
}
```

### Step 3 — Sign with OKX Onchain OS

```bash
onchainos payment x402-pay \
  --network eip155:196 \
  --amount 1000000 \
  --pay-to 0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1 \
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
curl -X POST https://xagenpay.com/flight/api/purchase/flights \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <headerValue>" \
  -d '{"offer_id":"FLT-abc123","payer_wallet":"0xYOUR_WALLET"}'
```

Response: **HTTP 200**
```json
{
  "status": "booked",
  "confirmation": "FLT-K3X9P",
  "flight": { "airline": "Thai Airways", "flight_number": "TG401" },
  "price_paid_usdc": "1.00",
  "payment_tx": "0xabc...",
  "network": "eip155:196"
}
```

---

## MCP Tool Reference

### `search_and_quote` / `search_flights` — FREE

```typescript
search_and_quote({ origin: "SIN", destination: "BKK", date: "2026-03-26", passengers: 1 })
```

Returns flight list with offer IDs and prices. No payment required.

### `purchase_flight` — x402 Payment

```typescript
purchase_flight({ offer_id: "FLT-abc123", payer_wallet: "0x..." })
```

- **First call (no `_meta["x402/payment"]`)** — returns PaymentRequired with exact USDC price
- **Second call (with `_meta["x402/payment"]` containing signed EIP-3009)** — on-chain settlement + booking confirmation

---

## Supported Routes

SIN (Singapore), BKK (Bangkok), NRT (Tokyo Narita), HND (Tokyo Haneda),
PVG (Shanghai Pudong), HKG (Hong Kong), and connecting routes.

---

## Network & Payment

| Field | Value |
|-------|-------|
| Network | XLayer Mainnet (eip155:196) |
| Payment Token | USDC `0x74b7F16337b8972027F6196A17a631aC6dE26d22` |
| Merchant | `0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1` |
| Method | EIP-3009 `transferWithAuthorization` |
| Price | Exact flight price (varies, typically 1–3 USDC (demo)) |
