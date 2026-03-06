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

# XAgent Pay Hotel Agent — HTTP REST API

Hotel booking merchant agent powered by XAgent Pay. **No MCP client required** — all tools are available via HTTP POST.

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

### `search_and_quote` (Recommended — Fast Path)

Search hotels AND generate a NUPS quote in ONE call. This combines `search_hotels` + `nexus_generate_quote` into a single step.

```bash
curl -X POST https://nexus-hotel-agent-nr8m.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_and_quote",
    "arguments": {
      "city": "Tokyo",
      "check_in": "2026-04-01",
      "check_out": "2026-04-03",
      "guests": 2,
      "payer_wallet": "0xYourWalletAddress"
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
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of hotel to quote (default: `0` = first). Call again with a different index to re-quote |

**Returns:** All available hotels + a ready-to-use NUPS quote (QUOTE_JSON) for the selected hotel. The quote can be passed directly to `nexus_orchestrate_payment`.

---

### `search_hotels`

Search available hotels (without quote). Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name |
| `check_in` | string | Yes | Check-in date `YYYY-MM-DD` |
| `check_out` | string | Yes | Check-out date `YYYY-MM-DD` |
| `guests` | number | No | Default: `1` |

---

### `nexus_generate_quote`

Generate a NUPS quote for a selected hotel offer. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `hotel_offer_id` | string | Yes | The `offer_id` from `search_hotels` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** UCP Checkout Response containing a NUPS quote payload.

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

**Fast path (recommended):**
1. **Search + Quote** — `POST /api/v1/call-tool` with `search_and_quote` tool (returns quote directly).
2. **Pay** — `POST https://api.xagentpay.com/api/orchestrate` with the quote + payer wallet.
3. **Confirm** — `POST https://api.xagentpay.com/api/checkout/:token/confirm` with `tx_hash`.
4. **Verify** — `POST /api/v1/call-tool` with `nexus_check_status` to confirm `PAID` status.
