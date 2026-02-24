# RFC-005 v2: Nexus Payment Core Specification (MVP - Direct Settlement)

| Metadata | Value |
| --- | --- |
| **Title** | Nexus Payment Core Specification (MVP) |
| **Version** | 2.0.0 |
| **Status** | Standards Track (Draft) |
| **Supersedes** | RFC-005 v1.0.0 (partial, MVP scope) |
| **Author** | Cipher & Nexus Architect Team |
| **Created** | 2026-02-24 |
| **Scope** | Orchestration, State Management, Direct Settlement, Webhook Notification |
| **Chain** | PlatON (chain_id: 210425) |
| **Currency** | USDC (ERC-20) |

## 1. Abstract

本 RFC 定义 NexusPay Core 的 MVP 实现规范。与 RFC-005 v1 不同，本版本采用 **Direct Settlement** 模式：用户通过 ERC-20 transfer 将 USDC 直接支付到商户的 paymentAddress，Core 不触碰资金，仅负责编排、验证和状态管理。

跨链托管 (Hub-Spoke)、MPC 临时地址、Escrow 合约等高级特性保留在 RFC-007 中，待 MVP 验证后实施。

## 2. Design Principles

1. **Direct Settlement**: Core 不触碰资金，用户直接向商户地址转账
2. **Event-Driven State**: 状态变更基于链上 ERC-20 Transfer 事件
3. **MCP-First**: 所有能力通过 MCP Protocol 暴露
4. **Event Sourcing**: 每次状态变更生成不可变事件记录
5. **ISO Compliance**: 数据字段映射 ISO 20022 / ISO 4217 / ISO 24165

## 3. Architecture

```
UA --[MCP]--> NexusPay Core --[Webhook]--> MA
                  |
                  +-- Security Module (EIP-712, DID Resolver)
                  +-- Order State Machine (6 states)
                  +-- Chain Watcher (PlatON USDC Transfer)
                  +-- Webhook Notifier (HMAC signed)
                  +-- PostgreSQL (payments, events, merchants, webhooks)
                  |
          PlatON Chain (chain_id: 210425)
          USDC ERC-20 Direct Transfer
```

## 4. Payment Flow (Direct Settlement)

### 4.1 Happy Path

```
Step 1: UA obtains merchant Quote (NUPS v1.5, EIP-712 signed)
Step 2: UA calls Core orchestrate_payment(quote, payer_wallet)
        Core verifies sig -> DID resolves merchant addr -> creates payment -> returns PaymentInstruction
Step 3: UA executes on-chain USDC.transfer(merchantAddress, amount)
Step 4: UA calls Core submit_tx(payment_id, tx_hash)
Step 5: Core Chain Watcher confirms on-chain Transfer event
Step 6: Core sends Webhook to MA: payment.settled
Step 7: MA confirms fulfillment
```

### 4.2 PaymentInstruction Schema

Core returns this to UA:

```typescript
interface PaymentInstruction {
  readonly chain_id: 210425;
  readonly chain_name: "PlatON";
  readonly target_address: Address;   // merchant paymentAddress
  readonly token_address: Address;    // USDC contract address
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;
  readonly amount_uint256: string;
  readonly amount_display: string;
  readonly method: "erc20_transfer";
  readonly tx_data: {
    readonly to: Address;
    readonly data: Hex;       // transfer(address,uint256) calldata
    readonly value: "0";
  };
  readonly nexus_payment_id: string;
}
```

## 5. State Machine

### 5.1 States

| Status | Description | Trigger |
| --- | --- | --- |
| CREATED | Quote verified, payment created | orchestrate_payment success |
| AWAITING_TX | UA has PaymentInstruction | orchestrate_payment returns |
| BROADCASTED | UA submitted tx_hash | submit_tx call |
| SETTLED | On-chain Transfer confirmed | Chain Watcher |
| COMPLETED | Merchant confirmed fulfillment | confirm_fulfillment call |
| EXPIRED | Payment timed out | Timeout Handler |
| TX_FAILED | On-chain transaction reverted | Chain Watcher |
| RISK_REJECTED | Security check failed | Security Module |

### 5.2 Transition Rules

```
(none)        -> CREATED        [valid quote + signature]
CREATED       -> AWAITING_TX    [UA requests PaymentInstruction]
AWAITING_TX   -> BROADCASTED    [UA submits tx_hash]
AWAITING_TX   -> EXPIRED        [30 min timeout]
BROADCASTED   -> SETTLED        [on-chain Transfer confirmed]
BROADCASTED   -> TX_FAILED      [on-chain revert]
SETTLED       -> COMPLETED      [merchant confirms fulfillment]
```

Invalid transitions MUST be rejected with error.

### 5.3 Timeout Rules

| Scenario | Timeout | Action |
| --- | --- | --- |
| Quote expiry | quote.expiry timestamp | CREATED -> EXPIRED |
| Awaiting TX | 30 minutes | AWAITING_TX -> EXPIRED |
| TX confirmation | 10 minutes | Alert (no auto-transition) |
| Merchant fulfillment | 24 hours | Alert / dispute |

## 6. Security Specification

### 6.1 EIP-712 Quote Verification

```typescript
const NEXUS_DOMAIN = {
  name: "NexusPay",
  version: "1",
  chainId: 210425,
} as const;

const NEXUS_QUOTE_TYPES = {
  NexusQuote: [
    { name: "merchant_did", type: "string" },
    { name: "merchant_order_ref", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "currency", type: "string" },
    { name: "chain_id", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "context_hash", type: "bytes32" },
  ],
} as const;
```

Verification steps:
1. Reconstruct EIP-712 TypedData from quote fields
2. Recover signer address from signature
3. Resolve merchant_did to get registered signer
4. Compare recovered address with registered signer
5. Support EIP-1271 for contract wallets

### 6.2 Anti-Replay (Nonce Guard)

- quote_hash = EIP-712 structHash of the quote
- Unique constraint on (quote_hash) for active payments
- expiry timestamp check
- One active payment per merchant_order_ref

### 6.3 DID Resolution (MVP)

MVP uses a local merchant_registry table:

```sql
merchant_did       TEXT PRIMARY KEY
signer_address     TEXT NOT NULL    -- signing key address
payment_address    TEXT NOT NULL    -- receiving address
webhook_url        TEXT             -- callback URL
webhook_secret     TEXT             -- HMAC key
```

Upgrade path: read from on-chain NexusMerchantRegistry contract.

### 6.4 Payment Address Trust

CRITICAL: Core MUST resolve payment_address from the merchant_did registry. It MUST NOT trust any address passed in the quote or by the UA. This prevents payment redirection attacks.

## 7. MCP Interface

### 7.1 Tools

| Tool | Caller | Description |
| --- | --- | --- |
| nexus_orchestrate_payment | UA | Verify quote, create payment, return PaymentInstruction |
| nexus_submit_tx | UA | Submit tx_hash for tracking |
| nexus_get_payment_status | UA/MA | Query payment status |
| nexus_confirm_fulfillment | MA | Confirm merchant delivery |

### 7.2 Resources

| URI | Description |
| --- | --- |
| nexus://core/payments/{id} | Real-time payment status |

## 8. Chain Watcher Specification

### 8.1 Polling Strategy

- Poll PlatON RPC every 3 seconds for new blocks
- Filter ERC-20 Transfer logs where to IN (registered merchant addresses)
- Match: (to, amount) -> find pending payment
- On match: transition to SETTLED, record tx_hash, block_number

### 8.2 Transfer Event Verification

```
Given: Transfer(from, to, value) event in tx_receipt
Verify:
  1. to == payment.payment_address
  2. value == payment.amount (uint256)
  3. token contract == USDC contract address on PlatON
  4. receipt.status == 1
```

## 9. Webhook Notification

See RFC-009 for full specification. Key points:
- Events: payment.settled, payment.expired, payment.failed
- HMAC-SHA256 signature in X-Nexus-Signature header
- Exponential backoff retry (5 attempts)
- Idempotent via event_id

## 10. ISO 20022 Compliance

### 10.1 Field Mapping

| Nexus Field | ISO 20022 Element | Purpose |
| --- | --- | --- |
| nexus_payment_id | EndToEndId | End-to-end identifier |
| merchant_order_ref | RmtInf/Ustrd | Remittance info |
| amount_display | InstdAmt | Instructed amount |
| "USD" | InstdAmt@Ccy | ISO 4217 currency |
| "DTI:4H95J0R2X" | AddtlRmtInf | ISO 24165 USDC identifier |
| merchant_did | CdtrId | Creditor identifier |
| tx_hash | TxId | Transaction reference |

### 10.2 Accounting Integration

Webhook payloads include iso_metadata for direct ERP integration:

```json
{
  "iso_metadata": {
    "end_to_end_id": "NEX-xxx",
    "remittance_info": "FLT-xxx",
    "instructed_amount": "530.00",
    "instructed_currency": "USD",
    "creditor_id": "did:nexus:210425:demo_flight",
    "settlement_asset": "DTI:4H95J0R2X"
  }
}
```

## 11. Database Schema

Core tables:
- payments: Payment order records (see PRD-001 Section C.4)
- payment_events: Event sourcing (append-only)
- merchant_registry: Merchant identity registry (MVP local)
- webhook_delivery_logs: Webhook delivery tracking

## 12. Upgrade Path

| MVP (this RFC) | Future (RFC-005v1 + RFC-007) |
| --- | --- |
| Direct ERC-20 transfer | NexusRouter contract (batch pay) |
| Local merchant_registry | On-chain NexusMerchantRegistry |
| Basic signature verification | Full RiskGatekeeper with Permit |
| PlatON only | Hub-Spoke (PlatON + Base + Ethereum) |
| No escrow | MPC ephemeral address + Escrow |
| Webhook notification | MCP Resource subscription |

## 13. Copyright

Copyright (c) 2026 Nexus Protocol. All Rights Reserved.
