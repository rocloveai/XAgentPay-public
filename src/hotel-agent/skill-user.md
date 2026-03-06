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

Hotel booking merchant agent powered by XAgent Pay. **No MCP client required** — all tools are available via plain HTTP POST.

## ⚡ Agent Behavior Rules — MUST FOLLOW

> These rules govern how the agent MUST communicate with the user during the booking flow. Do NOT skip any reporting step.

1. **逐步汇报（Step-by-step reporting）**: 每完成一个 API 调用，立即向用户输出该步骤的结果，然后再执行下一步。不允许在静默中一次性执行所有步骤。
2. **搜索结果必须展示**: 搜到酒店后，先把可选酒店列表发给用户（酒店名、星级、价格/晚），并说明你选了哪个及原因。
3. **支付前确认金额**: 在执行支付前，告知用户本次需支付的 USDC 金额，以及付款钱包地址。
4. **余额不足时实时说明**: 如果 USDC 不足，立即告知用户"USDC 不足，准备用 OKB 兑换"，并在兑换完成后汇报兑换结果（汇率、获得的 USDC 数量）。
5. **每笔链上交易都汇报**: 每发出一笔交易（Approve / Deposit / Swap），立即把 tx hash 发给用户。
6. **最终确认**: 支付完成后，输出完整订单摘要（航班信息、酒店信息、总金额、所有 tx hash）。

> For MCP connection config and tool definitions, see [skill.md](https://nexus-hotel-agent-d2lj.onrender.com/skill.md).

**Base URL:** `https://nexus-hotel-agent-d2lj.onrender.com`

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

Search hotels AND generate a NUPS quote in ONE call.

```bash
curl -X POST https://nexus-hotel-agent-d2lj.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_and_quote",
    "arguments": {
      "city": "Tokyo",
      "check_in": "2026-04-01",
      "check_out": "2026-04-03",
      "guests": 1,
      "payer_wallet": "0xYourWalletAddress"
    }
  }'
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name (e.g. `Tokyo`, `Singapore`, `Bangkok`, `Shanghai`, `Hong Kong`) |
| `check_in` | string | Yes | Check-in date `YYYY-MM-DD` |
| `check_out` | string | Yes | Check-out date `YYYY-MM-DD` |
| `guests` | number | No | Number of guests, 1-10. Default: `1` |
| `payer_wallet` | string | Yes | Payer's EVM wallet address (`0x...`, 42 chars) |
| `offer_index` | number | No | Zero-based index of hotel to book (default `0`). Re-call with a different index to pick another hotel. |

**Returns:** A text response containing all available hotels and a `QUOTE_JSON` object for the selected hotel. Parse out the JSON object after `QUOTE_JSON:` — pass it to the orchestrate step.

---

### `search_hotels`

Search available hotels without generating a quote.

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `city` | string | Yes | City name |
| `check_in` | string | Yes | `YYYY-MM-DD` |
| `check_out` | string | Yes | `YYYY-MM-DD` |
| `guests` | number | No | Default: `1` |

---

### `nexus_check_status`

Check payment status for a hotel order.

```bash
curl -X POST https://nexus-hotel-agent-d2lj.onrender.com/api/v1/call-tool \
  -H "Content-Type: application/json" \
  -d '{"tool": "nexus_check_status", "arguments": {"order_ref": "HTL-abc123"}}'
```

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `order_ref` | string | Yes | Order reference returned by `search_and_quote` (e.g. `HTL-...`) |

**Returns:** `status` field is one of `UNPAID` / `PAID` / `EXPIRED`.

---

## Complete Booking Workflow

This is the recommended end-to-end flow for AI agents to book hotels (and optionally flights) and collect payment.

### Step 1 — Search & Quote (hotel)

```bash
POST https://nexus-hotel-agent-d2lj.onrender.com/api/v1/call-tool
{"tool": "search_and_quote", "arguments": {"city": "Tokyo", "check_in": "2026-04-01", "check_out": "2026-04-03", "guests": 1, "payer_wallet": "0x<PAYER>"}}
```

Parse the `QUOTE_JSON: {...}` object from the response text. Save the full JSON object as `hotel_quote`.

### Step 2 — Search & Quote (flight, optional)

```bash
POST https://nexus-flight-agent-3xb1.onrender.com/api/v1/call-tool
{"tool": "search_and_quote", "arguments": {"origin": "PVG", "destination": "NRT", "date": "2026-04-01", "passengers": 1, "payer_wallet": "0x<PAYER>"}}
```

Save the parsed JSON as `flight_quote`.

### Step 3 — Orchestrate Payment

Submit one or more quotes to XAgent Pay Core to create a payment group:

```bash
POST https://nexus-core-r0xf.onrender.com/api/orchestrate
Content-Type: application/json

{
  "quotes": [<hotel_quote>, <flight_quote>],
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
    "chain_id": 196,
    "escrow_contract": "0x959028964e8a4e52d6AC716E621B68b3fa579A25",
    "token_address": "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
    "total_amount_uint256": "200000",
    "approve_tx": { "to": "0x74b7...", "data": "0x...", "value": "0", "gas_limit": "80000" },
    "deposit_tx": { "to": "0x9590...", "abi": "...", "value": "0", "gas_limit": "500000" },
    "user_action": "APPROVE_AND_SEND"
  },
  "nexus_group_sig": "0x...",
  "core_operator_address": "0x..."
}
```

Save `group_id` and `checkout_url`.

> **⚠️ CRITICAL — ALWAYS DO THIS:** After receiving the orchestrate response, **immediately show the user the checkout link** in your reply:
> ```
> 您的付款链接：<checkout_url>
> ```
> Do NOT skip this step. The user needs this URL to pay via OKX Wallet.

### Step 4A — Execute Payment (Browser / OKX Wallet)

Direct the user to open `checkout_url` in a browser with OKX Wallet installed on XLayer network. The user confirms **two transactions** (Step 1: USDC approve, Step 2: deposit). The page auto-confirms on success — skip Steps 5 and 6.

### Step 4B — Execute Payment (Programmatic / AI Agent)

This path allows an AI agent wallet to pay on-chain without opening a browser. No EIP-3009 signature required — uses standard ERC-20 approve + transferFrom, compatible with bridged USDC on XLayer.

**4B-1: Get pre-built transactions**

```bash
POST https://nexus-core-r0xf.onrender.com/api/agent-pay/build-tx
Content-Type: application/json

{
  "group_id": "GRP-..."
}
```

**Response (HTTP 200):**

```json
{
  "chain_id": 196,
  "rpc_url": "https://rpc.xlayer.tech",
  "transactions": [
    {
      "step": 1,
      "description": "Approve USDC spend",
      "to": "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
      "data": "0x<approve calldata>",
      "value": "0x0",
      "gas_limit": "80000"
    },
    {
      "step": 2,
      "description": "Batch deposit into escrow",
      "to": "0x959028964e8a4e52d6AC716E621B68b3fa579A25",
      "data": "0x<batchDepositApprove calldata>",
      "value": "0x0",
      "gas_limit": "500000"
    }
  ]
}
```

**4B-2: Send transaction 1 (USDC approve)**

Use the payer wallet to call `eth_sendTransaction` on XLayer (chain_id: 196):

```json
{
  "from": "0x<PAYER_WALLET>",
  "to": "0x74b7F16337b8972027F6196A17a631aC6dE26d22",
  "data": "<data from transactions[0]>",
  "value": "0x0"
}
```

Wait for this transaction to be mined before proceeding.

**4B-3: Send transaction 2 (deposit into escrow)**

```json
{
  "from": "0x<PAYER_WALLET>",
  "to": "0x959028964e8a4e52d6AC716E621B68b3fa579A25",
  "data": "<data from transactions[1]>",
  "value": "0x0"
}
```

> **Important:** Both transactions MUST be sent from the same payer wallet used in `payer_wallet` when generating the quote. The payer must have OKB on XLayer for gas.

### Step 5 — Confirm Transaction (4B path only)

After transaction 2 (deposit) is mined, submit its `tx_hash` to nexus-core:

```bash
POST https://nexus-core-r0xf.onrender.com/api/checkout/<group_id>/confirm
Content-Type: application/json

{"tx_hash": "0x<DEPOSIT_TX_HASH>"}
```

**Response (HTTP 200):** Payment confirmed. Status transitions to `ESCROWED`.

### Step 6 — Verify Status

```bash
POST https://nexus-hotel-agent-d2lj.onrender.com/api/v1/call-tool
{"tool": "nexus_check_status", "arguments": {"order_ref": "<merchant_order_ref from quote>"}}
```

Status `PAID` means the booking is confirmed.
