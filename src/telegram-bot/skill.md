---
name: xagentpay-telegram-renderer
version: "2.0.0"
description: Send live XAgent Pay order status cards to Telegram. Supports both merchant PAID/UNPAID mode and group ESCROWED/SETTLED mode.
protocol: HTTP/REST
category: notification.telegram
---

# XAgent Pay Telegram Order Panel

**Base URL:** `https://nexus-telegram-bot-8fzu.onrender.com`

**Roc's Telegram chat_id: `REDACTED_CHAT_ID`** — use this by default when booking for Roc.

---

## RECOMMENDED: `POST /start-order-panel`

Use this after completing a flight+hotel booking. It sends a live card that polls merchant agents for PAID/UNPAID status and auto-refreshes every 10 seconds.

### Request

```json
{
  "chatId": "REDACTED_CHAT_ID",
  "groupId": "GRP-xxxx",
  "checkoutUrl": "https://nexus-core-r0xf.onrender.com/checkout/tok_xxx",
  "outRef": "FLT-20260307-001",
  "hotelRef": "HTL-20260307-001",
  "backRef": "FLT-20260310-001"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `chatId` | ✅ | Telegram chat ID — use `REDACTED_CHAT_ID` for Roc |
| `groupId` | ✅ | XAgent Pay group ID from orchestrate response |
| `checkoutUrl` | ✅ | Checkout URL from orchestrate response |
| `outRef` | ✅ | Outbound flight order_ref (e.g. `FLT-001`) |
| `hotelRef` | ❌ optional | Hotel order_ref |
| `backRef` | ❌ optional | Return flight order_ref |

### Response

```json
{ "ok": true, "groupId": "GRP-xxxx", "messageId": 42, "pollEverySec": 10 }
```

### What Roc sees in Telegram

**Before payment:**
```
🧾 XAgent Pay 订单  自动刷新中

✈️ 去程  FLT-001：⏳ UNPAID
🏨 酒店  HTL-001：⏳ UNPAID
✈️ 返程  FLT-002：⏳ UNPAID

🔖 Group: GRP-xxxx

[ 💳 去收银台支付 ]
[ 🔄 手动刷新     ]
```

**After payment:**
```
✅ XAgent Pay 订单（已全部支付）

✈️ 去程  FLT-001：✅ PAID
🏨 酒店  HTL-001：✅ PAID
✈️ 返程  FLT-002：✅ PAID

🔖 Group: GRP-xxxx

[ ✅ 支付完成 ]
```

---

## ALTERNATIVE: `POST /api/render-order`

Use this if you have full payment details from nexus-core (group status mode with ESCROWED/SETTLED).

### Request

```json
{
  "chat_id": "REDACTED_CHAT_ID",
  "checkout_url": "https://nexus-core-r0xf.onrender.com/checkout/tok_xxx",
  "group_id": "GRP-xxxx",
  "total_amount_display": "0.30",
  "currency": "USDC",
  "payments": [
    {
      "nexus_payment_id": "PAY-uuid-1",
      "merchant_order_ref": "FLT-001",
      "amount_display": "0.10",
      "status": "CREATED",
      "summary": "Flight SIN→NRT 2026-03-07"
    },
    {
      "nexus_payment_id": "PAY-uuid-2",
      "merchant_order_ref": "HTL-001",
      "amount_display": "0.20",
      "status": "CREATED",
      "summary": "Hotel Tokyo 3 nights"
    }
  ]
}
```

---

## Workflow

```
1. Call flight-agent search_and_quote → get outRef (e.g. FLT-001)
2. Call hotel-agent search_and_quote  → get hotelRef (e.g. HTL-001)
3. Call nexus_orchestrate_payment     → get groupId + checkoutUrl
4. Call POST /start-order-panel       → card appears in Roc's Telegram
5. Tell Roc: "订单卡片已发到你的Telegram，请点击支付按钮"
6. Card auto-refreshes until PAID — no further action needed
```

## Health Check

```
GET /health → {"status":"ok","active_polls":N}
```
