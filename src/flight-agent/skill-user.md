---
name: nexus-flight-agent
version: "0.1.0"
description: Flight booking HTTP REST API — search flights, generate NUPS quotes, verify payments
merchant_did: "did:nexus:20250407:demo_flight"
protocol: NUPS/1.5
category: travel.flights
currencies: [USDC]
chain_id: 20250407
---

# Nexus Flight Agent — HTTP REST API

Flight booking merchant agent powered by Nexus Protocol. **No MCP client required** — all tools are available via HTTP POST.

> For MCP connection config and tool definitions, see [skill.md](https://nexus-flight-agent-nr8m.onrender.com/skill.md).

**Base URL:** `https://nexus-flight-agent-nr8m.onrender.com`

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

Search flights AND generate a NUPS quote in ONE call. This combines `search_flights` + `nexus_generate_quote` into a single step.

```bash
curl -X POST https://nexus-flight-agent-nr8m.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_and_quote",
    "arguments": {
      "origin": "SIN",
      "destination": "PVG",
      "date": "2026-04-01",
      "passengers": 1,
      "payer_wallet": "0xYourWalletAddress"
    }
  }'
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure (e.g. `PVG`, `SIN`) |
| `destination` | string | Yes | IATA airport code for arrival (e.g. `NRT`, `PVG`) |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Number of passengers, 1-9. Default: `1` |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of flight to quote (default: `0` = first). Call again with a different index to re-quote |

**Returns:** All available flights + a ready-to-use NUPS quote (QUOTE_JSON) for the selected flight. The quote can be passed directly to `nexus_orchestrate_payment`.

---

### `search_flights`

Search available flights (without quote). Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure |
| `destination` | string | Yes | IATA airport code for arrival |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Default: `1` |

---

### `nexus_generate_quote`

Generate a NUPS quote for a selected flight offer. Use `search_and_quote` instead for faster flow.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `flight_offer_id` | string | Yes | The `offer_id` from `search_flights` results |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** UCP Checkout Response containing a NUPS quote payload.

---

### `nexus_check_status`

Check the payment status of a flight order.

```bash
curl -X POST https://nexus-flight-agent-nr8m.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "nexus_check_status",
    "arguments": {
      "order_ref": "FLT-abc123"
    }
  }'
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | The order reference (e.g. `FLT-...`) |

**Returns:** Order status (`UNPAID` / `PAID` / `EXPIRED`), amount, summary, timestamps.

## Checkout Workflow (HTTP)

**Fast path (recommended):**
1. **Search + Quote** — `POST /api/v1/call-tool` with `search_and_quote` tool (returns quote directly).
2. **Pay** — `POST https://api.nexus-mvp.topos.one/api/orchestrate` with the quote + payer wallet.
3. **Confirm** — `POST https://api.nexus-mvp.topos.one/api/checkout/:token/confirm` with `tx_hash`.
4. **Verify** — `POST /api/v1/call-tool` with `nexus_check_status` to confirm `PAID` status.
