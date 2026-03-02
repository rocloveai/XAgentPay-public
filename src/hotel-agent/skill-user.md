---
name: nexus-hotel-agent
version: "0.1.0"
description: Hotel booking HTTP REST API — search hotels, generate NUPS quotes, verify payments
merchant_did: "did:nexus:20250407:demo_hotel"
protocol: NUPS/1.5
category: travel.hotels
currencies: [USDC]
chain_id: 20250407
---

# Nexus Hotel Agent — HTTP REST API

Hotel booking merchant agent powered by Nexus Protocol. **No MCP client required** — all tools are available via HTTP POST.

> For MCP connection config and tool definitions, see [skill.md](https://nexus-hotel-agent-nr8m.onrender.com/skill.md).

**Base URL:** `https://nexus-hotel-agent-nr8m.onrender.com`

## Call Tool Endpoint

**`POST /api/v1/call-tool`**

All agent tools are invoked via this single endpoint.

```json
{
  "tool": "tool_name",
  "arguments": { ... }
}
```

## Available Tools

### `search_hotels`

Search available hotels in a city.

```bash
curl -X POST https://nexus-hotel-agent-nr8m.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_hotels",
    "arguments": {
      "city": "Tokyo",
      "check_in": "2026-04-01",
      "check_out": "2026-04-03",
      "guests": 2
    }
  }'
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name (e.g. `Tokyo`, `Singapore`, `Bangkok`, `Shanghai`) |
| `check_in` | string | Yes | Check-in date in `YYYY-MM-DD` format |
| `check_out` | string | Yes | Check-out date in `YYYY-MM-DD` format |
| `guests` | number | No | Number of guests, 1-10. Default: `1` |

**Returns:** List of hotel offers with `offer_id`, hotel name, star rating, room type, location, price per night (USD), total price, and amenities.

---

### `nexus_generate_quote`

Generate a NUPS payment quote for a selected hotel offer.

```bash
curl -X POST https://nexus-hotel-agent-nr8m.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "nexus_generate_quote",
    "arguments": {
      "hotel_offer_id": "offer_abc123",
      "payer_wallet": "0xYourWalletAddress"
    }
  }'
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `hotel_offer_id` | string | Yes | The `offer_id` from `search_hotels` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** UCP Checkout Response containing a NUPS quote payload. Extract the quote from `response.ucp.payment_handlers["urn:ucp:payment:nexus_v1"][0].config` and pass it to the Nexus Core orchestrate endpoint.

---

### `nexus_check_status`

Check the payment status of a hotel order.

```bash
curl -X POST https://nexus-hotel-agent-nr8m.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "nexus_check_status",
    "arguments": {
      "order_ref": "HTL-abc123"
    }
  }'
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `HTL-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow (HTTP)

1. **Search** — `POST /api/v1/call-tool` with `search_hotels` tool.
2. **Quote** — `POST /api/v1/call-tool` with `nexus_generate_quote` tool. Extract the quote config from the UCP response.
3. **Pay** — `POST https://api.nexus-mvp.topos.one/api/orchestrate` with the quote + payer wallet. See [Nexus Core HTTP API](https://api.nexus-mvp.topos.one/skill-user.md).
4. **Confirm** — `POST https://api.nexus-mvp.topos.one/api/checkout/:token/confirm` with `tx_hash`.
5. **Verify** — `POST /api/v1/call-tool` with `nexus_check_status` to confirm `PAID` status.
