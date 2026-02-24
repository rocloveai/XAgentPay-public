---
name: nexus-hotel-agent
version: "0.1.0"
description: Hotel booking with Nexus Payment — search hotels across popular cities, generate NUPS quotes, verify on-chain payments
merchant_did: "did:nexus:210425:demo_hotel"
protocol: NUPS/1.5
category: travel.hotels
currencies: [USDC]
chain_id: 210425
tools:
  - name: search_hotels
    role: search
  - name: nexus_generate_quote
    role: quote
  - name: nexus_check_status
    role: status
---

# Nexus Hotel Agent

Hotel booking merchant agent powered by Nexus Protocol. Searches hotels across popular cities (Tokyo, Singapore, Shanghai, Bangkok, Hong Kong), generates NUPS payment quotes, and verifies on-chain payments.

## MCP Connection

```json
{
  "mcpServers": {
    "hotel-agent": {
      "url": "https://nexus-hotel-agent.onrender.com/sse"
    }
  }
}
```

## Available Tools

### `search_hotels` (role: search)

Search available hotels in a city.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name (e.g. `Tokyo`, `Singapore`, `Bangkok`, `Shanghai`) |
| `check_in` | string | Yes | Check-in date in `YYYY-MM-DD` format |
| `check_out` | string | Yes | Check-out date in `YYYY-MM-DD` format |
| `guests` | number | No | Number of guests, 1-10. Default: `1` |

**Returns:** List of hotel offers with `offer_id`, hotel name, star rating, room type, location, price per night (USD), total price, and amenities.

**Example:**
```
search_hotels({ city: "Tokyo", check_in: "2026-04-01", check_out: "2026-04-03", guests: 2 })
```

---

### `nexus_generate_quote` (role: quote)

Generates a Nexus Payment (NUPS) quote for a selected hotel offer. Required before payment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `hotel_offer_id` | string | Yes | The `offer_id` from `search_hotels` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** NUPS quote payload with `merchant_order_ref`, amount (including 10% tax + 5% service charge), currency, expiry, line items, payer wallet, and signature.

---

### `nexus_check_status` (role: status)

Checks the payment status of a hotel order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `HTL-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow

1. **Discover** — Ask the user for destination city, check-in date, check-out date, and number of guests.
2. **Search** — Call `search_hotels` with the provided details. Present results to the user.
3. **Quote** — When the user selects a hotel, collect their EVM wallet address, then call `nexus_generate_quote` with the `offer_id` and `payer_wallet`. Display the NUPS payment payload.
4. **Pay** — User completes payment via Nexus Protocol using the NUPS payload (on-chain USDC transfer).
5. **Verify** — After user confirms payment, call `nexus_check_status` to verify. Only confirm booking when status is `PAID`.
