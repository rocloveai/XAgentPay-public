# TC-002: Checkout Flow

## Module
`/checkout/:token` (Browser Page) / `/api/checkout/:token` (API)

## Prerequisites
- Valid payment group created via orchestration
- Checkout token (`tok_`) available
- MetaMask installed (for browser tests)
- PlatON Devnet configured in wallet

---

### TC-002-01: Checkout Page Load

**Priority:** P0
**Type:** Functional

**Steps:**
1. Navigate to `https://api.nexus-mvp.topos.one/checkout/tok_xxx`

**Expected:**
- Page renders with order summary
- Shows all payment line items with amounts
- Shows total amount in USDC
- "Pay Now" / "Connect Wallet" button visible
- Chain info displayed (PlatON Devnet)

---

### TC-002-02: Checkout API - Get Group Details

**Priority:** P0
**Type:** Functional

**Steps:**
1. `GET /api/checkout/tok_xxx`

**Expected:**
- HTTP 200
- Response envelope: `{ "http_status": 200, "group": {...}, "payments": [...], "instruction": {...} }`
- `instruction.eip3009_sign_data` present
- `instruction.deposit_tx` present with ABI

---

### TC-002-03: Checkout with Direct Group ID

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /api/checkout/GRP-xxx` (using group_id instead of token)

**Expected:**
- HTTP 200
- Same response as token-based access (with `http_status: 200` envelope)

---

### TC-002-04: Expired Token

**Priority:** P0
**Type:** Negative

**Steps:**
1. Wait for token to expire (1 hour TTL)
2. Navigate to checkout URL

**Expected:**
- Error: token expired
- User instructed to re-orchestrate

---

### TC-002-05: Invalid Token

**Priority:** P1
**Type:** Negative

**Steps:**
1. Navigate to `/checkout/tok_invalid_random_string`

**Expected:**
- Error: token not found or invalid
- Appropriate error page displayed

---

### TC-002-06: MetaMask Wallet Connection

**Priority:** P0
**Type:** UI/Integration

**Steps:**
1. Open checkout page
2. Click "Connect Wallet"
3. Approve connection in MetaMask

**Expected:**
- Wallet connected, address displayed
- If wrong chain: auto-switch prompt to PlatON Devnet (chainId 20250407)
- "Pay Now" button becomes active

---

### TC-002-07: Mobile MetaMask Deep Link

**Priority:** P1
**Type:** UI

**Steps:**
1. Open checkout URL on mobile browser (without MetaMask app open)

**Expected:**
- Deep link opens MetaMask mobile app via `https://metamask.app.link/dapp/<url>`
- Checkout page loads within MetaMask browser
- Payment flow works as on desktop

---

### TC-002-08: EIP-3009 Signing

**Priority:** P0
**Type:** Integration

**Steps:**
1. Connect wallet on checkout page
2. Click "Pay Now"
3. MetaMask shows EIP-712 typed data for signing

**Expected:**
- Typed data displays correct token, amount, sender, receiver (escrow contract)
- `validAfter` and `validBefore` are in milliseconds (PlatON requirement)
- Domain separator matches USDC contract

---

### TC-002-09: Transaction Submission and Confirmation

**Priority:** P0
**Type:** Integration

**Steps:**
1. Sign EIP-3009 in MetaMask
2. Submit `batchDepositWithGroupApproval` transaction
3. Wait for transaction to be mined

**Expected:**
- Transaction submitted to PlatON Devnet
- Frontend polls for receipt (every 5s, max 24 attempts = 120s)
- On receipt: `POST /api/checkout/:token/confirm` called with tx_hash
- Server returns `{ "http_status": 200, ... }` (receipt verified) -> status ESCROWED
- Checkout page shows success status

---

### TC-002-10: Confirm Deposit - Receipt Success (200)

**Priority:** P0
**Type:** Functional

**Steps:**
1. `POST /api/checkout/:token/confirm` with valid tx_hash (receipt available, status=1)

**Expected:**
- HTTP 200 with `{ "http_status": 200, "status": "confirmed", "group_id": "GRP-..." }`
- All payments transition to ESCROWED
- Group transitions to GROUP_ESCROWED
- Webhook `payment.escrowed` sent to each merchant

---

### TC-002-11: Confirm Deposit - Receipt Not Available (202)

**Priority:** P1
**Type:** Functional

**Steps:**
1. `POST /api/checkout/:token/confirm` with tx_hash that has no receipt yet

**Expected:**
- HTTP 202 with `{ "http_status": 202, "tx_hash": "0x...", "status": "awaiting_confirmation", "group_id": "GRP-..." }`
- Group remains in GROUP_CREATED (no state transition)
- Frontend continues polling every 5s
- ChainWatcher will handle state transition when deposit is confirmed on-chain

---

### TC-002-12: Confirm Deposit - Receipt Reverted (422)

**Priority:** P1
**Type:** Negative

**Steps:**
1. `POST /api/checkout/:token/confirm` with tx_hash that reverted on-chain

**Expected:**
- HTTP 422 with `{ "http_status": 422, "error": "Transaction reverted on-chain" }`
- No state change

---

### TC-002-13: Confirm Without tx_hash

**Priority:** P2
**Type:** Negative

**Steps:**
1. `POST /api/checkout/:token/confirm` with empty body or missing tx_hash

**Expected:**
- HTTP 400 with `{ "http_status": 400, "error": "tx_hash required" }`

---

### TC-002-14: Double Confirmation (Idempotency)

**Priority:** P1
**Type:** Edge Case

**Steps:**
1. Successfully confirm deposit with tx_hash
2. Confirm again with same tx_hash

**Expected:**
- Second call returns success (idempotent)
- No duplicate state transitions or events

---

### TC-002-14a: Confirm Deposit via MCP Tool

**Priority:** P0
**Type:** Functional

**Steps:**
1. Call `nexus_confirm_deposit` via MCP with:
   - `group_id`: "grp_xxx"
   - `tx_hash`: "0xabc..."

**Expected:**
- Returns formatted text with confirmation status
- Same state transitions as HTTP confirm (ESCROWED)
- Webhook `payment.escrowed` sent

---

### TC-002-14b: Confirm Deposit via MCP - Invalid tx_hash

**Priority:** P1
**Type:** Negative

**Steps:**
1. Call `nexus_confirm_deposit` with `tx_hash: "not_a_hash"`

**Expected:**
- Error: invalid tx_hash format
- No state change

---

### TC-002-15: GROUP_PARTIAL Status Handling

**Priority:** P1
**Type:** Edge Case

**Steps:**
1. Create a group with 2 payments
2. Simulate one payment escrowing successfully, other failing

**Expected:**
- Group shows GROUP_PARTIAL status
- Button does not revert to "Pay Now"
- Individual payment statuses shown correctly

---

### TC-002-16: GROUP_AWAITING_TX Retry Scenario

**Priority:** P1
**Type:** Edge Case

**Steps:**
1. Submit a deposit tx, get 202 response (receipt not yet available)
2. The group remains in GROUP_CREATED
3. Attempt to submit a new payment on the same checkout page

**Expected:**
- Checkout page treats GROUP_CREATED and GROUP_AWAITING_TX as payable states
- User can retry payment if original tx was dropped
- No duplicate deposit possible (on-chain nonce protection)
