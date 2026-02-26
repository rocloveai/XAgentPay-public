---
name: nexus-core
version: "0.5.0"
description: NexusPay Core — payment orchestration for multi-merchant aggregated checkout
protocol: NUPS/1.5
category: finance.payment
currencies: [USDC]
chain_id: 20250407
escrow_proxy: "0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236"
tools:
  - name: nexus_orchestrate_payment
    role: orchestrate
  - name: nexus_get_payment_status
    role: status
  - name: nexus_confirm_deposit
    role: deposit
  - name: nexus_release_payment
    role: release
  - name: nexus_dispute_payment
    role: dispute
  - name: nexus_resolve_dispute
    role: resolve
  - name: nexus_confirm_fulfillment
    role: fulfillment
  - name: discover_agents
    role: discovery
    description: Search and discover merchant agents by keyword/category, ranked by stars
  - name: get_agent_skill
    role: discovery
    description: Fetch full skill.md content for a specific merchant agent
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

**Option A — `quotes_json` string (recommended for CLI):**

```
nexus_orchestrate_payment({
  quotes_json: "[{\"merchant_did\":\"did:nexus:20250407:demo_flight\",\"merchant_order_ref\":\"FLT-001\",\"amount\":\"100000\",\"currency\":\"USDC\",\"chain_id\":20250407,\"expiry\":9999999999,\"context\":{\"summary\":\"Flight\",\"line_items\":[]},\"signature\":\"0x...\"}]",
  payer_wallet: "0xUserWalletAddress"
})
```

**Option B — `quotes` array (if your MCP client supports complex objects):**

```
nexus_orchestrate_payment({
  quotes: [flight_quote_config, hotel_quote_config],
  payer_wallet: "0xUserWalletAddress"
})
```

Both options accept raw `config` objects, full UCP envelopes, or handler objects — the orchestrator auto-extracts the quote from wrapped formats.

## Connection

### MCP (SSE)

```json
{
  "mcpServers": {
    "nexus-core": {
      "url": "https://nexus-core-361y.onrender.com/sse"
    }
  }
}
```

### HTTP REST (curl)

All core functionality is also available via plain HTTP. No MCP client required.

**Base URL:** `https://nexus-core-361y.onrender.com`

#### `POST /api/orchestrate` — Create Payment (HTTP 402)

Submit quotes and receive payment instructions. Returns **HTTP 402 Payment Required** with EIP-3009 signing data.

```bash
curl -X POST https://nexus-core-361y.onrender.com/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "quotes": [
      {
        "merchant_did": "did:nexus:20250407:demo_flight",
        "merchant_order_ref": "FLT-001",
        "amount": "100000",
        "currency": "USDC",
        "chain_id": 20250407,
        "expiry": 9999999999,
        "context": {"summary": "Flight SFO→LAX", "line_items": []},
        "signature": "0x..."
      }
    ],
    "payer_wallet": "0xYourWalletAddress"
  }'
```

Response (HTTP 402):
```json
{
  "group": { "group_id": "GRP-...", "total_amount": "100000" },
  "checkout_url": "https://nexus-core-361y.onrender.com/checkout/GRP-...",
  "sign_instruction": { "...EIP-3009 typed data..." }
}
```

#### `GET /api/checkout/:groupId` — Payment Group Details

```bash
curl https://nexus-core-361y.onrender.com/api/checkout/GRP-abc123
```

#### `POST /api/checkout/:groupId/confirm` — Confirm Transaction

After the user signs and submits the on-chain transaction:

```bash
curl -X POST https://nexus-core-361y.onrender.com/api/checkout/GRP-abc123/confirm \
  -H "Content-Type: application/json" \
  -d '{"tx_hash": "0xabcdef..."}'
```

#### `GET /checkout/:groupId` — Browser Checkout Page

Open in browser for MetaMask-powered interactive checkout:
```
https://nexus-core-361y.onrender.com/checkout/GRP-abc123
```

#### `GET /health` — Health Check

```bash
curl https://nexus-core-361y.onrender.com/health
```

## MCP Tools

### `nexus_orchestrate_payment`

Orchestrate aggregated payment for one or more merchant quotes. Validates signatures, creates a payment group, and returns a single EIP-3009 signing instruction covering the total amount.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `quotes_json` | string | Preferred | JSON string of the quotes array. Use this for reliable CLI/MCP compatibility. |
| `quotes` | array | Alternative | Array of `NexusQuotePayload` objects. Use if your MCP client handles complex objects well. |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

One of `quotes_json` or `quotes` must be provided. Both accept raw quotes, full UCP envelopes, or handler objects (auto-unwrapped).

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

### `nexus_confirm_deposit`

Confirm a user-submitted batch deposit transaction. Call this after the user signs EIP-3009 and sends `batchDepositWithAuthorization` via MetaMask.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Payment group ID (e.g. `GRP-...`) |
| `tx_hash` | string | Yes | Transaction hash from user's MetaMask submission (`0x...`) |

---

### `nexus_release_payment`

Release escrowed funds to the merchant. Called by merchant agent after fulfillment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | Nexus payment ID (e.g. `PAY-...`) |

---

### `nexus_dispute_payment`

Open a dispute for an escrowed payment. Returns calldata for the payer to submit on-chain.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | Nexus payment ID (e.g. `PAY-...`) |
| `reason` | string | Yes | Dispute reason (UTF-8, max 256 chars) |

---

### `nexus_resolve_dispute`

Resolve a disputed payment by splitting funds between merchant and payer. Only callable when payment is DISPUTE_OPEN.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | Nexus payment ID (e.g. `PAY-...`) |
| `merchant_bps` | number | Yes | Basis points (0–10000) allocated to merchant |

---

### `nexus_confirm_fulfillment`

Confirm fulfillment of a payment. If ESCROWED, submits release to escrow contract. If SETTLED, transitions to COMPLETED. Two-step process: ESCROWED → SETTLED, then call again for SETTLED → COMPLETED.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | Nexus payment ID (e.g. `PAY-...`) |
| `fulfillment_proof` | string | No | Proof of fulfillment (URL, hash, etc.) |

---

### `discover_agents`

Search and discover merchant agents in the Nexus marketplace. Returns agents ranked by stars.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | No | Keyword to search agent names and descriptions |
| `category` | string | No | Category prefix filter (e.g. `travel`, `food`) |
| `limit` | number | No | Max results (default 20, max 50) |

---

### `get_agent_skill`

Fetch the full skill.md content for a specific merchant agent.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `merchant_did` | string | Yes | Merchant DID (e.g. `did:nexus:20250407:demo_flight`) |

---

## End-to-End Payment Flow

1. **Collect Quotes** — Call merchant agents' `nexus_generate_quote` tools. Each returns a UCP checkout response containing a `config` (NexusQuotePayload) inside `urn:ucp:payment:nexus_v1`.
2. **Orchestrate** — Call `nexus_orchestrate_payment` with all `config` objects as the `quotes` array, plus the user's `payer_wallet`. Nexus Core validates each quote, creates a payment group, and returns a single EIP-3009 authorization for the total. Also available via `POST /api/orchestrate` (HTTP 402).
3. **Sign & Submit** — User signs the EIP-3009 typed data and submits `batchDepositWithAuthorization` on-chain (via MetaMask checkout page or wallet SDK).
4. **Confirm** — Call `nexus_confirm_deposit` with `group_id` + `tx_hash`, or `POST /api/checkout/:groupId/confirm`.
5. **Track** — Call `nexus_get_payment_status` with `group_id` to monitor progress (CREATED → ESCROWED → SETTLED → COMPLETED).
6. **Fulfill** — Each merchant confirms delivery via `nexus_confirm_fulfillment`.

## Contract

- **Escrow Proxy (UUPS):** `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236` (stable address, upgradeable)
- **USDC:** `0xFF8dEe9983768D0399673014cf77826896F97e4d`
- **Chain:** PlatON Devnet (chainId 20250407)
