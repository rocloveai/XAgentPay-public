---
name: xagent-core
version: "0.5.0"
description: xXAgent Pay Core — HTTP REST API for multi-merchant aggregated escrow checkout
protocol: NUPS/1.5
category: finance.payment
currencies: [USDC]
chain_id: 196
---

# XAgent Pay Core — HTTP REST API

**Pay for merchant orders in a single aggregated transaction via HTTP.** No MCP client required — all functionality is available as standard REST endpoints.

> For MCP tool definitions and connection config, see [skill.md](https://api.xagenpay.com/skill.md).

**Base URL:** `https://api.xagenpay.com`

## Step 1 — Orchestrate Payment

Submit all merchant quotes + user wallet to create a payment group.

```bash
curl -X POST https://api.xagenpay.com/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "quotes": [
      {
        "merchant_did": "did:xagent:196:demo_flight",
        "merchant_order_ref": "FLT-001",
        "amount": "100000",
        "currency": "USDC",
        "chain_id": 196,
        "expiry": 9999999999,
        "context": {"summary": "Flight SFO-LAX", "line_items": []},
        "signature": "0x..."
      }
    ],
    "payer_wallet": "0xYourWalletAddress"
  }'
```

### How to extract quotes from merchant responses

The quote you need is at:
`response.ucp.payment_handlers["urn:ucp:payment:xagent_v1"][0].config`

Required fields: `merchant_did`, `merchant_order_ref`, `amount`, `currency`, `chain_id`, `expiry`, `context`, `signature`.

### Response (HTTP 402)

```json
{
  "http_status": 402,
  "xagent_version": "0.5.0",
  "group_id": "grp_...",
  "status": "PAYMENT_REQUIRED",
  "checkout_url": "https://api.xagenpay.com/checkout/tok_...",
  "instruction": {
    "group_id": "grp_...",
    "chain_id": 196,
    "chain_name": "XLayer Mainnet",
    "rpc_url": "https://rpc.xlayer.tech",
    "payment_method": "ESCROW_CONTRACT",
    "escrow_contract": "0x49F9ad8F2c480F8cF9e02b30f8c634F004372cc2",
    "token_address": "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
    "token_symbol": "USDC",
    "token_decimals": 6,
    "total_amount_uint256": "100000",
    "total_amount_display": "0.10",
    "payments": [
      {
        "xagent_payment_id": "PAY-...",
        "merchant_did": "did:xagent:196:demo_flight",
        "merchant_order_ref": "FLT-001",
        "merchant_address": "0x...",
        "amount_uint256": "100000",
        "amount_display": "0.10",
        "summary": "Flight SFO-LAX",
        "payment_id_bytes32": "0x...",
        "order_ref_bytes32": "0x...",
        "merchant_did_bytes32": "0x...",
        "context_hash": "0x..."
      }
    ],
    "eip3009_sign_data": { "...EIP-3009 typed data for eth_signTypedData_v4..." },
    "deposit_tx": { "to": "0x...", "abi": "function batchDepositWithAuthorization(...)", "value": "0", "gas_limit": "350000" },
    "user_action": "SIGN_AND_SEND",
    "gas_paid_by": "USER",
    "xagent_group_sig": "0x...EIP-712 signature...",
    "core_operator_address": "0x..."
  },
  "xagent_group_sig": "0x...EIP-712 signature...",
  "core_operator_address": "0x..."
}
```

**Key fields:**

| Field | Description |
|-------|-------------|
| `http_status` | HTTP status code mirrored in response body (e.g. `402`). Present in **all** JSON responses. |
| `checkout_url` | Token-protected URL (valid 1 hour). Open in browser for MetaMask checkout. |
| `instruction.eip3009_sign_data` | EIP-3009 typed data — user signs via `eth_signTypedData_v4` |
| `instruction.deposit_tx` | ABI and target for `batchDepositWithAuthorization` — user submits tx (pays gas) |
| `instruction.payments[].payment_id_bytes32` | Precomputed `keccak256(xagent_payment_id)` for on-chain `BatchEntry` |
| `instruction.payments[].context_hash` | Precomputed `keccak256(JSON.stringify(context))` — matches on-chain exactly |
| `instruction.xagent_group_sig` | EIP-712 signature over `(groupId, entriesHash, totalAmount)` by XAgent Pay Core operator |
| `instruction.core_operator_address` | Address of the signing operator — verify before submitting |

## Step 2 — Pay

The 402 response provides **two payment paths**:

**Path A — Checkout URL (for human users):**
Direct the user to open `checkout_url` in their browser. The checkout page handles MetaMask wallet connection, chain switching, EIP-3009 signing, and transaction submission automatically. This is the recommended path when the end user has a browser with MetaMask.

**Path B — Programmatic (for capable agents):**
Use the `instruction` object to construct the transaction directly:
1. Present `instruction.eip3009_sign_data` to the user's wallet via `eth_signTypedData_v4`
2. Submit `instruction.deposit_tx` on-chain (user pays gas)
3. Verify `instruction.xagent_group_sig` against `instruction.core_operator_address` before submitting

This path is suitable when the agent has direct access to wallet signing (e.g. via MPC wallet, AA wallet, or user-delegated signing).

## Step 3 — Confirm Deposit

After the user submits the on-chain transaction (via either path):

```bash
curl -X POST https://api.xagenpay.com/api/checkout/tok_.../confirm \
  -H "Content-Type: application/json" \
  -d '{"tx_hash": "0x..."}'
```

## Step 4 — Track Status

```bash
curl "https://api.xagenpay.com/api/payments?group_id=grp_..."
```

Status lifecycle: `CREATED` -> `ESCROWED` -> `SETTLED` -> `COMPLETED`

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orchestrate` | POST | Create payment group (returns HTTP 402) |
| `/api/checkout/:token` | GET | Get payment group details |
| `/api/checkout/:token/confirm` | POST | Confirm on-chain transaction |
| `/api/payments/:id` | GET | Payment status by XAgent Pay payment ID |
| `/api/payments?group_id=...` | GET | Payment status by group ID |
| `/api/payments?merchant_order_ref=...` | GET | Payment status by merchant order ref |
| `/api/agents` | GET | Discover merchant agents |
| `/api/agents?query=...&category=...` | GET | Search agents by keyword/category |
| `/api/agents/:did/skill` | GET | Fetch agent's skill.md content |
| `/checkout/:token` | GET | Browser checkout page (MetaMask) |
| `/health` | GET | Health check |
| `/api/health` | GET | Detailed health (relayer balance, services) |

### `GET /api/checkout/:token` — Payment Group Details

Retrieve group, payments, and instruction for a checkout token. The `:token` can be a `tok_...` token (from `checkout_url`) or a direct `grp_...` / `GRP-...` group ID.

```bash
curl https://api.xagenpay.com/api/checkout/tok_abc123...
```

### `GET /checkout/:token` — Browser Checkout Page

Open in browser for MetaMask-powered interactive checkout. The checkout page handles wallet connection, chain switching, EIP-3009 signing, and transaction submission.

```
https://api.xagenpay.com/checkout/tok_abc123...
```

> **Note:** Checkout URLs expire after 1 hour. If expired, the user must re-orchestrate to get a new URL.

### `GET /api/payments/:id` — Payment Status

Query payment status by XAgent Pay payment ID:

```bash
curl https://api.xagenpay.com/api/payments/PAY-xxx
```

Response (HTTP 200):
```json
{
  "http_status": 200,
  "payment": {
    "xagent_payment_id": "PAY-xxx",
    "status": "ESCROWED",
    "amount_display": "0.10",
    "currency": "USDC",
    "merchant_did": "did:xagent:...",
    "merchant_order_ref": "FLT-123",
    "tx_hash": "0x..."
  },
  "group": {
    "group_id": "grp_xxx",
    "status": "GROUP_ESCROWED",
    "total_amount_display": "0.10",
    "payment_count": 1
  },
  "group_payments": [
    { "xagent_payment_id": "PAY-xxx", "status": "ESCROWED", "amount_display": "0.10" }
  ]
}
```

### `GET /api/agents` — Discover Merchant Agents

Search and discover merchant agents. No authentication required.

```bash
curl "https://api.xagenpay.com/api/agents"
curl "https://api.xagenpay.com/api/agents?query=flight&category=travel&limit=10"
```

Response (HTTP 200):
```json
{
  "http_status": 200,
  "agents": [
    {
      "merchant_did": "did:xagent:196:demo_flight",
      "name": "Demo Flight Agent",
      "description": "Book flights with USDC",
      "category": "travel.flights",
      "mcp_endpoint": "https://xagenpay.com/flight/mcp",
      "skill_md_url": "https://xagenpay.com/flight/skill.md",
      "currencies": ["USDC"],
      "health_status": "ONLINE",
      "stars": 5,
      "tools": [{ "name": "xagent_generate_quote", "role": "quote" }]
    }
  ],
  "total": 1,
  "limit": 20
}
```

### `GET /api/agents/:did/skill` — Agent Skill File

Fetch the full skill.md content for a specific merchant agent. Returns `text/markdown`.

```bash
curl https://api.xagenpay.com/api/agents/did:xagent:196:demo_flight/skill
```

### Rate Limits

All HTTP endpoints are rate-limited per IP address (30 requests/minute burst, ~0.5/sec sustained). Rate limit headers are included in every response:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1709712460
```

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
