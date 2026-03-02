# TC-007: Webhook Notifications

## Module
WebhookNotifier / Merchant Webhook Handler

## Prerequisites
- Merchant registered with `webhook_url` and `webhook_secret`
- Webhook endpoint accessible

---

### TC-007-01: payment.escrowed Webhook

**Priority:** P0
**Type:** Functional

**Steps:**
1. Confirm deposit for a payment (checkout flow completes)

**Expected:**
- Webhook `POST` sent to merchant's `webhook_url`
- Body contains:
  ```json
  {
    "event": "payment.escrowed",
    "event_id": "WHEVT-<uuid>",
    "timestamp": "...",
    "data": {
      "nexus_payment_id": "PAY-xxx",
      "merchant_order_ref": "FLT-001",
      "status": "ESCROWED",
      "amount": "100000",
      "currency": "USDC",
      "tx_hash": "0x..."
    }
  }
  ```
- Headers include `X-Nexus-Signature` and `X-Nexus-Timestamp`

**Note:** `event_id` format is `WHEVT-<uuid>` (not `evt_`).

---

### TC-007-02: payment.settled Webhook

**Priority:** P0
**Type:** Functional

**Steps:**
1. Release escrow for a payment (relayer submits on-chain)

**Expected:**
- Webhook sent with `event: "payment.settled"`
- Data includes `tx_hash`, `block_number`

---

### TC-007-03: payment.completed Webhook

**Priority:** P1
**Type:** Functional

**Steps:**
1. Confirm fulfillment for a SETTLED payment

**Expected:**
- Webhook sent with `event: "payment.completed"`

---

### TC-007-04: dispute.opened Webhook

**Priority:** P1
**Type:** Functional

**Steps:**
1. Open a dispute on an ESCROWED payment

**Expected:**
- Webhook sent with `event: "dispute.opened"`
- Data includes `reason`

---

### TC-007-05: dispute.resolved Webhook

**Priority:** P1
**Type:** Functional

**Steps:**
1. Resolve a disputed payment

**Expected:**
- Webhook sent with `event: "dispute.resolved"`
- Data includes `merchant_bps`, `merchant_amount`, `payer_amount`

---

### TC-007-06: Signature Verification (HMAC-SHA256)

**Priority:** P0
**Type:** Security

**Steps:**
1. Receive webhook
2. Extract `X-Nexus-Timestamp` header (Unix timestamp in **seconds**)
3. Compute `HMAC-SHA256(timestamp + "." + rawBody, webhook_secret)`
4. Compare with `X-Nexus-Signature` header (format: `sha256=<hex>`)

**Expected:**
- Signatures match
- Timing-safe comparison used by merchant handler

---

### TC-007-07: Timestamp Freshness (Merchant-Side)

**Priority:** P0
**Type:** Security

**Steps:**
1. Receive webhook
2. Check `X-Nexus-Timestamp` against current time

**Expected:**
- Merchant should validate timestamp within 5-minute window
- Reject replay attacks with old timestamps

**Note:** Timestamp freshness validation is the **merchant's responsibility**. Nexus-core generates the timestamp but does not enforce freshness on the sending side.

---

### TC-007-08: Retry on Failure

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

### TC-007-09: Retry on Timeout

**Priority:** P1
**Type:** Functional

**Steps:**
1. Merchant webhook endpoint doesn't respond (hangs)

**Expected:**
- Request times out after 10 seconds
- Retry triggered per backoff schedule

---

### TC-007-10: Idempotent Delivery

**Priority:** P0
**Type:** Functional

**Steps:**
1. Deliver webhook with `event_id: "WHEVT-abc"`
2. Attempt redelivery with same `event_id`

**Expected:**
- Merchant can detect duplicate via `event_id`
- Event IDs stored in `webhook_delivery_logs` table

**Note:** Idempotency deduplication is the **merchant's responsibility** using the `event_id`. There is no enforced TTL in nexus-core.

---

### TC-007-11: Webhook to Unreachable URL

**Priority:** P1
**Type:** Error Handling

**Steps:**
1. Merchant `webhook_url` is unreachable (DNS failure)

**Expected:**
- Connection error caught
- Retries triggered per backoff schedule
- Payment state not affected by webhook failure (fire-and-forget)

---

### TC-007-12: Multi-Merchant Webhooks

**Priority:** P0
**Type:** Functional

**Steps:**
1. Orchestrate payment with 2 merchants (flight + hotel)
2. Confirm deposit -> both payments ESCROWED
3. Each merchant has different webhook_url

**Expected:**
- Each merchant receives its own `payment.escrowed` webhook
- Correct `merchant_order_ref` in each webhook
- Webhooks sent fire-and-forget (non-blocking)
