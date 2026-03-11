---
name: xagent-hotel
version: "0.1.0"
description: Hotel booking MCP agent — search hotels, generate NUPS quotes, verify on-chain payments
merchant_did: "did:nexus:196:demo_hotel"
protocol: NUPS/1.5
category: travel.hotels
currencies: [USDC]
chain_id: 196
tools:
  - name: search_and_quote
    role: search+quote
  - name: search_hotels
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# XAgent Pay Hotel Agent — MCP Skill

Hotel booking merchant agent powered by XAgent Pay. Searches hotels across popular cities (Tokyo, Singapore, Shanghai, Bangkok, Hong Kong), generates NUPS payment quotes, and verifies on-chain payments.

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

### `search_and_quote` (role: search+quote) — Recommended

Search hotels AND generate a NUPS quote in one call. Fastest way to get a hotel quote.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name (e.g. `Tokyo`, `Singapore`, `Bangkok`, `Shanghai`) |
| `check_in` | string | Yes | Check-in date in `YYYY-MM-DD` format |
| `check_out` | string | Yes | Check-out date in `YYYY-MM-DD` format |
| `guests` | number | No | Number of guests, 1-10. Default: `1` |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of hotel to quote (default: `0`). Call again with a different index to re-quote |

**Returns:** All available hotels + a ready-to-use `QUOTE_JSON` for the selected hotel.

**Example:**
```
search_and_quote({ city: "Tokyo", check_in: "2026-04-01", check_out: "2026-04-03", payer_wallet: "0x..." })
```

---

### `search_hotels` (role: search)

Search available hotels. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name |
| `check_in` | string | Yes | Check-in date `YYYY-MM-DD` |
| `check_out` | string | Yes | Check-out date `YYYY-MM-DD` |
| `guests` | number | No | Default: `1` |

---

### `nexus_generate_quote` (role: quote)

Generate a NUPS quote for a selected hotel offer. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `hotel_offer_id` | string | Yes | The `offer_id` from `search_hotels` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

---

### `nexus_check_status` (role: status)

Checks the payment status of a hotel order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `HTL-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow

**Fast path (recommended):**
1. **Search + Quote** — Call `search_and_quote` with city, dates, and payer wallet. Returns hotels + ready-to-use quote.
2. **Pay** — Call `nexus_orchestrate_payment` on XAgent Pay Core with the `QUOTE_JSON` from step 1. Multiple quotes from different merchants can be combined into a single call.
3. **Verify** — Call `nexus_check_status` to verify. Only confirm booking when status is `PAID`.
