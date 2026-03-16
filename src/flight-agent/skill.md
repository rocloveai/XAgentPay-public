---
name: xagent-flight
version: "2.0.0"
description: Flight booking MCP agent — search flights, generate NUPS quotes, verify on-chain payments. Supports x402 payment protocol.
merchant_did: "did:nexus:196:demo_flight"
protocol: NUPS/1.5
category: travel.flights
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
  - name: search_flights
    role: search
  - name: nexus_generate_quote
    role: quote+x402
  - name: nexus_check_status
    role: status
---

# XAgent Pay Flight Agent — MCP Skill

Flight booking merchant agent powered by XAgent Pay. Searches flights across popular Asia-Pacific routes (PVG, NRT, SIN, HKG, BKK), generates NUPS payment quotes, and verifies on-chain payments.

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

### `search_and_quote` (role: search+quote+x402) — Recommended

Search flights AND generate a NUPS quote in one call. Fastest way to get a flight quote. Supports **x402 payment protocol** — include `_meta["x402/payment"]` with a signed EIP-3009 `transferWithAuthorization` to pay and receive the booking confirmation instantly.

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
2. **Pay** — Call `nexus_orchestrate_payment` on XAgent Pay Core with the `QUOTE_JSON` from step 1. Multiple quotes from different merchants can be combined into a single call.
3. **Verify** — Call `nexus_check_status` to verify. Only confirm booking when status is `PAID`.

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

## Supported Routes

PVG (Shanghai), NRT (Tokyo), SIN (Singapore), HKG (Hong Kong), BKK (Bangkok), and connecting routes between these hubs.
