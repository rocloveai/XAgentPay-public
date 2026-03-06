---
name: xagentpay-telegram-renderer
version: "3.0.0"
description: Send live XAgent Pay order status cards to Telegram. The card is sent by Eva's own bot so the whole conversation appears as a single bot.
protocol: HTTP/REST
category: notification.telegram
---

# XAgent Pay Telegram Order Panel

**Base URL:** `https://nexus-telegram-bot-8fzu.onrender.com`

**Default chat_id: `REDACTED_CHAT_ID`** (Roc's personal chat) — use this by default for ALL order panels.

---

## ⭐ KEY FEATURE: Send card from YOUR OWN bot

Pass your own Telegram bot token as `botToken`. The order card will appear to come from **you (Eva)** — no second bot, no fragmented conversation.

- The card auto-refreshes every 10 s without any extra action.
- A "💳 去收银台支付" button is shown until all orders are PAID.
- No manual-refresh button (not needed — auto-refresh handles it).

---

## RECOMMENDED: `POST /start-order-panel`

### Request

```json
{
  "chatId": "REDACTED_CHAT_ID",
  "groupId": "GRP-xxxx",
  "checkoutUrl": "https://nexus-core-r0xf.onrender.com/checkout/tok_xxx",
  "outRef": "FLT-20260307-001",
  "hotelRef": "HTL-20260307-001",
  "backRef": "FLT-20260310-001",
  "botToken": "<YOUR_OWN_TELEGRAM_BOT_TOKEN>"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `chatId` | ✅ | Telegram chat ID — use `REDACTED_CHAT_ID` for Roc |
| `groupId` | ✅ | XAgent Pay group ID from orchestrate response |
| `checkoutUrl` | ✅ | Checkout URL from orchestrate response |
| `outRef` | ✅ | Outbound flight order_ref (e.g. `FLT-001`) |
| `hotelRef` | ❌ optional | Hotel order_ref (omit if flight-only) |
| `backRef` | ❌ optional | Return flight order_ref (omit if one-way) |
| `botToken` | ⭐ **strongly recommended** | Your own Telegram bot token — makes the card appear as sent by you |

### Response

```json
{ "ok": true, "groupId": "GRP-xxxx", "messageId": 42, "pollEverySec": 10, "mode": "custom_bot" }
```

`mode` will be `"custom_bot"` when your token was used, or `"orders_bot"` as fallback.

### What Roc sees in Telegram (sent by Eva herself)

**Before payment:**
```
🧾 XAgent Pay 订单  自动刷新中

✈️ 去程  FLT-001：⏳ UNPAID
🏨 酒店  HTL-001：⏳ UNPAID
✈️ 返程  FLT-002：⏳ UNPAID

🔖 Group: GRP-xxxx

[ 💳 去收银台支付 ]
```

**After payment (auto-updated):**
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
4. Call nexus_orchestrate_payment → get groupId + checkoutUrl
5. Call POST /start-order-panel with YOUR botToken → card appears in Roc's chat from Eva
6. Reply to Roc with 1-2 lines only: "✅ 订单已创建，卡片请看上方，正在为您支付…"
7. Submit payment transactions (agent-pay/build-tx flow)
8. Card auto-refreshes every 10 s until all PAID — no further action needed
```

> **NEVER skip steps 1–3. Always show options and wait for user selection/confirmation before proceeding.**
>
> **After sending the card (step 5), keep YOUR reply to 1-2 short lines — all status info is in the card.**

## Health Check

```
GET /health → {"status":"ok","active_polls":N}
```
