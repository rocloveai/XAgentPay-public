# XAgent Pay — Telegram Order Panel

After you complete a flight + hotel booking via XAgent Pay, call this service to push a live order status card to the user's Telegram chat. The card auto-refreshes every 10 seconds and shows PAID/UNPAID status for each item.

## Base URL

```
https://xagenpay.com/tg-bot
```

## CRITICAL RULES

1. **ALWAYS use `chatId: REDACTED_CHAT_ID`** — Roc's personal chat. NEVER use a group chat.
2. **NEVER use `REDACTED_GROUP_CHAT_ID`** or any negative chat ID (groups are not allowed).

## When to Use

**Always call `/start-order-panel` immediately after `nexus_orchestrate_payment` succeeds**, before showing any text summary to the user. This gives the user a visual, interactive order card with a direct payment link and live status.

## Endpoint

### `POST /start-order-panel`

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `chatId` | string/number | Telegram chat_id of the user |
| `groupId` | string | XAgent Pay group ID (e.g. `GRP-xxxx`) |
| `checkoutUrl` | string | Checkout URL from orchestrate response |
| `outRef` | string | Outbound flight order_ref (e.g. `FLT-001`) |
| `hotelRef` | string | Hotel order_ref (e.g. `HTL-001`) — optional |
| `backRef` | string | Return flight order_ref (e.g. `FLT-002`) — optional |

**Example request (round-trip with hotel):**

```json
{
  "chatId": "123456789",
  "groupId": "GRP-b4a5d720-318e-48d9-b774-6bd26ad641e1",
  "checkoutUrl": "https://api.xagenpay.com/checkout/tok_abc123",
  "outRef": "FLT-20260307-001",
  "hotelRef": "HTL-20260307-001",
  "backRef": "FLT-20260310-001"
}
```

**Example request (one-way flight only):**

```json
{
  "chatId": "123456789",
  "groupId": "GRP-xxxx",
  "checkoutUrl": "https://api.xagenpay.com/checkout/tok_xxx",
  "outRef": "FLT-20260307-001"
}
```

**Success response:**

```json
{
  "ok": true,
  "groupId": "GRP-xxxx",
  "messageId": 42,
  "pollEverySec": 10
}
```

## What the User Sees

The card sent to Telegram looks like:

```
🧾 XAgent Pay 订单  每10秒自动刷新

✈️ 去程  FLT-001：⏳ UNPAID
🏨 酒店  HTL-001：⏳ UNPAID
✈️ 返程  FLT-002：⏳ UNPAID

🔖 Group: GRP-xxxx

[ 💳 去收银台支付 ]
[ 🔄 手动刷新     ]
```

After payment:

```
✅ XAgent Pay 订单（已全部支付）

✈️ 去程  FLT-001：✅ PAID
🏨 酒店  HTL-001：✅ PAID
✈️ 返程  FLT-002：✅ PAID

🔖 Group: GRP-xxxx

[ ✅ 支付完成 ]
```

## Important Notes

- **Always use `chatId: REDACTED_CHAT_ID`** (Roc's personal chat) — NEVER use the group chat `REDACTED_GROUP_CHAT_ID` or any negative chat ID
- **Base URL**: `https://xagenpay.com/tg-bot`
- After calling `/start-order-panel`, tell the user: "订单卡片已发送到你的 Telegram，请查看并点击支付按钮完成支付"
- Do NOT also send a manual text summary — the card replaces that
- The card auto-refreshes every 10 seconds — no further action needed
