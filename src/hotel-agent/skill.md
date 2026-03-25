---
name: xagent-hotel
version: "2.0.0"
description: Hotel booking MCP agent — search hotels for free, purchase with x402 payment. Pure x402 protocol.
merchant_did: "did:xagent:196:demo_hotel"
protocol: x402/2
category: travel.hotels
currencies: [USDC]
chain_id: 196
x402:
  version: 2
  scheme: exact
  network: "eip155:196"
  asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22"
  assetTransferMethod: eip3009
  description: "x402 payment on purchase_hotel only. Search is free."
tools:
  - name: search_and_quote
    role: search (free)
  - name: search_hotels
    role: search (free)
  - name: purchase_hotel
    role: purchase+x402
---

# XAgent Pay Hotel Agent — MCP Skill

Hotel booking merchant agent powered by XAgent Pay. Searches hotels across popular cities (Tokyo, Singapore, Shanghai, Bangkok, Hong Kong) for free, then purchases with direct x402 on-chain payment.

> For HTTP REST API docs (no MCP client required), see [skill-user.md](https://xagenpay.com/hotel/skill-user.md).

## MCP Connection

```json
{
  "mcpServers": {
    "hotel-agent": {
      "url": "https://xagenpay.com/hotel/mcp"
    }
  }
}
```

Transport: **Streamable HTTP** (stateless, single `POST /mcp` per request).

## Available Tools

### `search_and_quote` (FREE) — Recommended starting point

Search available hotels in a city. Returns a list of hotel offers with nightly rates and offer IDs. **No payment required.**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name (e.g. `Tokyo`, `Singapore`, `Bangkok`, `Shanghai`) |
| `check_in` | string | Yes | Check-in date in `YYYY-MM-DD` format |
| `check_out` | string | Yes | Check-out date in `YYYY-MM-DD` format |
| `guests` | number | No | Number of guests, 1-10. Default: `1` |

**Returns:** All available hotels with offer IDs, star ratings, prices, and amenities. Instructions to call `purchase_hotel` with a chosen offer.

**Example:**
```
search_and_quote({ city: "Tokyo", check_in: "2026-04-01", check_out: "2026-04-03" })
```

---

### `search_hotels` (FREE)

Search available hotels. Same as `search_and_quote`. No payment required.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name |
| `check_in` | string | Yes | Check-in date `YYYY-MM-DD` |
| `check_out` | string | Yes | Check-out date `YYYY-MM-DD` |
| `guests` | number | No | Default: `1` |

---

### `purchase_hotel` (x402 payment required)

Purchase a hotel booking using x402 EIP-3009 on-chain payment. The payment amount equals the exact total stay price (nightly rate × nights) in USDC.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `hotel_id` | string | Yes | Hotel offer ID from `search_and_quote` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Flow:**
1. First call (no payment) → returns `PaymentRequired` (402) with exact USDC amount
2. Sign EIP-3009 `transferWithAuthorization` for the exact price
3. Second call with `_meta["x402/payment"]` → agent verifies, settles on-chain, returns booking confirmation + TX hash

**Returns:** Booking confirmation with hotel details, TX hash, and confirmation number.

---

## Booking Workflow

1. **Search** — Call `search_and_quote` with city and dates. Returns hotel list with offer IDs. **Free.**
2. **Purchase** — Call `purchase_hotel(hotel_id, payer_wallet)` → get payment requirements (total price in USDC)
3. **Pay** — Sign EIP-3009 authorization for the exact price, re-call with `_meta["x402/payment"]`
4. **Done** — Agent verifies on-chain, returns booking confirmation instantly

## x402 Payment Protocol

This agent uses the **x402 payment protocol** (v2) exclusively for purchases.

**Payment Details:**
- Network: XLayer (eip155:196)
- Asset: USDC (`0x74b7F16337b8972027F6196A17a631aC6dE26d22`)
- Method: EIP-3009 `transferWithAuthorization`
- Amount: Exact total stay price (nightly rate × nights)

## HTTP REST Endpoints

### Search (FREE)

**Endpoint:** `POST https://xagenpay.com/hotel/api/search`

No payment header needed. Returns hotel results directly.

**Request body (JSON):**
```json
{
  "city": "Tokyo",
  "check_in": "2026-04-01",
  "check_out": "2026-04-03",
  "guests": 1
}
```

**HTTP 200 response body:**
```json
{
  "hotels": {...},
  "text": "Hotels in Tokyo...",
  "network": "eip155:196"
}
```

### Purchase (x402)

**Endpoint:** `POST https://xagenpay.com/hotel/api/purchase/hotels`

**Request body (JSON):**
```json
{
  "hotel_id": "<offer_id from search>",
  "payer_wallet": "0x..."
}
```

**Flow:**
1. No payment header → HTTP 402 with x402 payment requirements (exact total price)
2. With `PAYMENT-SIGNATURE` header → HTTP 200 with booking confirmation

**HTTP 200 response body:**
```json
{
  "status": "booked",
  "confirmation": "HTL-...",
  "hotel": {...},
  "nights": 2,
  "price_paid_usdc": "240.00",
  "payment_tx": "0x...",
  "network": "eip155:196"
}
```

## Supported Cities

Tokyo, Singapore, Shanghai, Bangkok, Hong Kong, and other major Asia-Pacific destinations.
