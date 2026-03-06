# TC-005: Dispute Flow

## Module
`nexus_dispute_payment` / `nexus_resolve_dispute` (MCP) / Escrow Contract

> **Note:** Dispute and resolve are MCP-only tools — no HTTP REST endpoints exist for these operations.

## Prerequisites
- Payment in ESCROWED state
- Within dispute window (72 hours from escrow)
- Escrow contract v4.0.0 deployed
- **Note:** XLayer Devnet uses millisecond `block.timestamp` — all on-chain timeouts are in milliseconds

---

### TC-005-01: Open Dispute

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `nexus_dispute_payment` with:
   - `payment_id`: "PAY-xxx" (ESCROWED)
   - `reason`: "Service not delivered"

**Expected:**
- Payment transitions ESCROWED -> DISPUTE_OPEN
- Response includes calldata for payer to submit on-chain `dispute()` tx
- Webhook `dispute.opened` sent to merchant
- Event recorded with dispute reason

---

### TC-005-02: Dispute Reason Validation

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call dispute with `reason` longer than 256 characters
2. Call dispute with empty `reason`

**Expected:**
- >256 chars: error, reason too long
- Empty: error, reason required

---

### TC-005-03: Dispute on Non-ESCROWED Payment

**Priority:** P1
**Type:** Negative

**Steps:**
1. Attempt dispute on CREATED payment
2. Attempt dispute on SETTLED payment
3. Attempt dispute on COMPLETED payment

**Expected (each):**
- Error: payment not in valid state for dispute
- On-chain: `InvalidStatus` error (escrow requires status == DEPOSITED)
- No state change

---

### TC-005-04: Dispute After Deadline

**Priority:** P0
**Type:** Negative

**Steps:**
1. Payment ESCROWED, wait until dispute window expires (72 hours)
2. Attempt to open dispute

**Expected:**
- On-chain: `DisputeWindowExpired` error
- No state change

**Note:** Dispute window = 259,200,000 ms on XLayer (72 hours in milliseconds, since `block.timestamp` is ms)

---

### TC-005-05: Resolve Dispute (Split Funds)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Payment in DISPUTE_OPEN state
2. Call `nexus_resolve_dispute` with:
   - `payment_id`: "PAY-xxx"
   - `merchant_bps`: 7000 (70% to merchant)

**Expected:**
- Relayer submits `resolveDispute()` on-chain
- On-chain status: `RESOLVED_SPLIT` (0 < merchantBps < 10000)
- nexus-core maps to: DISPUTE_RESOLVED
- 70% of escrow sent to merchant, 30% to payer
- Webhook `dispute.resolved` sent
- Response includes tx_hash and split amounts

---

### TC-005-06: Resolve with Full Merchant Payout

**Priority:** P1
**Type:** Boundary

**Steps:**
1. Resolve dispute with `merchant_bps: 10000` (100%)

**Expected:**
- Full amount released to merchant
- 0 refunded to payer
- On-chain status: `RESOLVED_TO_MERCHANT`
- Valid transaction

---

### TC-005-07: Resolve with Full Payer Refund

**Priority:** P1
**Type:** Boundary

**Steps:**
1. Resolve dispute with `merchant_bps: 0` (0%)

**Expected:**
- Full amount refunded to payer
- 0 released to merchant
- On-chain status: `RESOLVED_TO_PAYER`
- Valid transaction

---

### TC-005-08: Invalid merchant_bps Range

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call resolve with `merchant_bps: -100`
2. Call resolve with `merchant_bps: 15000`

**Expected (each):**
- On-chain: `InvalidBps` error (must be 0-10000)
- No state change

---

### TC-005-09: Resolve Non-Disputed Payment

**Priority:** P1
**Type:** Negative

**Steps:**
1. Attempt resolve on ESCROWED payment (not disputed)

**Expected:**
- On-chain: `InvalidStatus` error (requires DISPUTED status)
- No state change

---

### TC-005-10: Auto-Refund After Arbitration Timeout

**Priority:** P0
**Type:** Functional

**Steps:**
1. Payment in DISPUTE_OPEN state
2. Wait for arbitration timeout (7 days)
3. Call `refundUnresolvedDispute` on escrow contract

**Expected:**
- On-chain: requires `block.timestamp >= disputeDeadline + arbitrationTimeout`
- Full amount refunded to payer (status: `RESOLVED_TO_PAYER`)
- nexus-core: payment transitions to REFUNDED
- H-01 audit fix verified
- `DisputeAutoResolved` event emitted

**Note:** Arbitration timeout = 604,800,000 ms on XLayer (7 days in milliseconds)

---

### TC-005-11: Reentrancy Protection

**Priority:** P0
**Type:** Security

**Steps:**
1. Attempt to call dispute while another dispute tx is executing

**Expected:**
- `nonReentrant` modifier prevents reentrancy
- L-01 audit fix verified

---

### TC-005-12: Fee Snapshot on Dispute

**Priority:** P2
**Type:** Security

**Steps:**
1. Note feeBps at time of escrow (stored in Escrow struct)
2. Admin changes feeBps
3. Resolve dispute

**Expected:**
- Fee calculated using snapshotted feeBps (not current), used at release time
- Dispute resolution (`resolveDispute`) does not deduct fees — only `release()` does
- L-04 audit fix verified
