# RFC-009: Nexus Webhook Standard (NWS)

| Metadata | Value |
| --- | --- |
| **Title** | Nexus Webhook Standard |
| **Version** | 1.0.0 |
| **Status** | Standards Track (Draft) |
| **Author** | Cipher & Nexus Architect Team |
| **Created** | 2026-02-24 |
| **Depends On** | RFC-005v2 (Payment Core MVP) |

## 1. Abstract

本 RFC 定义 NexusPay Core 向 Merchant Agent 发送支付结果通知的 Webhook 标准。包括事件类型、Payload 格式、HMAC 安全签名、重试策略和幂等性保障。

## 2. Motivation

在 Direct Settlement 模式下，商户需要及时获知以下事件：
- 用户支付成功（以便发货/出票）
- 支付超时未完成（以便释放库存）
- 链上交易失败（以便通知用户重试）

Webhook 是连接 NexusPay Core 与 Merchant Agent 的关键桥梁。

## 3. Event Types

| Event Type | Trigger | Merchant Expected Action |
| --- | --- | --- |
| payment.created | Payment order created in Core | Optional: update internal state |
| payment.settled | On-chain Transfer confirmed | Deliver goods/service |
| payment.expired | Payment timed out | Release inventory |
| payment.failed | On-chain transaction reverted | Notify user to retry |
| fulfillment.confirmed | Merchant confirmed delivery | Archive (informational) |

## 4. Webhook Payload Format

### 4.1 Envelope

```json
{
  "event_id": "evt_01JAXYZ123...",
  "event_type": "payment.settled",
  "created_at": "2026-02-24T10:35:00.000Z",
  "data": { ... }
}
```

- event_id: UUID v7 (time-ordered), serves as idempotency key
- event_type: One of the defined event types
- created_at: ISO 8601 timestamp
- data: Event-specific payload

### 4.2 Payment Event Data

```json
{
  "data": {
    "nexus_payment_id": "NEX-01JAXYZ-0001",
    "merchant_order_ref": "FLT-1708761234-abc123",
    "merchant_did": "did:nexus:210425:demo_flight",
    "status": "SETTLED",
    "amount": "530000000",
    "amount_display": "530.00",
    "currency": "USDC",
    "chain_id": 210425,
    "payer_wallet": "0x1234...abcd",

    "settlement": {
      "tx_hash": "0xabc123...def456",
      "block_number": 12345678,
      "block_timestamp": "2026-02-24T10:34:55.000Z",
      "payment_address": "0xMerchant...Address"
    },

    "iso_metadata": {
      "end_to_end_id": "NEX-01JAXYZ-0001",
      "remittance_info": "FLT-1708761234-abc123",
      "instructed_amount": "530.00",
      "instructed_currency": "USD",
      "creditor_id": "did:nexus:210425:demo_flight",
      "settlement_asset": "DTI:4H95J0R2X"
    }
  }
}
```

Notes:
- settlement object is only present for payment.settled events
- iso_metadata is present for all payment events (for ERP integration)
- amount is uint256 string (6 decimals for USDC)
- amount_display is human-readable decimal string

## 5. HTTP Request Format

### 5.1 Method and Headers

```
POST {merchant_webhook_url}
Content-Type: application/json
X-Nexus-Event: payment.settled
X-Nexus-Delivery-Id: evt_01JAXYZ123
X-Nexus-Timestamp: 1708766100
X-Nexus-Signature: sha256=a1b2c3d4e5f6...
User-Agent: NexusPay-Webhook/1.0
```

### 5.2 Signature Computation

```
payload = timestamp + "." + raw_request_body
signature = HMAC-SHA256(webhook_secret, payload)
header = "sha256=" + hex(signature)
```

Where:
- timestamp = value of X-Nexus-Timestamp header (Unix epoch seconds)
- raw_request_body = exact JSON string sent as POST body
- webhook_secret = shared secret from merchant_registry

## 6. Security

### 6.1 Merchant Verification

Merchants MUST verify incoming webhooks:

```
Verification Steps:
1. Extract X-Nexus-Timestamp and X-Nexus-Signature headers
2. Compute expected = HMAC-SHA256(my_secret, timestamp + "." + raw_body)
3. Compare: "sha256=" + hex(expected) === X-Nexus-Signature
4. Reject if timestamp is older than 5 minutes (replay protection)
5. Reject if signature does not match
```

### 6.2 Idempotency

- Merchants MUST track event_id to prevent duplicate processing
- Core MAY deliver the same event multiple times (at-least-once delivery)
- Merchants MUST handle duplicate deliveries gracefully

### 6.3 Secret Rotation

- webhook_secret can be rotated via merchant_registry update
- During rotation, Core sends with new secret
- Old secret is invalidated immediately
- Merchants should update their verification within the rotation window

## 7. Retry Strategy

### 7.1 Retry Schedule

| Attempt | Delay After Previous | Cumulative Wait |
| --- | --- | --- |
| 1 (initial) | immediate | 0 |
| 2 | 10 seconds | 10s |
| 3 | 30 seconds | 40s |
| 4 | 2 minutes | 2m 40s |
| 5 | 10 minutes | 12m 40s |
| 6 (final) | 30 minutes | 42m 40s |

### 7.2 Success and Failure Criteria

- **Success**: HTTP response status 2xx
- **Failure**: HTTP 4xx, 5xx, connection timeout, DNS failure
- **Timeout**: 10 seconds per request
- **Max Attempts**: 6 (1 initial + 5 retries)

### 7.3 After Max Retries

If all retry attempts fail:
- Log final failure in webhook_delivery_logs
- Set payment.webhook_failed flag
- Merchant can use nexus_get_payment_status MCP tool to poll
- Admin dashboard shows undelivered webhooks for manual review

## 8. Webhook Registration

### 8.1 Per-Merchant Configuration

Stored in merchant_registry table:

```sql
webhook_url    TEXT    -- HTTPS endpoint
webhook_secret TEXT    -- HMAC shared secret (32+ bytes, hex encoded)
```

### 8.2 URL Requirements

- MUST use HTTPS (HTTP only allowed for localhost development)
- MUST respond within 10 seconds
- MUST return 2xx to acknowledge receipt
- SHOULD be idempotent (handle duplicate event_id)

## 9. Database Schema

```sql
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  log_id              TEXT PRIMARY KEY,
  nexus_payment_id    TEXT NOT NULL REFERENCES payments(nexus_payment_id),
  merchant_did        TEXT NOT NULL,
  webhook_url         TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  request_body        JSONB NOT NULL,
  response_status     INTEGER,
  response_body       TEXT,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  next_retry_at       TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_payment ON webhook_delivery_logs (nexus_payment_id);
CREATE INDEX idx_webhook_retry ON webhook_delivery_logs (next_retry_at)
  WHERE delivered_at IS NULL AND attempt_number <= 6;
```

## 10. Merchant SDK Integration

The @nexus/seller-sdk SHOULD provide a webhook verification helper:

```typescript
import { verifyWebhook } from '@nexus/seller-sdk';

app.post('/webhook/nexus', (req, res) => {
  const isValid = verifyWebhook({
    secret: process.env.NEXUS_WEBHOOK_SECRET,
    signature: req.headers['x-nexus-signature'],
    timestamp: req.headers['x-nexus-timestamp'],
    body: req.rawBody,
  });

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event_type, data } = req.body;

  switch (event_type) {
    case 'payment.settled':
      // Deliver goods/service
      await fulfillOrder(data.merchant_order_ref);
      break;
    case 'payment.expired':
      // Release inventory
      await releaseInventory(data.merchant_order_ref);
      break;
    case 'payment.failed':
      // Notify user
      await notifyPaymentFailed(data.merchant_order_ref);
      break;
  }

  res.status(200).json({ received: true });
});
```

## 11. Testing

### 11.1 Webhook Testing Endpoint

Core SHOULD provide a test webhook tool:

```
MCP Tool: nexus_test_webhook
Input: { merchant_did: string, event_type: string }
Action: Sends a test webhook with synthetic data to the merchant's webhook_url
Output: { delivered: boolean, response_status: number }
```

### 11.2 Event Log Inspection

Merchants can inspect webhook delivery history via:
- Core Portal Dashboard (webhook delivery logs section)
- MCP Resource: nexus://core/webhooks/{nexus_payment_id}

## 12. Copyright

Copyright (c) 2026 Nexus Protocol. All Rights Reserved.
