---
name: nexus-flight-agent
version: "0.1.0"
description: Flight booking MCP agent — search flights, generate NUPS quotes, verify on-chain payments
merchant_did: "did:nexus:20250407:demo_flight"
protocol: NUPS/1.5
category: travel.flights
currencies: [USDC]
chain_id: 20250407
tools:
  - name: search_and_quote
    role: search+quote
  - name: search_flights
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# Nexus Flight Agent — MCP Skill

Flight booking merchant agent powered by Nexus Protocol. Searches flights across popular Asia-Pacific routes (PVG, NRT, SIN, HKG, BKK), generates NUPS payment quotes, and verifies on-chain payments.

> For HTTP REST API docs (no MCP client required), see [skill-user.md](https://nexus-flight-agent-nr8m.onrender.com/skill-user.md).

## MCP Connection

```json
{
  "mcpServers": {
    "flight-agent": {
      "url": "https://nexus-flight-agent-nr8m.onrender.com/mcp"
    }
  }
}
```

Transport: **Streamable HTTP** (stateless, single `POST /mcp` per request).

## Available Tools

### `search_and_quote` (role: search+quote) — Recommended

Search flights AND generate a NUPS quote in one call. Fastest way to get a flight quote.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure (e.g. `PVG`, `SIN`) |
| `destination` | string | Yes | IATA airport code for arrival (e.g. `NRT`, `PVG`) |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Number of passengers, 1-9. Default: `1` |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of flight to quote (default: `0`). Call again with a different index to re-quote |

**Returns:** All available flights + a ready-to-use `QUOTE_JSON` for the selected flight.

**Example:**
```
search_and_quote({ origin: "SIN", destination: "PVG", date: "2026-04-01", payer_wallet: "0x..." })
```

---

### `search_flights` (role: search)

Search available flights. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure |
| `destination` | string | Yes | IATA airport code for arrival |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Default: `1` |

---

### `nexus_generate_quote` (role: quote)

Generate a NUPS quote for a selected flight offer. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `flight_offer_id` | string | Yes | The `offer_id` from `search_flights` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

---

### `nexus_check_status` (role: status)

Checks the payment status of a flight order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `FLT-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow

**Fast path (recommended):**
1. **Search + Quote** — Call `search_and_quote` with origin, destination, date, and payer wallet. Returns flights + ready-to-use quote.
2. **Pay** — Call `nexus_orchestrate_payment` on Nexus Core with the `QUOTE_JSON` from step 1. Multiple quotes from different merchants can be combined into a single call.
3. **Verify** — Call `nexus_check_status` to verify. Only confirm booking when status is `PAID`.
