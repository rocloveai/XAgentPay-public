# TC-008: Telegram Bot

## Module
nexus-telegram-bot / `POST /api/render-order` / Status Polling

## Prerequisites
- Telegram bot service running
- Valid `TELEGRAM_BOT_TOKEN`
- `NEXUS_CORE_URL` configured pointing to nexus-core
- Active Telegram chat with bot

---

### TC-008-01: Render Order Card

**Priority:** P0
**Type:** Functional

**Steps:**
1. `POST /api/render-order` with:
   ```json
   {
     "chat_id": 123456789,
     "checkout_url": "https://api.nexus-mvp.topos.one/checkout/tok_xxx",
     "group_id": "grp_abc123",
     "total_amount_display": "0.30",
     "currency": "USDC",
     "payments": [
       {
         "nexus_payment_id": "PAY-1",
         "merchant_order_ref": "FLT-001",
         "amount_display": "0.10",
         "status": "CREATED",
         "summary": "Flight SQ321 PVG-NRT"
       },
       {
         "nexus_payment_id": "PAY-2",
         "merchant_order_ref": "HTL-001",
         "amount_display": "0.20",
         "status": "CREATED",
         "summary": "Hotel Tokyo Shibuya 2 nights"
       }
     ]
   }
   ```

**Expected:**
- HTTP 200: `{ "ok": true, "message_id": 42, "group_id": "grp_abc123" }`
- Telegram message sent to chat with formatted order card
- Shows all line items, amounts, total
- "Pay Now" inline button links to checkout_url

---

### TC-008-02: Message Format

**Priority:** P0
**Type:** UI

**Steps:**
1. Check rendered Telegram message

**Expected:**
```
NexusPay Order

Status: Pending Payment

Items
1. Flight SQ321 PVG-NRT
   0.10 USDC  [Pending]
2. Hotel Tokyo Shibuya 2 nights
   0.20 USDC  [Pending]

Total: 0.30 USDC
grp_abc123

[Pay Now]  <- InlineKeyboardButton
```

---

### TC-008-03: Status Auto-Polling

**Priority:** P0
**Type:** Functional

**Steps:**
1. Render order card
2. Wait for polling interval (10s initial)

**Expected:**
- Bot polls nexus-core for payment status
- Polling intervals: 10s, 15s, 20s, 25s... (adds 5s per poll)
- Maximum 20 polls (~19 minutes)

---

### TC-008-04: Message Update on Payment

**Priority:** P0
**Type:** Functional

**Steps:**
1. Render order card (status: Pending)
2. User pays via checkout
3. Payments transition to ESCROWED then SETTLED

**Expected:**
- Message auto-updates in-place:
  - Pending -> Escrowed -> Settled
- Button updates from "Pay Now" to "Settled" badge
- TX hash shown after settlement

---

### TC-008-05: Message Update on Expiry

**Priority:** P1
**Type:** Functional

**Steps:**
1. Render order card
2. Payment expires before user pays

**Expected:**
- Message updates to show Expired status
- All items show "Expired"
- Button changes to non-clickable "Expired" badge
- Polling stops

---

### TC-008-06: Polling Stops on Terminal Status

**Priority:** P1
**Type:** Functional

**Steps:**
1. Render order card
2. Payment reaches terminal status (SETTLED/EXPIRED/COMPLETED)

**Expected:**
- Polling stops immediately
- No further nexus-core API calls

---

### TC-008-07: Polling Max Count

**Priority:** P2
**Type:** Boundary

**Steps:**
1. Render order card
2. Payment stays CREATED for >19 minutes

**Expected:**
- After 20 polls, polling stops
- Message shows last known status

---

### TC-008-08: Single Payment Order

**Priority:** P1
**Type:** Functional

**Steps:**
1. Render order with 1 payment item

**Expected:**
- Renders correctly with single line item
- Total matches single item amount

---

### TC-008-09: Missing Summary Field

**Priority:** P2
**Type:** Edge Case

**Steps:**
1. Render order with payment missing `summary` field

**Expected:**
- Falls back to `merchant_order_ref` as display text

---

### TC-008-10: Invalid chat_id

**Priority:** P1
**Type:** Negative

**Steps:**
1. `POST /api/render-order` with invalid `chat_id`

**Expected:**
- Telegram API returns error
- HTTP response indicates failure

---

### TC-008-11: Health Check

**Priority:** P1
**Type:** Functional

**Steps:**
1. `GET /health`

**Expected:**
- HTTP 200
- Response: `{ "status": "ok", "active_polls": N }`
- `active_polls` reflects currently polling messages

---

### TC-008-12: Concurrent Orders

**Priority:** P2
**Type:** Performance

**Steps:**
1. Render 5 order cards in quick succession

**Expected:**
- All 5 messages sent successfully
- Each has independent polling
- `active_polls` = 5 on health check
