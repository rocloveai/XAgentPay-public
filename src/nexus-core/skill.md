---
name: nexus-core
version: "0.2.0"
description: NexusPay Core — payment orchestration for multi-merchant aggregated checkout
protocol: NUPS/1.5
category: finance.payment
currencies: [USDC]
chain_id: 20250407
tools:
  - name: nexus_orchestrate_payment
    role: quote
  - name: nexus_get_payment_status
    role: status
---

# Nexus Core

Payment orchestration MCP server that enables aggregated multi-merchant checkout. User Agents collect quotes from multiple Merchant Agents and submit them together for a single-signature payment.

## MCP Connection

```json
{
  "mcpServers": {
    "nexus-core": {
      "url": "https://nexus-core.onrender.com/sse"
    }
  }
}
```

## Available Tools

### `nexus_orchestrate_payment` (role: quote)

Orchestrate aggregated payment for one or more merchant quotes. Validates signatures, creates a payment group, and returns a single EIP-3009 signing instruction for the total amount.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `quotes` | array | Yes | Array of `NexusQuotePayload` objects from merchant UCP responses (the `config` field inside `urn:ucp:payment:nexus_v1` handler) |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

**Returns:** Payment group details with group_id, per-payment breakdown, and aggregated EIP-3009 sign instruction.

**Example:**
```
nexus_orchestrate_payment({
  quotes: [flight_quote, hotel_quote],
  payer_wallet: "0x1234567890abcdef1234567890abcdef12345678"
})
```

---

### `nexus_get_payment_status` (role: status)

Check payment status by any identifier.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `nexus_payment_id` | string | No | Nexus payment ID (e.g. `PAY-...`) |
| `merchant_order_ref` | string | No | Merchant order reference (e.g. `FLT-...`, `HTL-...`) |
| `group_id` | string | No | Payment group ID (e.g. `GRP-...`) |

At least one parameter must be provided.

**Returns:** Payment status, group status, and all payments in the group.

## Aggregated Payment Flow

1. **Collect Quotes** — User Agent receives UCP responses from multiple Merchant Agents (e.g., flight + hotel). Each contains a `nexus_v1` payment handler with a quote in the `config` field.
2. **Discover Nexus Core** — The UCP response includes a `nexus_core` object with `mcp_endpoint`. Connect to this MCP server.
3. **Orchestrate** — Call `nexus_orchestrate_payment` with all quotes and the payer's wallet address. Nexus Core validates each quote, creates a payment group, and returns a single EIP-3009 authorization covering the total amount.
4. **Sign** — User signs the EIP-3009 authorization once (total = flight + hotel).
5. **Settle** — Each merchant independently confirms delivery and triggers release of their portion from escrow.
