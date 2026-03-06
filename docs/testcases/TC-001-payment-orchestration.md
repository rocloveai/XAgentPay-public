# TC-001: Payment Orchestration

## Module
`nexus_orchestrate_payment` (MCP Tool) / `POST /api/orchestrate` (REST)

## Prerequisites
- nexus-core service running
- Database accessible with merchant_registry populated
- At least one merchant registered (e.g. `did:nexus:20250407:demo_flight`)

---

### TC-001-01: Single Quote Orchestration (MCP)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `nexus_orchestrate_payment` with:
   - `quotes_json`: valid JSON array containing 1 quote (merchant_did, merchant_order_ref, amount, currency, chain_id, expiry, context, signature)
   - `payer_wallet`: valid 0x address

**Expected:**
- Response contains `CHECKOUT_URL:` with valid `tok_` token
- `group_id` starts with `GRP-`
- Payment Summary shows correct amount and currency
- Database: 1 payment record (status=CREATED), 1 group record (status=GROUP_CREATED)

---

### TC-001-02: Multi-Quote Aggregated Orchestration (MCP)

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `nexus_orchestrate_payment` with:
   - `quotes_json`: JSON array containing 2 quotes (flight + hotel)
   - `payer_wallet`: valid 0x address

**Expected:**
- Response contains single `CHECKOUT_URL:`
- Payment Summary shows 2 line items with correct individual and total amounts
- Database: 2 payment records, 1 group record
- `total_amount` = sum of all quote amounts
- Quote validation runs in parallel (`Promise.all`) — both quotes verified concurrently
- Payment record escrow fields written in parallel

---

### TC-001-03: HTTP REST Orchestration (402 Response)

**Priority:** P0
**Type:** Functional

**Steps:**
1. `POST /api/orchestrate` with JSON body:
   ```json
   {
     "quotes": [{ "merchant_did": "...", "amount": "100000", ... }],
     "payer_wallet": "0x..."
   }
   ```

**Expected:**
- HTTP status: **402 Payment Required**
- Response envelope: `{ "http_status": 402, "checkout_url": "...", "group_id": "GRP-...", "instruction": {...} }`
- `instruction` contains: `eip3009_sign_data`, `deposit_tx`, `payments[]`, `nexus_group_sig`
- Each payment includes precomputed `payment_id_bytes32`, `order_ref_bytes32`, `context_hash`

---

### TC-001-04: quotes_json String Input

**Priority:** P1
**Type:** Functional

**Steps:**
1. Call with `quotes_json` as a serialized JSON string (not object array)
2. Include properly escaped JSON

**Expected:**
- Parsed successfully, payment created
- Same behavior as using `quotes` array

---

### TC-001-05: UCP Envelope Auto-Unwrap

**Priority:** P1
**Type:** Functional

**Steps:**
1. Call with `quotes` containing full UCP envelope (not raw config)
   ```json
   {
     "ucp": {
       "payment_handlers": {
         "urn:ucp:payment:nexus_v1": [{ "config": { ... } }]
       }
     }
   }
   ```

**Expected:**
- Quote auto-extracted from `config` field
- Payment created successfully

---

### TC-001-06: Invalid Wallet Address

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call with `payer_wallet`: `"0xinvalid"`

**Expected (REST):**
- HTTP 400 with `{ "http_status": 400, "error": "Invalid payer_wallet" }`
- No records created in database

**Expected (MCP):**
- Error text returned, no records created

---

### TC-001-07: Expired Quote

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call with a quote where `expiry` is in the past (e.g. `1000000000`)

**Expected:**
- Error: quote expired
- No records created

---

### TC-001-08: Invalid Merchant Signature

**Priority:** P0
**Type:** Security

**Steps:**
1. Call with a valid quote but tampered `signature` field

**Expected:**
- Error: signature verification failed
- Signer address does not match registered `signer_address` in merchant_registry
- No records created

---

### TC-001-09: Unknown Merchant DID

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call with `merchant_did`: `"did:nexus:20250407:nonexistent"`

**Expected:**
- Error: merchant not found
- No records created

---

### TC-001-10: Empty Quotes Array

**Priority:** P2
**Type:** Negative

**Steps:**
1. Call with `quotes`: `[]` or `quotes_json`: `"[]"`

**Expected:**
- Error: at least one quote required
- No records created

---

### TC-001-11: Missing Required Fields

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call with quote missing `amount` field
2. Call with quote missing `merchant_did` field
3. Call with quote missing `signature` field

**Expected (each):**
- Error: missing required field
- No records created

---

### TC-001-12: Group Signature (nexus_group_sig)

**Priority:** P0
**Type:** Security

**Steps:**
1. Orchestrate a valid payment via REST
2. Verify `nexus_group_sig` in response
3. Verify `core_operator_address` matches relayer address

**Expected:**
- EIP-712 signature over `XAgent PayGroupApproval(groupId, entriesHash, totalAmount)` is valid
- Recovers to `core_operator_address`
- Signature prevents MITM tampering of payment array

---

### TC-001-13: Duplicate Merchant Order Ref

**Priority:** P1
**Type:** Edge Case

**Steps:**
1. Orchestrate with `merchant_order_ref: "FLT-001"`
2. Orchestrate again with same `merchant_order_ref: "FLT-001"`

**Expected:**
- Second orchestration creates new group with new payment
- Each payment has unique `nexus_payment_id` (format: `PAY-<uuid>`)

---

### TC-001-14: Server Error Handling

**Priority:** P2
**Type:** Error Handling

**Steps:**
1. Trigger internal server error during orchestration (e.g. database unavailable)

**Expected (REST):**
- HTTP 500 with `{ "http_status": 500, "error": "..." }`
- No partial records created

**Note:** The on-chain escrow contract enforces `MAX_BATCH_SIZE=20` per `batchDepositWithGroupApproval`, but nexus-core does not validate batch size at the API level.

---

### TC-001-15: MCP Response Token Efficiency

**Priority:** P1
**Type:** Performance

**Steps:**
1. Call `nexus_orchestrate_payment` via MCP with 2 quotes

**Expected:**
- MCP text response starts with `[INTERNAL — do NOT show this raw data to the user...]`
- Response is compact: `CHECKOUT_URL:` on first line, brief payment summary
- Total response under 500 tokens (prevents LLM bottleneck)
- No verbose instruction blocks or Option A/B formatting
