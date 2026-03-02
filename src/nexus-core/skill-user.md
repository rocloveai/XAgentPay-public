---
name: nexus-core
version: "0.5.0"
description: NexusPay Core — pay for merchant orders via aggregated escrow checkout
protocol: NUPS/1.5
category: finance.payment
currencies: [USDC]
chain_id: 20250407
---

# Nexus Core — User Agent Guide

**Pay for merchant orders in a single aggregated transaction.** Submit one or more merchant quotes, get signing instructions, and confirm on-chain.

## Step 1 — Orchestrate Payment

Submit all merchant quotes + user wallet to create a payment group.

**MCP:**
```
nexus_orchestrate_payment({
  quotes_json: "[{\"merchant_did\":\"did:nexus:20250407:demo_flight\",\"merchant_order_ref\":\"FLT-001\",\"amount\":\"100000\",\"currency\":\"USDC\",\"chain_id\":20250407,\"expiry\":9999999999,\"context\":{\"summary\":\"Flight SFO-LAX\",\"line_items\":[]},\"signature\":\"0x...\"}]",
  payer_wallet: "0xUserWalletAddress"
})
```

**HTTP (no MCP required):**
```bash
curl -X POST https://api.nexus-mvp.topos.one/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"quotes": [...], "payer_wallet": "0x..."}'
```

**Response** (HTTP 402):
```json
{
  "http_status": 402,
  "checkout_url": "https://api.nexus-mvp.topos.one/checkout/tok_...",
  "group_id": "grp_...",
  "instruction": {
    "total_amount_display": "0.10",
    "token_symbol": "USDC",
    "eip3009_sign_data": { "...EIP-3009 typed data..." },
    "deposit_tx": { "to": "0x...", "abi": "function batchDepositWithAuthorization(...)" }
  }
}
```

### How to extract quotes from merchant responses

The quote you need is at:
`response.ucp.payment_handlers["urn:ucp:payment:nexus_v1"][0].config`

Required fields: `merchant_did`, `merchant_order_ref`, `amount`, `currency`, `chain_id`, `expiry`, `context`, `signature`.

## Step 2 — Pay

The 402 response provides **two payment paths**:

**Path A — Checkout URL (for human users):**
Direct the user to open `checkout_url` in their browser. The checkout page handles MetaMask wallet connection, chain switching, EIP-3009 signing, and transaction submission automatically. This is the recommended path when the end user has a browser with MetaMask.

**Path B — Programmatic (for capable agents):**
Use the `instruction` object to construct the transaction directly:
1. Present `instruction.eip3009_sign_data` to the user's wallet via `eth_signTypedData_v4`
2. Submit `instruction.deposit_tx` on-chain (user pays gas)
3. Verify `instruction.nexus_group_sig` against `instruction.core_operator_address` before submitting

This path is suitable when the agent has direct access to wallet signing (e.g. via MPC wallet, AA wallet, or user-delegated signing).

## Step 3 — Confirm Deposit

After the user submits the on-chain transaction (via either path):

**MCP:**
```
nexus_confirm_deposit({ group_id: "grp_...", tx_hash: "0x..." })
```

**HTTP:**
```bash
curl -X POST https://api.nexus-mvp.topos.one/api/checkout/tok_.../confirm \
  -H "Content-Type: application/json" \
  -d '{"tx_hash": "0x..."}'
```

## Step 4 — Track Status

**MCP:**
```
nexus_get_payment_status({ group_id: "grp_..." })
```

**HTTP:**
```bash
curl "https://api.nexus-mvp.topos.one/api/payments?group_id=grp_..."
```

Status lifecycle: `CREATED` → `ESCROWED` → `SETTLED` → `COMPLETED`

## Connection

### MCP (SSE)
```json
{ "mcpServers": { "nexus-core": { "url": "https://api.nexus-mvp.topos.one/sse" } } }
```

### HTTP REST
Base URL: `https://api.nexus-mvp.topos.one`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orchestrate` | POST | Create payment (returns 402) |
| `/api/checkout/:token` | GET | Get payment group details |
| `/api/checkout/:token/confirm` | POST | Confirm on-chain tx |
| `/api/payments/:id` | GET | Payment status by ID |
| `/api/payments?group_id=...` | GET | Payment status by group |
| `/api/agents` | GET | Discover merchant agents |

## MCP Tools (User Agent)

| Tool | Purpose |
|------|---------|
| `nexus_orchestrate_payment` | Submit quotes → get signing instructions |
| `nexus_confirm_deposit` | Confirm on-chain tx hash |
| `nexus_get_payment_status` | Check payment/group status |
| `discover_agents` | Search merchant agents |
| `get_agent_skill` | Fetch merchant skill.md |
