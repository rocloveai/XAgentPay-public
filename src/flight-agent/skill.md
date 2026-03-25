---
name: xagent-flight
version: "2.0.0"
description: Flight booking MCP agent — search flights for free, purchase with x402 payment. Pure x402 protocol.
merchant_did: "did:xagent:196:demo_flight"
protocol: x402/2
category: travel.flights
currencies: [USDC]
chain_id: 196
x402:
  version: 2
  scheme: exact
  network: "eip155:196"
  asset: "0x74b7F16337b8972027F6196A17a631aC6dE26d22"
  assetTransferMethod: eip3009
  description: "x402 payment on purchase_flight only. Search is free."
tools:
  - name: search_and_quote
    role: search (free)
  - name: search_flights
    role: search (free)
  - name: purchase_flight
    role: purchase+x402
---

# XAgent Pay Flight Agent — MCP Skill

Flight booking merchant agent powered by XAgent Pay. Searches flights across popular Asia-Pacific routes (PVG, NRT, SIN, HKG, BKK) for free, then purchases with direct x402 on-chain payment.

> For HTTP REST API docs (no MCP client required), see [skill-user.md](https://xagenpay.com/flight/skill-user.md).

## MCP Connection

```json
{
  "mcpServers": {
    "flight-agent": {
      "url": "https://xagenpay.com/flight/mcp"
    }
  }
}
```

Transport: **Streamable HTTP** (stateless, single `POST /mcp` per request).

## Available Tools

### `search_and_quote` (FREE) — Recommended starting point

Search available flights between airports. Returns a list of flight offers with prices and offer IDs. **No payment required.**

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure (e.g. `PVG`, `SIN`) |
| `destination` | string | Yes | IATA airport code for arrival (e.g. `NRT`, `PVG`) |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Number of passengers, 1-9. Default: `1` |

**Returns:** All available flights with offer IDs and prices. Instructions to call `purchase_flight` with a chosen offer.

**Example:**
```
search_and_quote({ origin: "SIN", destination: "PVG", date: "2026-04-01" })
```

---

### `search_flights` (FREE)

Search available flights. Same as `search_and_quote`. No payment required.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure |
| `destination` | string | Yes | IATA airport code for arrival |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Default: `1` |

---

### `purchase_flight` (x402 payment required)

Purchase a flight ticket using x402 EIP-3009 on-chain payment. The payment amount equals the exact flight price in USDC.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `offer_id` | string | Yes | Flight offer ID from `search_and_quote` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Flow:**
1. First call (no payment) → returns `PaymentRequired` (402) with exact USDC amount
2. Sign EIP-3009 `transferWithAuthorization` for the exact price
3. Second call with `_meta["x402/payment"]` → agent verifies, settles on-chain, returns booking confirmation + TX hash

**Returns:** Booking confirmation with flight details, TX hash, and confirmation number.

---

## Booking Workflow

1. **Search** — Call `search_and_quote` with origin, destination, date. Returns flight list with offer IDs. **Free.**
2. **Purchase** — Call `purchase_flight(offer_id, payer_wallet)` → get payment requirements (price in USDC)
3. **Pay** — Sign EIP-3009 authorization for the exact price, re-call with `_meta["x402/payment"]`
4. **Done** — Agent verifies on-chain, returns booking confirmation instantly

## x402 Payment Protocol

This agent uses the **x402 payment protocol** (v2) exclusively for purchases.

**Payment Details:**
- Network: XLayer (eip155:196)
- Asset: USDC (`0x74b7F16337b8972027F6196A17a631aC6dE26d22`)
- Method: EIP-3009 `transferWithAuthorization`
- Amount: Exact flight price (varies per offer)

## HTTP REST Endpoints

### Search (FREE)

**Endpoint:** `POST https://xagenpay.com/flight/api/search`

No payment header needed. Returns flight results directly.

**Request body (JSON):**
```json
{
  "origin": "SIN",
  "destination": "NRT",
  "date": "2026-04-01",
  "passengers": 1
}
```

**HTTP 200 response body:**
```json
{
  "flights": [...],
  "text": "Available Flights:\n...",
  "network": "eip155:196"
}
```

### Purchase (x402)

**Endpoint:** `POST https://xagenpay.com/flight/api/purchase/flights`

**Request body (JSON):**
```json
{
  "offer_id": "<offer_id from search>",
  "payer_wallet": "0x..."
}
```

**Flow:**
1. No payment header → HTTP 402 with x402 payment requirements (exact flight price)
2. With `PAYMENT-SIGNATURE` header → HTTP 200 with booking confirmation

**HTTP 200 response body:**
```json
{
  "status": "booked",
  "confirmation": "FLT-...",
  "flight": {...},
  "price_paid_usdc": "120.00",
  "payment_tx": "0x...",
  "network": "eip155:196"
}
```

## Supported Routes

PVG (Shanghai), NRT (Tokyo), SIN (Singapore), HKG (Hong Kong), BKK (Bangkok), and connecting routes between these hubs.
