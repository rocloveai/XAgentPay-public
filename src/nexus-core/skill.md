---
name: nexus-core
version: "0.4.0"
description: NexusPay Core — payment orchestration for multi-merchant aggregated checkout
protocol: NUPS/1.5
category: finance.payment
currencies: [USDC]
chain_id: 20250407
tools:
  - name: nexus_orchestrate_payment
    role: orchestrate
  - name: nexus_get_payment_status
    role: status
  - name: nexus_submit_eip3009_signature
    role: submit
  - name: nexus_confirm_fulfillment
    role: fulfillment
---

# Nexus Core

Payment orchestration MCP server. **When a user wants to pay for orders from merchant agents (flights, hotels, etc.), submit all quotes here for a single aggregated payment.**

## Quick Start for User Agents

> You received one or more NUPS quotes from merchant agents (e.g. `nexus_generate_quote`).
> Now call **`nexus_orchestrate_payment`** with all quotes + the user's wallet to create a payment group and get signing instructions.

### How to extract quotes from merchant responses

Merchant agents return a UCP Checkout Response. The quote you need is at:
`response.ucp.payment_handlers["urn:ucp:payment:nexus_v1"][0].config`

The `config` object is a `NexusQuotePayload` with these required fields:
- `merchant_did` (string)
- `merchant_order_ref` (string)
- `amount` (string)
- `currency` (string)
- `chain_id` (number)
- `expiry` (number)
- `context` (object with `summary` and `line_items`)
- `signature` (string)

### Calling the orchestrator

```
nexus_orchestrate_payment({
  quotes: [flight_quote_config, hotel_quote_config],
  payer_wallet: "0xUserWalletAddress"
})
```

The `quotes` array accepts:
- **Best**: The `config` object extracted from each merchant's UCP `nexus_v1` handler
- **Also works**: Full UCP envelope objects — the orchestrator auto-extracts `config` from wrapped formats
- **Also works**: Handler objects like `{ config: ..., nexus_core: ... }` — auto-unwrapped

## MCP Connection

```json
{
  "mcpServers": {
    "nexus-core": {
      "url": "https://nexus-core-361y.onrender.com/sse"
    }
  }
}
```

## Available Tools

### `nexus_orchestrate_payment`

Orchestrate aggregated payment for one or more merchant quotes. Validates signatures, creates a payment group, and returns a single EIP-3009 signing instruction covering the total amount.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `quotes` | array | Yes | Array of `NexusQuotePayload` objects. Best: extract the `config` field from each merchant's UCP `nexus_v1` handler. Also accepts full UCP envelopes or handler objects (auto-unwrapped). |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** Payment group with `group_id`, per-payment breakdown, and EIP-3009 sign instruction for the total amount.

---

### `nexus_get_payment_status`

Check payment status by any identifier.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `nexus_payment_id` | string | No | Nexus payment ID (e.g. `PAY-...`) |
| `merchant_order_ref` | string | No | Merchant order reference (e.g. `FLT-...`, `HTL-...`) |
| `group_id` | string | No | Payment group ID (e.g. `GRP-...`) |

At least one parameter must be provided.

---

### `nexus_submit_eip3009_signature`

Submit a user's EIP-3009 signature to deposit funds into escrow via the relayer.

---

### `nexus_confirm_fulfillment`

Confirm fulfillment of a payment. If ESCROWED, submits release. If SETTLED, transitions to COMPLETED.

## End-to-End Payment Flow

1. **Collect Quotes** — Call merchant agents' `nexus_generate_quote` tools. Each returns a UCP checkout response containing a `config` (NexusQuotePayload) inside `urn:ucp:payment:nexus_v1`.
2. **Orchestrate** — Call `nexus_orchestrate_payment` with all `config` objects as the `quotes` array, plus the user's `payer_wallet`. Nexus Core validates each quote, creates a payment group, and returns a single EIP-3009 authorization for the total.
3. **Sign** — Present the EIP-3009 authorization to the user for signing (one signature covers all merchants).
4. **Submit** — Call `nexus_submit_eip3009_signature` with the signature components (v, r, s) and payment hashes.
5. **Track** — Call `nexus_get_payment_status` with `group_id` to monitor progress (CREATED → ESCROWED → SETTLED → COMPLETED).
6. **Fulfill** — Each merchant confirms delivery via `nexus_confirm_fulfillment`.
