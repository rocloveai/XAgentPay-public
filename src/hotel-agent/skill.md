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

Hotel booking merchant agent powered by Nexus Protocol. Searches hotels across popular travel cities (Tokyo, Singapore, Bangkok, Shanghai, and more), generates NUPS payment quotes, and verifies on-chain payments.

## Quick Setup

### Option A: npx (recommended)

```json
{
  "mcpServers": {
    "hotel-agent": {
      "command": "npx",
      "args": ["-y", "@nexuspay/hotel-agent"],
      "env": {
        "MERCHANT_DID": "did:nexus:210425:demo_hotel"
      }
    }
  }
}
```

### Option B: Local path

```json
{
  "mcpServers": {
    "hotel-agent": {
      "command": "node",
      "args": ["src/hotel-agent/build/server.js"],
      "env": {
        "MERCHANT_DID": "did:nexus:210425:demo_hotel"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MERCHANT_DID` | No | Merchant DID identifier. Defaults to `did:nexus:210425:demo_hotel`. |
| `PORTAL_PORT` | No | HTTP portal dashboard port. Defaults to `3002`. |

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

**Returns:** List of hotel offers with `offer_id`, hotel name, star rating, room type, location, price per night, total price, and amenities.

**Example call:**
```
search_hotels({ city: "Tokyo", check_in: "2026-04-01", check_out: "2026-04-03", guests: 2 })
```

**Example output:**
```
Hotels in Tokyo (2026-04-01 to 2026-04-03, 2 nights, 2 guest(s)):

1. [htl_tokyo_001] Hotel Gracery Shinjuku ★★★★☆
   Room: Superior Double
   Location: Shinjuku, Kabukicho
   Price: 185.00 USD/night (2 nights = 370.00 USD)
   Amenities: WiFi, Restaurant, Fitness Center
```

---

### `nexus_generate_quote` (role: quote)

Generates a Nexus Payment (NUPS) quote for a selected hotel offer. This is a required step before payment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `hotel_offer_id` | string | Yes | The `offer_id` from `search_hotels` results |

**Returns:** NUPS quote payload with `merchant_order_ref`, amount (including 10% tax + 5% service charge), currency, expiry, line items, and signature.

**Example call:**
```
nexus_generate_quote({ hotel_offer_id: "htl_tokyo_001" })
```

---

### `nexus_check_status` (role: status)

Checks the payment status of a hotel order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `HTL-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

**Example call:**
```
nexus_check_status({ order_ref: "HTL-X1Y2Z3" })
```

## Checkout Workflow

Follow this 5-step workflow to complete a hotel booking:

1. **Discover** — Ask the user for destination city, check-in date, check-out date, and number of guests.
2. **Search** — Call `search_hotels` with the provided details. Present results to the user.
3. **Quote** — When the user selects a hotel, call `nexus_generate_quote` with the `offer_id`. Display the NUPS payment payload.
4. **Pay** — User completes payment via Nexus Protocol using the NUPS payload (on-chain USDC transfer).
5. **Verify** — After user confirms payment, call `nexus_check_status` to verify. Only confirm booking when status is `PAID`.

## Supported Cities

The agent includes curated hotel data for these cities:

| City | Hotels | Price Range (USD/night) |
|------|--------|------------------------|
| Tokyo | 4 | $95 - $890 |
| Singapore | 3 | $160 - $980 |
| Bangkok | 3 | $55 - $380 |
| Shanghai | 3 | $60 - $420 |

For unlisted cities, generic hotel options are automatically generated.

## Portal Dashboard

When the agent is running, an HTTP portal is available at:

```
http://localhost:3002
```

The portal provides:
- Order management dashboard
- Payment callback endpoint (`POST /api/payment-callback`) for Nexus settlement notifications
- Real-time order status updates
