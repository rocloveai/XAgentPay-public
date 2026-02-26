---
name: nexus-flight-agent
version: "0.1.0"
description: Flight booking with Nexus Payment — search flights, generate NUPS quotes, verify on-chain payments
merchant_did: "did:nexus:20250407:demo_flight"
protocol: NUPS/1.5
category: travel.flights
currencies: [USDC]
chain_id: 20250407
tools:
  - name: search_flights
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# Nexus Flight Agent

Flight booking merchant agent powered by Nexus Protocol. Searches flights across popular Asia-Pacific routes (PVG, NRT, SIN, HKG, BKK), generates NUPS payment quotes, and verifies on-chain payments.

## MCP Connection

```json
{
  "mcpServers": {
    "flight-agent": {
      "url": "https://nexus-flight-agent.onrender.com/sse"
    }
  }
}
```

## Stateless REST API

For environments where MCP/SSE is not supported, tools can be called directly via HTTP POST.

**Endpoint:** `POST /api/v1/call-tool`

**Request Body:**
```json
{
  "tool": "tool_name",
  "arguments": { ... }
}
```

**Example (search):**
```bash
curl -X POST https://nexus-flight-agent.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_flights",
    "arguments": {
      "origin": "SIN",
      "destination": "PVG",
      "date": "2026-04-01"
    }
  }'
```

## Available Tools

### `search_flights` (role: search)

Search available flights between airports.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure (e.g. `PVG`, `SIN`) |
| `destination` | string | Yes | IATA airport code for arrival (e.g. `NRT`, `PVG`) |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Number of passengers, 1-9. Default: `1` |

**Returns:** List of flight offers with `offer_id`, airline, flight number, departure/arrival times, duration, cabin class, and price (USD).

**Example:**
```
search_flights({ origin: "SIN", destination: "PVG", date: "2026-04-01", passengers: 1 })
```

---

### `nexus_generate_quote` (role: quote)

Generates a Nexus Payment (NUPS) quote for a selected flight offer. Required before payment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `flight_offer_id` | string | Yes | The `offer_id` from `search_flights` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** NUPS quote payload with `merchant_order_ref`, amount, currency, expiry, line items, payer wallet, and signature.

---

### `nexus_check_status` (role: status)

Checks the payment status of a flight order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `FLT-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow

1. **Discover** — Ask the user for departure city, destination, and travel date.
2. **Search** — Call `search_flights` with IATA codes and date. Present results to the user.
3. **Quote** — When the user selects a flight, collect their EVM wallet address, then call `nexus_generate_quote` with the `offer_id` and `payer_wallet`. Display the NUPS payment payload.
4. **Pay** — The UCP response contains a `nexus_core` object with `mcp_endpoint` (`https://nexus-core-361y.onrender.com/sse`). Connect to Nexus Core MCP server and call `nexus_orchestrate_payment` with the quote's `config` object as one element of the `quotes` array, along with the user's `payer_wallet`. Multiple `nexus_v1` quotes from different merchants can be combined into a single call for aggregated payment — the user signs once for the total amount.
5. **Verify** — After user confirms payment, call `nexus_check_status` to verify. Only confirm booking when status is `PAID`.
