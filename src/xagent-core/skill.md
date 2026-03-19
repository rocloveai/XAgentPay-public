---
name: xagent-core
version: "0.5.0"
description: xXAgent Pay Core — payment orchestration MCP server for multi-merchant aggregated checkout
protocol: NUPS/1.5
category: finance.payment
currencies: [USDC]
chain_id: 196
escrow_proxy: "0x49F9ad8F2c480F8cF9e02b30f8c634F004372cc2"
tools:
  - name: xagent_orchestrate_payment
    role: orchestrate
  - name: xagent_get_payment_status
    role: status
  - name: xagent_confirm_deposit
    role: deposit
  - name: xagent_release_payment
    role: release
  - name: xagent_dispute_payment
    role: dispute
  - name: xagent_resolve_dispute
    role: resolve
  - name: xagent_confirm_fulfillment
    role: fulfillment
  - name: discover_agents
    role: discovery
    description: Search and discover merchant agents by keyword/category, ranked by stars
  - name: get_agent_skill
    role: discovery
    description: Fetch full skill.md content for a specific merchant agent
---

# XAgent Pay Core — MCP Skill

Payment orchestration MCP server. **When a user wants to pay for orders from merchant agents (flights, hotels, etc.), submit all quotes here for a single aggregated payment.**

> For HTTP REST API docs (no MCP client required), see [skill-user.md](https://api.xagenpay.com/skill-user.md).

## MCP Connection

```json
{
  "mcpServers": {
    "xagent-core": {
      "url": "https://api.xagenpay.com/mcp"
    }
  }
}
```

Transport: **Streamable HTTP** (stateless, single `POST /mcp` per request).

## Quick Start

> You received one or more NUPS quotes from merchant agents (e.g. `xagent_generate_quote`).
> Now call **`xagent_orchestrate_payment`** with all quotes + the user's wallet to create a payment group and get signing instructions.

### How to extract quotes from merchant responses

Merchant agents return a UCP Checkout Response. The quote you need is at:
`response.ucp.payment_handlers["urn:ucp:payment:xagent_v1"][0].config`

The `config` object is a `XAgent PayQuotePayload` with these required fields:
- `merchant_did` (string)
- `merchant_order_ref` (string)
- `amount` (string — uint256, e.g. `"100000"` for 0.10 USDC)
- `currency` (string)
- `chain_id` (number)
- `expiry` (number — unix timestamp in seconds)
- `context` (object with `summary` and `line_items`)
- `signature` (string — EIP-712 signature from merchant signer)

### Calling the orchestrator

**Option A — `quotes_json` string (recommended for CLI):**

```
xagent_orchestrate_payment({
  quotes_json: "[{\"merchant_did\":\"did:xagent:196:demo_flight\",\"merchant_order_ref\":\"FLT-001\",\"amount\":\"100000\",\"currency\":\"USDC\",\"chain_id\":196,\"expiry\":9999999999,\"context\":{\"summary\":\"Flight\",\"line_items\":[]},\"signature\":\"0x...\"}]",
  payer_wallet: "0xUserWalletAddress"
})
```

**Option B — `quotes` array (if your MCP client supports complex objects):**

```
xagent_orchestrate_payment({
  quotes: [flight_quote_config, hotel_quote_config],
  payer_wallet: "0xUserWalletAddress"
})
```

Both options accept raw `config` objects, full UCP envelopes, or handler objects — the orchestrator auto-extracts the quote from wrapped formats.

## MCP Tools

### `xagent_orchestrate_payment`

Orchestrate aggregated payment for one or more merchant quotes. Validates signatures, creates a payment group, and returns a `BatchDepositInstruction` with EIP-3009 signing data, precomputed on-chain hashes, and a group signature from the XAgent Pay Core operator.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `quotes_json` | string | Preferred | JSON string of the quotes array. Use this for reliable CLI/MCP compatibility. |
| `quotes` | array | Alternative | Array of `XAgent PayQuotePayload` objects. Use if your MCP client handles complex objects well. |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |

One of `quotes_json` or `quotes` must be provided. Both accept raw quotes, full UCP envelopes, or handler objects (auto-unwrapped).

**Returns:** `PaymentRequired402` with `group_id`, `checkout_url` (token-protected, 1-hour TTL), `instruction` (BatchDepositInstruction), `xagent_group_sig`, and `core_operator_address`.

---

### `xagent_get_payment_status`

Check payment status by any identifier.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `xagent_payment_id` | string | No | XAgent Pay payment ID (e.g. `PAY-...`) |
| `merchant_order_ref` | string | No | Merchant order reference (e.g. `FLT-...`, `HTL-...`) |
| `group_id` | string | No | Payment group ID (e.g. `grp_...`) |

At least one parameter must be provided.

---

### `xagent_confirm_deposit`

Confirm a user-submitted batch deposit transaction. Call this after the user signs EIP-3009 and sends `batchDepositWithAuthorization` via MetaMask.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `group_id` | string | Yes | Payment group ID (e.g. `grp_...`) |
| `tx_hash` | string | Yes | Transaction hash from user's MetaMask submission (`0x...`) |

---

### `xagent_release_payment`

Release escrowed funds to the merchant. Called by merchant agent after fulfillment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | XAgent Pay payment ID (e.g. `PAY-...`) |

---

### `xagent_dispute_payment`

Open a dispute for an escrowed payment. Returns calldata for the payer to submit on-chain (only payer can call dispute on the contract).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | XAgent Pay payment ID (e.g. `PAY-...`) |
| `reason` | string | Yes | Dispute reason (UTF-8, max 256 chars) |

---

### `xagent_resolve_dispute`

Resolve a disputed payment by splitting funds between merchant and payer. Only callable when payment is DISPUTE_OPEN.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | XAgent Pay payment ID (e.g. `PAY-...`) |
| `merchant_bps` | number | Yes | Basis points (0-10000) allocated to merchant |

---

### `xagent_confirm_fulfillment`

Confirm fulfillment of a payment. If ESCROWED, submits release to escrow contract (async). If SETTLED, transitions to COMPLETED. Two-step process: ESCROWED -> SETTLED, then call again for SETTLED -> COMPLETED.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `payment_id` | string | Yes | XAgent Pay payment ID (e.g. `PAY-...`) |
| `fulfillment_proof` | string | No | Proof of fulfillment (URL, hash, etc.) |

---

### `discover_agents`

Search and discover merchant agents in the XAgent Pay marketplace. Returns agents ranked by stars.

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
| `merchant_did` | string | Yes | Merchant DID (e.g. `did:xagent:196:demo_flight`) |

---

## End-to-End Payment Flow

1. **Discover** (optional) — Call `discover_agents` to find merchant agents, then `get_agent_skill` to read their capabilities.
2. **Collect Quotes** — Call merchant agents' `xagent_generate_quote` tools. Each returns a UCP checkout response containing a `config` (XAgent PayQuotePayload) inside `urn:ucp:payment:xagent_v1`.
3. **Orchestrate** — Call `xagent_orchestrate_payment` with all `config` objects as the `quotes` array, plus the user's `payer_wallet`. XAgent Pay Core validates each quote, creates a payment group, and returns a `BatchDepositInstruction` with EIP-3009 signing data and a group signature.
4. **Sign & Submit** — User signs the EIP-3009 typed data via `eth_signTypedData_v4`, then submits `batchDepositWithAuthorization` on-chain (user pays gas). The checkout page at `checkout_url` handles this automatically via MetaMask.
5. **Confirm** — Call `xagent_confirm_deposit` with `group_id` + `tx_hash`.
6. **Track** — Call `xagent_get_payment_status` with `group_id` to monitor progress (CREATED -> ESCROWED -> SETTLED -> COMPLETED).
7. **Fulfill** — Each merchant confirms delivery via `xagent_confirm_fulfillment`.

## Security

### Group Signature (`xagent_group_sig`)

Every `BatchDepositInstruction` includes an EIP-712 signature from the XAgent Pay Core operator over `XAgent PayGroupApproval(groupId, entriesHash, totalAmount)`. This prevents MITM tampering of the payments array (merchant addresses and amounts). Clients should verify `xagent_group_sig` and `core_operator_address` before submitting transactions.

### Precomputed Hashes

All `bytes32` fields in `GroupPaymentDetail` (`payment_id_bytes32`, `order_ref_bytes32`, `merchant_did_bytes32`, `context_hash`) are precomputed on the server using `keccak256`. Clients use these directly when building on-chain calldata, eliminating hash mismatch bugs between server and client.

### Token-Protected Checkout URLs

Checkout URLs use short-lived tokens (`tok_...`) instead of raw group IDs. Tokens expire after 1 hour and are single-use. Direct `grp_` / `GRP-` IDs are still accepted as fallback.

## Contract

- **Escrow Proxy (UUPS):** `0x49F9ad8F2c480F8cF9e02b30f8c634F004372cc2` (stable address, upgradeable)
- **USDC:** `0x74b7F16337b8972027F6196A17a631aC6dE26d22`
- **Chain:** XLayer Mainnet (chainId `196`)
- **RPC:** `https://rpc.xlayer.tech`
- **Explorer:** `https://www.oklink.com/xlayer`
