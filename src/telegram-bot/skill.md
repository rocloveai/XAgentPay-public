---
name: xagentpay-telegram-renderer
version: "4.0.0"
description: Send live XAgent Pay order status cards to Telegram. Always use Eva's own bot token — single bot, no fragmented conversation.
protocol: HTTP/REST
category: notification.telegram
---

# XAgent Pay Telegram Order Panel

**Base URL:** `https://xagenpay.com/tg-bot`

**ALWAYS send to chat_id: `REDACTED_CHAT_ID`** (Roc's personal chat) — NEVER use a group chat.

---

## CRITICAL RULES

1. **ALWAYS pass your own `botToken`** — the card must appear from Eva, not any other bot.
2. **ALWAYS use `chatId: REDACTED_CHAT_ID`** — Roc's personal chat. NEVER use a group chat ID.
3. **NEVER send the order card to a group** (`REDACTED_GROUP_CHAT_ID` or any negative chat ID).
4. There is no second bot. Eva handles everything in one conversation.

---

## `POST /start-order-panel`

### Request

```json
{
  "chatId": "REDACTED_CHAT_ID",
  "groupId": "GRP-xxxx",
  "checkoutUrl": "https://api.xagenpay.com/checkout/tok_xxx",
  "outRef": "FLT-20260307-001",
  "hotelRef": "HTL-20260307-001",
  "backRef": "FLT-20260310-001",
  "botToken": "YOUR_OWN_TELEGRAM_BOT_TOKEN"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `chatId` | ✅ | **Always `REDACTED_CHAT_ID`** (Roc's personal chat) |
| `groupId` | ✅ | XAgent Pay group ID from orchestrate response |
| `checkoutUrl` | ✅ | Checkout URL from orchestrate response |
| `outRef` | ✅ | Outbound flight order_ref (e.g. `FLT-001`) |
| `hotelRef` | ❌ optional | Hotel order_ref (omit if flight-only) |
| `backRef` | ❌ optional | Return flight order_ref (omit if one-way) |
| `botToken` | ✅ **REQUIRED** | Your own Telegram bot token — card appears as sent by Eva |

### Response

```json
{ "ok": true, "groupId": "GRP-xxxx", "messageId": 42, "pollEverySec": 10, "mode": "custom_bot" }
```

`mode` must always be `"custom_bot"`. If you see `"orders_bot"`, you forgot to pass `botToken`.

### What Roc sees (sent by Eva in personal chat)

**Before payment:**
```
🧾 XAgent Pay 订单  自动刷新中

✈️ 去程  FLT-001：⏳ UNPAID
🏨 酒店  HTL-001：⏳ UNPAID
✈️ 返程  FLT-002：⏳ UNPAID

🔖 Group: GRP-xxxx

[ 💳 去收银台支付 ]
```

**After payment (auto-updated every 10 s):**
```
✅ XAgent Pay 订单（已全部支付）

✈️ 去程  FLT-001：✅ PAID
🏨 酒店  HTL-001：✅ PAID
✈️ 返程  FLT-002：✅ PAID

🔖 Group: GRP-xxxx

[ ✅ 支付完成 ]
```

---

## Workflow

```
1. Search flights → SHOW results → WAIT for Roc to select
2. Search hotels  → SHOW results → WAIT for Roc to select
3. SHOW full price summary → ask "确认支付吗？" → WAIT for "确认"
4. Call xagent_orchestrate_payment → get groupId + checkoutUrl
5. Call POST /start-order-panel with chatId=REDACTED_CHAT_ID and YOUR botToken
6. Reply to Roc: "✅ 订单卡片已发送，正在为您支付…" (1-2 lines max)
7. Submit payment transactions (agent-pay/build-tx flow)
8. Card auto-refreshes every 10 s until all PAID — no further action needed
```

> **NEVER skip steps 1–3.**
> **NEVER use a group chat ID.**
> **ALWAYS include your own botToken in step 5.**

## Health Check

```
GET /health → {"status":"ok","active_polls":N}
```
