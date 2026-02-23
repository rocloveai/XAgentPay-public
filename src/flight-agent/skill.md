---
name: nexus-flight-agent
version: "0.1.0"
description: Flight booking with Nexus Payment — search real flights via Duffel API, generate NUPS quotes, verify on-chain payments
merchant_did: "did:nexus:210425:demo_flight"
protocol: NUPS/1.5
category: travel.flights
currencies: [USDC]
chain_id: 210425
tools:
  - name: search_flights
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# Nexus Flight Agent

Flight booking merchant agent powered by Nexus Protocol. Searches real flights via Duffel API (with demo fallback), generates NUPS payment quotes, and verifies on-chain payments.

## Quick Setup

### Option A: Remote SSE (recommended for cloud)

Connect to the hosted agent via SSE transport. No local installation needed.

```json
{
  "mcpServers": {
    "flight-agent": {
      "url": "https://nexus-flight-agent.onrender.com/sse"
    }
  }
}
```

SSE endpoint: `https://nexus-flight-agent.onrender.com/sse`
Messages endpoint: `https://nexus-flight-agent.onrender.com/messages`

### Option B: npx (local)

```json
{
  "mcpServers": {
    "flight-agent": {
      "command": "npx",
      "args": ["-y", "@nexuspay/flight-agent"],
      "env": {
        "DUFFEL_API_TOKEN": "<your-duffel-api-token>",
        "MERCHANT_DID": "did:nexus:210425:demo_flight"
      }
    }
  }
}
```

### Option C: Local path

```json
{
  "mcpServers": {
    "flight-agent": {
      "command": "node",
      "args": ["src/flight-agent/build/server.js"],
      "env": {
        "DUFFEL_API_TOKEN": "<your-duffel-api-token>",
        "MERCHANT_DID": "did:nexus:210425:demo_flight"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DUFFEL_API_TOKEN` | No | Duffel API token for live flight data. Falls back to demo data if not set. |
| `MERCHANT_DID` | No | Merchant DID identifier. Defaults to `did:nexus:210425:demo_flight`. |
| `PORTAL_PORT` | No | HTTP portal dashboard port. Defaults to `3001`. |

## Available Tools

### `search_flights` (role: search)

Search available flights between airports.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure (e.g. `PVG`, `SHA`) |
| `destination` | string | Yes | IATA airport code for arrival (e.g. `NRT`, `HND`) |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Number of passengers, 1-9. Default: `1` |

**Returns:** List of flight offers with `offer_id`, airline, flight number, times, duration, cabin class, and price.

**Example call:**
```
search_flights({ origin: "PVG", destination: "NRT", date: "2026-04-01", passengers: 1 })
```

**Example output:**
```
Available Flights:

1. [demo_PVG_NRT_001] China Eastern Airlines MU523
   PVG → NRT
   Depart: 2026-04-01T08:30:00 | Arrive: 2026-04-01T12:45:00
   Duration: PT3H15M | Class: economy
   Price: 1280.00 CNY
```

---

### `nexus_generate_quote` (role: quote)

Generates a Nexus Payment (NUPS) quote for a selected flight offer. This is a required step before payment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `flight_offer_id` | string | Yes | The `offer_id` from `search_flights` results |

**Returns:** NUPS quote payload with `merchant_order_ref`, amount, currency, expiry, line items, and signature.

**Example call:**
```
nexus_generate_quote({ flight_offer_id: "demo_PVG_NRT_001" })
```

---

### `nexus_check_status` (role: status)

Checks the payment status of a flight order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `FLT-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

**Example call:**
```
nexus_check_status({ order_ref: "FLT-A1B2C3" })
```

## Checkout Workflow

Follow this 5-step workflow to complete a flight booking:

1. **Discover** — Ask the user for departure city, destination, and travel date.
2. **Search** — Call `search_flights` with IATA codes and date. Present results to the user.
3. **Quote** — When the user selects a flight, call `nexus_generate_quote` with the `offer_id`. Display the NUPS payment payload.
4. **Pay** — User completes payment via Nexus Protocol using the NUPS payload (on-chain USDC transfer).
5. **Verify** — After user confirms payment, call `nexus_check_status` to verify. Only confirm booking when status is `PAID`.

## Portal Dashboard

When the agent is running, an HTTP portal is available at:

```
http://localhost:3001
```

The portal provides:
- Order management dashboard
- Payment callback endpoint (`POST /api/payment-callback`) for Nexus settlement notifications
- Real-time order status updates
