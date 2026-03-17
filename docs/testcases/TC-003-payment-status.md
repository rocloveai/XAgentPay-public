# TC-003: Payment Status & State Machine

## Module
`xagent_get_payment_status` (MCP) / `GET /api/payments` (REST) / State Machine

## Prerequisites
- Payments in various states available in database

---

## A. State Transitions

### TC-003-01: Happy Path (CREATED -> ESCROWED -> SETTLED -> COMPLETED)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Orchestrate payment -> CREATED
2. User submits deposit -> ESCROWED
3. Relayer releases escrow -> SETTLED
4. Merchant confirms fulfillment -> COMPLETED

**Expected:**
- Each transition creates a `payment_events` record
- Event records: `from_status`, `to_status`, `metadata`
- Group status mirrors: GROUP_CREATED -> GROUP_DEPOSITED -> GROUP_ESCROWED -> GROUP_SETTLED -> GROUP_COMPLETED
- Terminal state: no further transitions allowed

---

### TC-003-02: Expiry (CREATED -> EXPIRED)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Orchestrate payment -> CREATED
2. Wait for AWAITING_TX timeout (30 minutes)
3. Timeout sweep runs via `runTimeoutSweep()` (background job)

**Expected:**
- Payment transitions to EXPIRED
- Group transitions to GROUP_EXPIRED
- No further state changes possible

**Note:** Timeout sweep is a scheduled background operation, not triggered by REST requests.

---

### TC-003-03: AWAITING_TX -> ESCROWED (ChainWatcher)

**Priority:** P1
**Type:** Functional

**Steps:**
1. Orchestrate and submit tx -> GROUP_AWAITING_TX
2. ChainWatcher detects deposit event on-chain

**Expected:**
- Payments transition to ESCROWED
- Group transitions to GROUP_ESCROWED
- Webhook `payment.escrowed` sent

---

### TC-003-04: Invalid State Transition

**Priority:** P0
**Type:** Negative

**Steps:**
1. Attempt to transition COMPLETED payment to ESCROWED
2. Attempt to transition EXPIRED payment to SETTLED

**Expected:**
- Error: `InvalidTransitionError`
- State unchanged
- No event record created

---

### TC-003-05: ESCROWED -> REFUNDED

**Priority:** P1
**Type:** Functional

**Steps:**
1. Payment in ESCROWED state
2. Arbitration timeout expires without resolution
3. `refundUnresolvedDispute` called on-chain

**Expected:**
- Payment transitions to REFUNDED
- Funds returned to payer

---

## B. Status Query

### TC-003-06: Query by nexus_payment_id

**Priority:** P0
**Type:** Functional

**Steps:**
1. `GET /api/payments/PAY-xxx`

**Expected:**
- HTTP 200 with `{ "http_status": 200, "payment": {...}, "group": {...}, "group_payments": [...] }`
- Payment fields: `nexus_payment_id`, `group_id`, `status`, `amount`, `amount_display`, `currency`, `chain_id`, `merchant_did`, `merchant_order_ref`, `tx_hash`, `block_number`, `payment_id_bytes32`, `created_at`, `escrowed_at`, `settled_at`, `completed_at`
- `escrowed_at` is `updated_at` when payment is in ESCROWED state, excluded after settlement
- `group` object with group-level status
- `group_payments` array with all payments in group

---

### TC-003-07: Query by group_id

**Priority:** P0
**Type:** Functional

**Steps:**
1. `GET /api/payments?group_id=GRP-xxx`

**Expected:**
- HTTP 200 with `http_status: 200` envelope
- Returns first payment matching the group
- Group info included

---

### TC-003-08: Query by merchant_order_ref

**Priority:** P0
**Type:** Functional

**Steps:**
1. `GET /api/payments?merchant_order_ref=FLT-001`

**Expected:**
- HTTP 200 with `http_status: 200` envelope
- Returns payment with matching order ref

---

### TC-003-09: Query via MCP Tool

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `xagent_get_payment_status` with `group_id: "GRP-xxx"`

**Expected:**
- Returns formatted text with payment details
- Status, amount, merchant info displayed

---

### TC-003-10: Non-existent Payment

**Priority:** P1
**Type:** Negative

**Steps:**
1. `GET /api/payments/PAY-nonexistent`

**Expected:**
- HTTP 404 with `{ "http_status": 404, "error": { "code": "NOT_FOUND", "message": "Payment or group not found" } }`

---

### TC-003-11: Query with Multiple Filters

**Priority:** P2
**Type:** Functional

**Steps:**
1. `GET /api/payments?group_id=GRP-xxx&merchant_order_ref=FLT-001`

**Expected:**
- Returns payment matching both filters

---

## C. Group Status

### TC-003-12: Group Status Aggregation

**Priority:** P0
**Type:** Functional

**Steps:**
1. Create group with 2 payments
2. Escrow both -> GROUP_ESCROWED
3. Settle one -> check group status
4. Settle both -> GROUP_SETTLED

**Expected:**
- Group status reflects aggregate state of all payments
- GROUP_PARTIAL when payments in mixed states
- GROUP_SETTLED only when all payments settled

---

### TC-003-13: Payment Events Audit Trail

**Priority:** P1
**Type:** Functional

**Steps:**
1. Advance a payment through full lifecycle
2. Query payment events

**Expected:**
- Events ordered chronologically
- Each transition recorded with timestamp
- Metadata includes relevant details (tx_hash, reason, etc.)
