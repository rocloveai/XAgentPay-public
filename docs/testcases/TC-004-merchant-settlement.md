# TC-004: Merchant Settlement

## Module
`nexus_confirm_fulfillment` (MCP) / `POST /api/merchant/confirm-fulfillment` (REST) / Relayer / ChainWatcher

## Prerequisites
- Payment in ESCROWED state
- Relayer configured with private key and sufficient gas balance
- Escrow contract deployed on PlatON Devnet

---

### TC-004-01: Confirm Fulfillment (ESCROWED -> Release Submitted)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Payment in ESCROWED state
2. Merchant calls `POST /api/merchant/confirm-fulfillment` with:
   ```json
   {
     "nexus_payment_id": "PAY-xxx",
     "merchant_did": "did:nexus:20250407:demo_flight"
   }
   ```

**Expected:**
- HTTP 200
- Response: `{ "status": "release_submitted", "tx_hash": "0x..." }`
- Relayer submits `release()` tx on-chain
- Payment remains ESCROWED until on-chain confirmation

---

### TC-004-02: ChainWatcher Detects Release -> SETTLED

**Priority:** P0
**Type:** Integration

**Steps:**
1. After TC-004-01, relayer tx is mined
2. ChainWatcher polls for `Released` event

**Expected:**
- Payment transitions ESCROWED -> SETTLED
- `tx_hash` stored in payment record
- Webhook `payment.settled` sent to merchant
- Group status updated to GROUP_SETTLED (if all payments settled)

---

### TC-004-03: Second Fulfillment Call (SETTLED -> COMPLETED)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Payment in SETTLED state
2. Merchant calls `nexus_confirm_fulfillment` with `payment_id` and optional `fulfillment_proof`

**Expected:**
- Payment transitions SETTLED -> COMPLETED
- Webhook `payment.completed` sent
- Group status updated to GROUP_COMPLETED (if all payments completed)

---

### TC-004-04: Fulfillment with Wrong merchant_did

**Priority:** P0
**Type:** Security

**Steps:**
1. Payment belongs to `demo_flight`
2. Call confirm-fulfillment with `merchant_did: "did:nexus:20250407:demo_hotel"`

**Expected:**
- HTTP 403
- Error: merchant_did does not match payment
- No state change

---

### TC-004-05: Fulfillment on Non-ESCROWED Payment

**Priority:** P1
**Type:** Negative

**Steps:**
1. Payment in CREATED state (not yet escrowed)
2. Call confirm-fulfillment

**Expected:**
- Error: payment not in valid state for fulfillment
- No state change

---

### TC-004-06: Already Settled Payment

**Priority:** P1
**Type:** Edge Case

**Steps:**
1. Payment already SETTLED
2. Call confirm-fulfillment via REST

**Expected:**
- Response: `{ "status": "already_settled" }` or transitions to COMPLETED
- Idempotent, no error

---

### TC-004-07: MCP Tool - nexus_release_payment

**Priority:** P1
**Type:** Functional

**Steps:**
1. Call `nexus_release_payment` with `payment_id: "PAY-xxx"` (ESCROWED)

**Expected:**
- Relayer submits release tx
- Returns tx_hash, block_number
- Same end result as confirm-fulfillment

---

### TC-004-08: Relayer Insufficient Gas

**Priority:** P1
**Type:** Error Handling

**Steps:**
1. Relayer wallet has near-zero gas balance
2. Attempt fulfillment

**Expected:**
- Error: relayer gas insufficient
- Payment state unchanged
- Portal `/api/relayer` shows `low_balance: true`

---

### TC-004-09: Relayer Not Configured

**Priority:** P1
**Type:** Error Handling

**Steps:**
1. Start nexus-core without `RELAYER_PRIVATE_KEY`
2. Attempt fulfillment

**Expected:**
- Error: relayer not configured
- Payment state unchanged

---

### TC-004-10: Webhook-Driven Settlement (End-to-End)

**Priority:** P0
**Type:** E2E

**Steps:**
1. Complete checkout (payment ESCROWED)
2. Merchant agent receives `payment.escrowed` webhook
3. Merchant auto-marks order as PAID
4. Merchant calls `POST /api/merchant/confirm-fulfillment`
5. Relayer releases escrow on-chain
6. ChainWatcher detects release -> SETTLED
7. `payment.settled` webhook delivered

**Expected:**
- Full automated settlement loop completes
- All state transitions and webhooks fire correctly
- Timestamps recorded for each transition
