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

# XAgent Pay Flight Agent — HTTP REST API

Flight booking merchant agent powered by XAgent Pay. **No MCP client required** — all tools are available via plain HTTP POST.

> For MCP connection config and tool definitions, see [skill.md](https://nexus-flight-agent-3xb1.onrender.com/skill.md).

**Base URL:** `https://nexus-flight-agent-3xb1.onrender.com`

**XAgent Pay Core URL:** `https://nexus-core-r0xf.onrender.com`

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

Search flights AND generate a NUPS quote in ONE call.

```bash
curl -X POST https://nexus-flight-agent-3xb1.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_and_quote",
    "arguments": {
      "origin": "PVG",
      "destination": "NRT",
      "date": "2026-04-01",
      "passengers": 1,
      "payer_wallet": "0xYourWalletAddress"
    }
  }'
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA airport code for departure (e.g. `PVG`, `SIN`, `HKG`) |
| `destination` | string | Yes | IATA airport code for arrival (e.g. `NRT`, `BKK`, `SIN`) |
| `date` | string | Yes | Departure date in `YYYY-MM-DD` format |
| `passengers` | number | No | Number of passengers, 1-9. Default: `1` |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of flight to book (default `0`). Re-call with a different index to pick another flight. |

**Returns:** A text response containing all available flights and a `QUOTE_JSON` object for the selected flight. Parse out the JSON object after `QUOTE_JSON:` — pass it to the orchestrate step.

---

### `search_flights`

Search available flights without generating a quote.

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `origin` | string | Yes | IATA departure code |
| `destination` | string | Yes | IATA arrival code |
| `date` | string | Yes | `YYYY-MM-DD` |
| `passengers` | number | No | Default: `1` |

---

### `nexus_check_status`

Check payment status for a flight order.

```bash
curl -X POST https://nexus-flight-agent-3xb1.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{"tool": "nexus_check_status", "arguments": {"order_ref": "FLT-abc123"}}'
```

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | Order reference returned by `search_and_quote` (e.g. `FLT-...`) |

**Returns:** `status` field is one of `UNPAID` / `PAID` / `EXPIRED`.

---

## Complete Booking Workflow

This is the recommended end-to-end flow for AI agents to book flights (and optionally hotels) and collect payment.

### Step 1 — Search & Quote (flight)

```bash
POST https://nexus-flight-agent-3xb1.onrender.com/api/v1/call-tool
{"tool": "search_and_quote", "arguments": {"origin": "PVG", "destination": "NRT", "date": "2026-04-01", "passengers": 1, "payer_wallet": "0x<PAYER>"}}
```

Parse the `QUOTE_JSON: {...}` object from the response text. Save the full JSON object as `flight_quote`.

### Step 2 — Search & Quote (hotel, optional)

```bash
POST https://nexus-hotel-agent-d2lj.onrender.com/api/v1/call-tool
{"tool": "search_and_quote", "arguments": {"city": "Tokyo", "check_in": "2026-04-01", "check_out": "2026-04-03", "guests": 1, "payer_wallet": "0x<PAYER>"}}
```

Save the parsed JSON as `hotel_quote`.

### Step 3 — Orchestrate Payment

Submit one or more quotes to XAgent Pay Core to create a payment group:

```bash
POST https://nexus-core-r0xf.onrender.com/api/orchestrate
Content-Type: application/json

{
  "quotes": [<flight_quote>, <hotel_quote>],
  "payer_wallet": "0x<PAYER>"
}
```

**Response (HTTP 402):**

```json
{
  "status": "PAYMENT_REQUIRED",
  "group_id": "GRP-...",
  "checkout_url": "https://nexus-core-r0xf.onrender.com/checkout/tok_...",
  "instruction": {
    "chain_id": 20250407,
    "escrow_contract": "0x...",
    "token_address": "0x...",
    "total_amount_uint256": "200000",
    "eip3009_sign_data": { ... }
  },
  "nexus_group_sig": "0x...",
  "core_operator_address": "0x..."
}
```

Save `group_id` and `checkout_url`.

### Step 4 — Execute Payment

**Option A — Browser (MetaMask):** Direct the user to open `checkout_url` in a browser with MetaMask installed. The user approves the USDC transfer. The page auto-confirms on success.

**Option B — Programmatic:** Sign the `eip3009_sign_data` from the instruction using the payer's private key, then call the `batchDepositWithAuthorization` function on `escrow_contract`. After the transaction is mined, proceed to Step 5.

### Step 5 — Confirm Transaction (programmatic path only)

After obtaining the on-chain `tx_hash` from Step 4 Option B:

```bash
POST https://nexus-core-r0xf.onrender.com/api/checkout/<group_id>/confirm
Content-Type: application/json

{"tx_hash": "0x<TX_HASH>"}
```

**Response (HTTP 200):** Payment confirmed. Status transitions to `ESCROWED`.

### Step 6 — Verify Status

```bash
POST https://nexus-flight-agent-3xb1.onrender.com/api/v1/call-tool
{"tool": "nexus_check_status", "arguments": {"order_ref": "<merchant_order_ref from quote>"}}
```

Status `PAID` means the booking is confirmed.
