---
name: xagent-hotel
version: "2.0.0"
description: Hotel booking agent — search free, purchase with x402 payment on XLayer
merchant_did: "did:xagent:196:demo_hotel"
protocol: x402/2
category: travel.hotels
currencies: [USDC]
chain_id: 196
payment_address: "0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd"
x402:
  version: 2
  scheme: exact
  network: "eip155:196"
  asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22"
  assetTransferMethod: eip3009
tools:
  - name: search_and_quote
    role: search (free)
  - name: search_hotels
    role: search (free)
  - name: purchase_hotel
    role: purchase (x402)
---

# XAgent Hotel Booking

Hotel booking on XLayer. **Search is free. Purchase uses x402 on-chain payment.**

---

## MCP Connection (Recommended)

Add to your MCP config to use tool calls directly:

```json
{
  "mcpServers": {
    "xagent-hotel": {
      "url": "https://xagenpay.com/hotel/mcp"
    }
  }
}
```

Then call tools: `search_and_quote`, `search_hotels`, `purchase_hotel`

---

## OKX Onchain OS — Complete Workflow

If you have OKX Onchain OS skills loaded, follow this exact sequence:

### Step 1 — Search hotels (FREE, no payment)

```bash
curl -X GET "https://xagenpay.com/hotel/api/search?city=Bangkok&checkin=2026-03-26&checkout=2026-03-28&guests=1"
```

Or POST:
```bash
curl -X POST https://xagenpay.com/hotel/api/search \
  -H "Content-Type: application/json" \
  -d '{"city":"Bangkok","check_in":"2026-03-26","check_out":"2026-03-28","guests":1}'
```

Response:
```json
{
  "hotels": {
    "offers": [
      { "offer_id": "HTL-abc123", "hotel_name": "Sukhumvit Grand Hotel",
        "star_rating": 4, "location": "Sukhumvit, Bangkok",
        "room_type": "Deluxe Room",
        "price_per_night": { "amount": "1.00", "currency": "USDC" },
        "amenities": ["WiFi", "Pool", "Breakfast"] }
    ],
    "nights": 2
  },
  "text": "Hotels in Bangkok (2026-03-26 to 2026-03-28, 2 nights, 1 guest(s)):\n..."
}
```

**Pick an offer_id from the response.**

### Step 2 — Trigger purchase to get payment requirement

```bash
curl -X POST https://xagenpay.com/hotel/api/purchase/hotels \
  -H "Content-Type: application/json" \
  -d '{"hotel_id":"HTL-abc123","payer_wallet":"0xYOUR_WALLET"}'
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
    "amount": "2000000",
    "payTo": "0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd",
    "maxTimeoutSeconds": 300
  }]
}
```

### Step 3 — Sign with OKX Onchain OS

```bash
onchainos payment x402-pay \
  --network eip155:196 \
  --amount 2000000 \
  --pay-to 0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd \
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
curl -X POST https://xagenpay.com/hotel/api/purchase/hotels \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <headerValue>" \
  -d '{"hotel_id":"HTL-abc123","payer_wallet":"0xYOUR_WALLET"}'
```

Response: **HTTP 200**
```json
{
  "status": "booked",
  "confirmation": "HTL-K3X9P",
  "hotel": { "hotel_name": "Sukhumvit Grand Hotel", "location": "Sukhumvit, Bangkok" },
  "nights": 2,
  "price_paid_usdc": "2.00",
  "payment_tx": "0xabc...",
  "network": "eip155:196"
}
```

---

## MCP Tool Reference

### `search_and_quote` / `search_hotels` — FREE

```typescript
search_and_quote({ city: "Bangkok", check_in: "2026-03-26", check_out: "2026-03-28", guests: 1 })
```

Returns hotel list with offer IDs, star ratings, prices, and amenities. No payment required.

### `purchase_hotel` — x402 Payment

```typescript
purchase_hotel({ hotel_id: "HTL-abc123", payer_wallet: "0x..." })
```

- **First call (no `_meta["x402/payment"]`)** — returns PaymentRequired with exact USDC price (nightly rate × nights)
- **Second call (with `_meta["x402/payment"]` containing signed EIP-3009)** — on-chain settlement + booking confirmation

---

## Supported Cities

Tokyo, Singapore, Shanghai, Bangkok, Hong Kong, and other major Asia-Pacific destinations.

---

## Network & Payment

| Field | Value |
|-------|-------|
| Network | XLayer Mainnet (eip155:196) |
| Payment Token | USDC `0x74b7F16337b8972027F6196A17a631aC6dE26d22` |
| Merchant | `0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd` |
| Method | EIP-3009 `transferWithAuthorization` |
| Price | Nightly rate × nights (typically 1 USDC/night (demo)) |
