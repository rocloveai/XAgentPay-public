# RFC-005 v3: Nexus Payment Core Specification (MVP - Escrow Settlement)

| Metadata | Value |
| --- | --- |
| **Title** | Nexus Payment Core Specification (MVP) |
| **Version** | 3.0.0 |
| **Status** | Standards Track (Draft) |
| **Supersedes** | RFC-005 v2.0.0 (Direct Settlement) |
| **Author** | Cipher & Nexus Architect Team |
| **Created** | 2026-02-24 |
| **Updated** | 2026-02-26 |
| **Scope** | Orchestration, State Management, Escrow Settlement, Group Payments, Webhook Notification |
| **Chain** | PlatON Devnet (chain_id: 20250407) |
| **Currency** | USDC (ERC-20, 6 decimals) |

## 1. Abstract

This RFC defines the MVP implementation specification for xNexus Core. Unlike v2's Direct Settlement, v3 adopts an **Escrow Settlement** model: users deposit USDC into the xNexusEscrow contract via EIP-3009 authorization signatures, and after merchant fulfillment, the Core's Relayer triggers the release.

Key changes (v2 -> v3):
1. **Escrow Settlement**: Funds are first locked in a smart contract and released after merchant confirms fulfillment
2. **Group/Batch Payments**: Multiple payments are aggregated into a group, completed in a single on-chain transaction
3. **EIP-3009 + Relayer**: Users only need to sign off-chain; the Relayer pays Gas on their behalf
4. **Group Signature**: EIP-712 signature to prevent MITM attacks (anti-MITM)
5. **Chain ID**: Updated from 210425 to 20250407

## 2. Design Principles

1. **Escrow Settlement**: Funds are guaranteed through a smart contract, released after merchant fulfillment, with automatic refund on timeout
2. **Gasless UX**: Users only need to sign EIP-3009 authorization; no need to hold LAT (PlatON native token)
3. **Batch Efficiency**: Multiple payments are aggregated into a group, sharing a single on-chain transaction
4. **MCP-First**: All capabilities are exposed through the MCP Protocol, with REST API also available
5. **Event Sourcing**: Each state change generates an immutable event record
6. **Anti-MITM**: Core operator signs Group instructions, verified on-chain to prevent tampering

## 3. Architecture

```
UA --[MCP/REST]--> xNexus Core --[Webhook]--> MA
                       |
                       +-- Security Module (EIP-712, DID Resolver, Group Sig)
                       +-- Order State Machine (12 states)
                       +-- Group Manager (batch orchestration)
                       +-- Chain Watcher (Escrow events: Deposited/Released/Refunded)
                       +-- Relayer (release/refund tx submission)
                       +-- Webhook Notifier (HMAC signed, RFC-009)
                       +-- PostgreSQL (payments, payment_groups, events, merchants, webhook_logs)
                       |
                  PlatON Devnet (chain_id: 20250407)
                  USDC (ERC-20) + xNexusEscrow (UUPS Proxy)
```

## 4. Payment Flow (Escrow Settlement)

### 4.1 Happy Path

```
Step 1: UA obtains merchant Quote (NUPS v1.5, EIP-712 signed)
Step 2: UA calls Core nexus_orchestrate_payment(quotes[], payer_wallet)
        Core verifies sigs -> DID resolves -> creates payment group -> returns 402 with BatchDepositInstruction
Step 3: User signs EIP-3009 TypedData (via MetaMask / wallet)
Step 4: User submits batchDepositWithGroupApproval() on-chain (or via Checkout page)
Step 5: Core Chain Watcher detects Deposited events -> status = ESCROWED
Step 6: Core sends Webhook to MA: payment.escrowed
Step 7: MA confirms fulfillment -> Core Relayer calls release() on escrow
Step 8: Chain Watcher detects Released event -> status = SETTLED
Step 9: Core sends Webhook to MA: payment.settled
Step 10: MA confirms completion -> status = COMPLETED
```

### 4.2 Checkout Page Flow (Browser)

Core provides a built-in Checkout page (`/checkout/:groupId`) as the wallet integration entry point:

```
Step 1: UA receives 402 response with checkout_url
Step 2: User opens checkout_url in browser with MetaMask
Step 3: Checkout page displays payment summary
Step 4: User clicks "Pay" -> MetaMask prompts EIP-3009 signature
Step 5: Checkout page submits batchDepositWithGroupApproval() tx
Step 6: Page polls /api/checkout/status until ESCROWED
Step 7: On-chain receipt verified -> ESCROWED transition
```

### 4.3 HTTP 402 Payment Required Response

Core's `POST /api/orchestrate` returns HTTP 402, containing two payment paths:

```typescript
interface PaymentRequired402 {
  readonly nexus_version: string;
  readonly group_id: string;
  readonly status: "PAYMENT_REQUIRED";
  readonly checkout_url: string;              // Browser checkout path
  readonly instruction: BatchDepositInstruction; // Direct on-chain submission
  readonly nexus_group_sig: Hex;              // EIP-712 anti-MITM signature
  readonly core_operator_address: Address;
}
```

### 4.4 BatchDepositInstruction Schema

```typescript
interface BatchDepositInstruction {
  readonly group_id: string;
  readonly chain_id: 20250407;
  readonly chain_name: "PlatON Devnet";
  readonly rpc_url: string;
  readonly payment_method: "ESCROW_CONTRACT";
  readonly escrow_contract: Address;     // UUPS proxy address
  readonly token_address: Address;       // USDC contract
  readonly token_symbol: "USDC";
  readonly token_decimals: 6;
  readonly total_amount_uint256: string;
  readonly total_amount_display: string;
  readonly payments: readonly GroupPaymentDetail[];
  readonly eip3009_sign_data: EIP3009SignData;  // EIP-3009 TypedData for signing
  readonly deposit_tx: {
    readonly to: Address;
    readonly abi: string;
    readonly value: "0";
    readonly gas_limit: string;
  };
  readonly user_action: "SIGN_AND_SEND";
  readonly gas_paid_by: "USER";
  readonly nexus_group_sig: Hex;         // Core operator's EIP-712 signature
  readonly core_operator_address: Address;
}
```

## 5. State Machine

### 5.1 States (12-state payment machine)

| Status | Description | Trigger |
| --- | --- | --- |
| CREATED | Quote verified, payment created | orchestrate_payment success |
| AWAITING_TX | Legacy: UA has PaymentInstruction | Direct Transfer mode (deprecated) |
| BROADCASTED | Legacy: UA submitted tx_hash | Direct Transfer mode (deprecated) |
| ESCROWED | Funds deposited in escrow contract | Chain Watcher (Deposited event) |
| SETTLED | Escrow released to merchant | Chain Watcher (Released event) |
| COMPLETED | Merchant confirmed fulfillment | confirm_fulfillment call |
| EXPIRED | Payment timed out | Timeout Handler |
| TX_FAILED | On-chain transaction reverted | Chain Watcher |
| RISK_REJECTED | Security check failed | Security Module (future) |
| REFUNDED | Escrow refunded to payer | Chain Watcher (Refunded event) |
| DISPUTE_OPEN | Payer opened dispute | Chain Watcher (Disputed event) |
| DISPUTE_RESOLVED | Arbiter resolved dispute | Chain Watcher (Resolved event) |

### 5.2 Transition Rules

```
(none)        -> CREATED          [valid quote + signature verified]
CREATED       -> ESCROWED         [Chain Watcher: Deposited event]
CREATED       -> EXPIRED          [timeout]
CREATED       -> RISK_REJECTED    [security check failed]
ESCROWED      -> SETTLED          [Chain Watcher: Released event]
ESCROWED      -> REFUNDED         [Chain Watcher: Refunded event]
ESCROWED      -> DISPUTE_OPEN     [Chain Watcher: Disputed event]
SETTLED       -> COMPLETED        [merchant confirms fulfillment]
DISPUTE_OPEN  -> DISPUTE_RESOLVED [Chain Watcher: Resolved event]

Legacy (Direct Transfer, deprecated):
CREATED       -> AWAITING_TX      [UA requests PaymentInstruction]
AWAITING_TX   -> BROADCASTED      [UA submits tx_hash]
BROADCASTED   -> SETTLED          [on-chain Transfer confirmed]
BROADCASTED   -> TX_FAILED        [on-chain revert]
```

Terminal statuses: COMPLETED, EXPIRED, TX_FAILED, RISK_REJECTED, REFUNDED, DISPUTE_RESOLVED

### 5.3 Group Statuses

Payments are grouped into `PaymentGroup` records for batch processing:

| Group Status | Description |
| --- | --- |
| GROUP_CREATED | Group created, payments pending |
| GROUP_AWAITING_TX | 402 returned, waiting for on-chain tx |
| GROUP_DEPOSITED | On-chain deposit confirmed (receipt verified) |
| GROUP_ESCROWED | All child payments transitioned to ESCROWED |
| GROUP_SETTLED | All child payments released |
| GROUP_COMPLETED | All child payments completed |
| GROUP_EXPIRED | Group timed out |
| GROUP_PARTIAL | Mixed states (some settled, some disputed) |

### 5.4 Timeout Rules

| Scenario | Timeout | Action |
| --- | --- | --- |
| Quote expiry | quote.expiry timestamp | CREATED -> EXPIRED |
| Awaiting deposit | 30 minutes | CREATED -> EXPIRED |
| Escrow release deadline | 24 hours (on-chain) | refund() callable by anyone |
| Dispute window | 72 hours (on-chain) | dispute() no longer callable |
| Arbitration timeout | 7 days (on-chain) | refundUnresolvedDispute() callable |

## 6. Security Specification

### 6.1 EIP-712 Quote Verification

```typescript
const NEXUS_QUOTE_DOMAIN = {
  name: "xNexus",
  version: "1",
  chainId: 20250407,
  verifyingContract: "0x0000000000000000000000000000000000000000",
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
3. Resolve merchant_did to get registered signer from merchant_registry
4. Compare recovered address with registered signer
5. Verify quote has not expired

### 6.2 Group Signature (Anti-MITM)

After Core generates the BatchDepositInstruction, it signs an EIP-712 GroupApproval using the Core Operator key:

```typescript
const GROUP_APPROVAL_TYPES = {
  NexusGroupApproval: [
    { name: "groupId", type: "bytes32" },
    { name: "entriesHash", type: "bytes32" },
    { name: "totalAmount", type: "uint256" },
  ],
} as const;
```

The on-chain `batchDepositWithGroupApproval()` verifies this signature, ensuring that the transaction parameters have not been tampered with.

### 6.3 Receipt Verification

When the Checkout confirms, Core verifies the on-chain transaction receipt:
- HTTP 200: receipt success -> transition to ESCROWED
- HTTP 202: receipt not available yet -> GROUP_AWAITING_TX (frontend polls)
- HTTP 422: receipt reverted -> error, no state change

### 6.4 DID Resolution (MVP)

MVP uses a local merchant_registry table:

```sql
merchant_did       TEXT PRIMARY KEY
signer_address     TEXT NOT NULL    -- signing key address
payment_address    TEXT NOT NULL    -- receiving address (escrow release target)
webhook_url        TEXT             -- callback URL
webhook_secret     TEXT             -- HMAC key
```

### 6.5 Payment Address Trust

CRITICAL: Core MUST resolve payment_address from the merchant_did registry. It MUST NOT trust any address passed in the quote or by the UA. This prevents payment redirection attacks.

## 7. Interface Specification

### 7.1 MCP Tools

| Tool | Caller | Description |
| --- | --- | --- |
| nexus_orchestrate_payment | UA | Verify quotes, create payment group, return 402 with BatchDepositInstruction |
| nexus_confirm_deposit | UA | Submit tx_hash for deposit verification |
| nexus_get_payment_status | UA/MA | Query payment or group status |
| nexus_release_payment | MA/Core | Trigger escrow release |
| nexus_confirm_fulfillment | MA | Confirm merchant delivery |

### 7.2 REST API

| Method | Path | Description |
| --- | --- | --- |
| POST | /api/orchestrate | Verify quotes, return 402 with payment instruction |
| POST | /api/checkout/confirm | Confirm deposit tx from checkout page |
| GET | /api/checkout/status/:groupId | Poll group status |
| GET | /api/payment/:id | Get payment details |
| POST | /api/merchant/confirm-fulfillment | Merchant confirms fulfillment (triggers release) |

### 7.3 Checkout Page

| Path | Description |
| --- | --- |
| /checkout/:groupId | Browser checkout page (MetaMask integration) |
| /portal | Core management portal |

## 8. Chain Watcher Specification

### 8.1 Polling Strategy

- Poll PlatON RPC every 3 seconds for new blocks
- Filter xNexusEscrow contract logs for:
  - `Deposited(paymentId, payer, merchant, amount, orderRef)`
  - `Released(paymentId, merchant, merchantAmount, feeAmount)`
  - `Refunded(paymentId, payer, amount)`
  - `Disputed(paymentId, payer, reason)`
  - `Resolved(paymentId, merchantBps, merchantAmount, payerAmount)`

### 8.2 Event Processing

```
On Deposited event:
  1. Match paymentId to payment record (payment_id_bytes32)
  2. Transition payment: CREATED -> ESCROWED
  3. Record deposit_tx_hash, release_deadline, dispute_deadline
  4. Send webhook: payment.escrowed

On Released event:
  1. Match paymentId to payment record
  2. Transition payment: ESCROWED -> SETTLED
  3. Record release_tx_hash, protocol_fee
  4. Send webhook: payment.settled

On Refunded event:
  1. Match paymentId to payment record
  2. Transition payment: ESCROWED -> REFUNDED
  3. Record refund_tx_hash
  4. Send webhook: payment.refunded
```

## 9. Relayer Service

The Relayer is a server-side service that submits transactions on behalf of the Core:

| Operation | Trigger | Gas Payer |
| --- | --- | --- |
| `release(paymentId)` | Merchant confirms fulfillment | Relayer |
| `refund(paymentId)` | Timeout auto-refund (future) | Relayer |

Relayer wallet: `0xf7EA5d3f0Bf8185c4f3C2F405D9a71009CF4D920` (also coreOperator on contract)

## 10. Webhook Notification

See RFC-009 for full specification. Key points:
- Events: payment.escrowed, payment.settled, payment.completed, payment.refunded, dispute.opened, dispute.resolved
- HMAC-SHA256 signature in `X-Nexus-Signature` header
- Exponential backoff retry (6 attempts: 10s, 30s, 2min, 10min, 30min)
- Idempotent via event_id
- Delivery logged in `webhook_delivery_logs` table

## 11. Database Schema

Core tables:
- **payments**: Payment order records (12-state machine, escrow fields)
- **payment_groups**: Group aggregation records (batch deposits)
- **payment_events**: Event sourcing (append-only)
- **merchant_registry**: Merchant identity + marketplace metadata
- **webhook_delivery_logs**: Webhook delivery tracking with retry state

## 12. Deployed Addresses

| Contract | Address | Type |
| --- | --- | --- |
| xNexusEscrow (Proxy) | `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236` | UUPS Proxy |
| xNexusEscrow (Impl v4.0.0) | `0x2EF4dB5E0021d074286c36821Cc897d2605e542E` | Implementation |
| USDC | `0xFF8dEe9983768D0399673014cf77826896F97e4d` | ERC-20 (FiatToken) |
| Relayer / Core Operator | `0xf7EA5d3f0Bf8185c4f3C2F405D9a71009CF4D920` | EOA |

## 13. Upgrade Path

| MVP (this RFC) | Future (RFC-005v1 + RFC-007) |
| --- | --- |
| Escrow settlement (single chain) | Hub-Spoke cross-chain (PlatON + Base + ETH) |
| Local merchant_registry | On-chain NexusMerchantRegistry |
| Basic signature verification | Full RiskGatekeeper with Permit |
| PlatON Devnet only | Multi-chain production |
| Browser checkout + MCP | `@nexus/buyer-skills` SDK |
| HMAC webhook | MCP Resource subscription |

## 14. Copyright

Copyright (c) 2026 Nexus Protocol. All Rights Reserved.
