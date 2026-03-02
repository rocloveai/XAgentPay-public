# TC-007: Webhook Notifications

## Module
WebhookNotifier / Merchant Webhook Handler

## Prerequisites
- Merchant registered with `webhook_url` and `webhook_secret`
- Webhook endpoint accessible

---

### TC-007-01: payment.created Webhook

**Priority:** P0
**Type:** Functional

**Steps:**
1. Orchestrate a payment

**Expected:**
- Webhook `POST` sent to merchant's `webhook_url`
- Body contains:
  ```json
  {
    "event": "payment.created",
    "event_id": "evt_...",
    "timestamp": "...",
    "data": {
      "nexus_payment_id": "PAY-xxx",
      "merchant_order_ref": "FLT-001",
      "status": "CREATED",
      "amount": "100000",
      "currency": "USDC"
    }
  }
  ```
- Headers include `X-Nexus-Signature` and `X-Nexus-Timestamp`

---

### TC-007-02: payment.escrowed Webhook

**Priority:** P0
**Type:** Functional

**Steps:**
1. Confirm deposit for a payment

**Expected:**
- Webhook sent with `event: "payment.escrowed"`
- Data includes `tx_hash`

---

### TC-007-03: payment.settled Webhook

**Priority:** P0
**Type:** Functional

**Steps:**
1. Release escrow for a payment

**Expected:**
- Webhook sent with `event: "payment.settled"`
- Data includes `tx_hash`, `block_number`

---

### TC-007-04: payment.completed Webhook

**Priority:** P1
**Type:** Functional

**Steps:**
1. Confirm fulfillment for a SETTLED payment

**Expected:**
- Webhook sent with `event: "payment.completed"`

---

### TC-007-05: payment.expired Webhook

**Priority:** P1
**Type:** Functional

**Steps:**
1. Let a payment expire (timeout)

**Expected:**
- Webhook sent with `event: "payment.expired"`

---

### TC-007-06: dispute.opened Webhook

**Priority:** P1
**Type:** Functional

**Steps:**
1. Open a dispute on an ESCROWED payment

**Expected:**
- Webhook sent with `event: "dispute.opened"`
- Data includes `reason`

---

### TC-007-07: dispute.resolved Webhook

**Priority:** P1
**Type:** Functional

**Steps:**
1. Resolve a disputed payment

**Expected:**
- Webhook sent with `event: "dispute.resolved"`
- Data includes `merchant_bps`, `merchant_amount`, `payer_amount`

---

### TC-007-08: Signature Verification (HMAC-SHA256)

**Priority:** P0
**Type:** Security

**Steps:**
1. Receive webhook
2. Compute `HMAC-SHA256(timestamp + "." + rawBody, webhook_secret)`
3. Compare with `X-Nexus-Signature` header

**Expected:**
- Signatures match
- Timing-safe comparison used

---

### TC-007-09: Timestamp Freshness

**Priority:** P0
**Type:** Security

**Steps:**
1. Receive webhook
2. Check `X-Nexus-Timestamp` against current time

**Expected:**
- Timestamp within 5-minute window
- Reject replay attacks with old timestamps

---

### TC-007-10: Retry on Failure

**Priority:** P0
**Type:** Functional

**Steps:**
1. Merchant webhook endpoint returns 500
2. Observe retry behavior

**Expected:**
- 6 retry attempts with exponential backoff
- Intervals: 10s, 30s, 2m, 10m, 30m
- Each attempt logged in merchant_webhooks table

---

### TC-007-11: Retry on Timeout

**Priority:** P1
**Type:** Functional

**Steps:**
1. Merchant webhook endpoint doesn't respond (hangs)

**Expected:**
- Request times out
- Retry triggered per backoff schedule

---

### TC-007-12: Idempotent Delivery

**Priority:** P0
**Type:** Functional

**Steps:**
1. Deliver webhook with `event_id: "evt_abc"`
2. Attempt redelivery with same `event_id`

**Expected:**
- Merchant can detect duplicate via `event_id`
- 1-hour TTL on idempotency window

---

### TC-007-13: Webhook to Unreachable URL

**Priority:** P1
**Type:** Error Handling

**Steps:**
1. Merchant `webhook_url` is unreachable (DNS failure)

**Expected:**
- Connection error caught
- Retries triggered
- Payment state not affected by webhook failure

---

### TC-007-14: Multi-Merchant Webhooks

**Priority:** P0
**Type:** Functional

**Steps:**
1. Orchestrate payment with 2 merchants (flight + hotel)
2. Each merchant has different webhook_url

**Expected:**
- Each merchant receives its own `payment.created` webhook
- Correct merchant_order_ref in each webhook
- Webhooks sent in parallel (fire-and-forget)
