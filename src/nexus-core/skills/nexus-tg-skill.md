---
name: nexus-tg-messaging
description: Send Nexus payment orders as Telegram rich messages with InlineKeyboard buttons
version: 2.0.0
---

# Nexus Telegram Messaging Skill

## CRITICAL RULE

**NEVER put the checkout URL as plain text in the message.** It MUST be inside an `InlineKeyboardMarkup` button. Use the Telegram Bot API `sendMessage` method with `reply_markup` parameter.

## How to Send an Order Card

After you receive the orchestrate response (containing `checkout_url`, `group_id`, `instruction`), send a Telegram message using **exactly** this structure:

### API Call: `sendMessage`

```
POST https://api.telegram.org/bot<TOKEN>/sendMessage
Content-Type: application/json

{
  "chat_id": "<CHAT_ID>",
  "parse_mode": "HTML",
  "text": "<b>📋 NexusPay Order</b>\n\n1️⃣ Japan Airlines JL710 (SIN-NRT)\n   └ 0.10 USDC · <code>demo_flight</code>\n\n2️⃣ Hotel Gracery Shinjuku (Tokyo)\n   └ 0.10 USDC · <code>demo_hotel</code>\n\n━━━━━━━━━━━━━━━\n💰 <b>Total: 0.20 USDC</b>\n🔗 Chain: PlatON Devnet\n📦 Group: <code>GRP-xxx</code>\n⏳ Status: ⚪ Awaiting Payment",
  "reply_markup": {
    "inline_keyboard": [
      [{ "text": "💳 Pay Now", "url": "https://nexus-core-361y.onrender.com/checkout/tok_xxx" }],
      [{ "text": "🔄 Check Status", "callback_data": "nexus_status:GRP-xxx" }]
    ]
  }
}
```

### Key Points

1. **`parse_mode`**: Use `"HTML"` (safer than Markdown — no escaping issues with special chars)
2. **`reply_markup.inline_keyboard`**: The "Pay Now" button uses `"url"` field — Telegram renders it as a clickable button that opens the checkout page in the browser
3. **`text`**: The message body contains order details only — NO raw URLs
4. **`callback_data`**: Store the `group_id` so you can query status when the user taps "Check Status"

## Building the Text

From the orchestrate response, map fields to the message `text`:

```
<b>📋 NexusPay Order</b>

{for each instruction.payments[i]:}
{i+1}️⃣ {payments[i].summary}
   └ {payments[i].amount_display} USDC · <code>{last segment of payments[i].merchant_did}</code>

━━━━━━━━━━━━━━━
💰 <b>Total: {instruction.total_amount_display} USDC</b>
🔗 Chain: {instruction.chain_name}
📦 Group: <code>{group_id}</code>
⏳ Status: ⚪ Awaiting Payment
```

## Building the Buttons

```json
{
  "inline_keyboard": [
    [{ "text": "💳 Pay Now", "url": "{checkout_url}" }],
    [{ "text": "🔄 Check Status", "callback_data": "nexus_status:{group_id}" }]
  ]
}
```

- The `"url"` type button opens an external link — user taps it → browser opens checkout page
- The `"callback_data"` type button sends a callback query to your bot

## Status Updates via `editMessageText`

When payment status changes, **edit the original message** (do NOT send a new one):

```
POST https://api.telegram.org/bot<TOKEN>/editMessageText
Content-Type: application/json

{
  "chat_id": "<CHAT_ID>",
  "message_id": <ORIGINAL_MSG_ID>,
  "parse_mode": "HTML",
  "text": "<b>📋 NexusPay Order</b>\n\n1️⃣ ...\n\n━━━━━━━━━━━━━━━\n💰 <b>Total: 0.20 USDC</b>\n⏳ Status: 🟢 Paid — In Escrow\n🔗 TX: <code>0xabc...def</code>",
  "reply_markup": {
    "inline_keyboard": [
      [{ "text": "✅ Payment Confirmed", "callback_data": "noop" }],
      [{ "text": "🔄 Check Status", "callback_data": "nexus_status:GRP-xxx" }]
    ]
  }
}
```

### Status Icons

| Status | Icon + Label |
|---|---|
| `GROUP_CREATED` | ⚪ Awaiting Payment |
| `GROUP_AWAITING_TX` | 🟡 Transaction Pending |
| `GROUP_ESCROWED` | 🟢 Paid — In Escrow |
| `GROUP_SETTLED` | ✅ Settled |
| `GROUP_COMPLETED` | ✅ Completed |
| `EXPIRED` | 🔴 Expired |

## Handling "Check Status" Callback

When user taps the "Check Status" button:

1. Call `answerCallbackQuery` to dismiss the loading spinner
2. Fetch status: `GET https://nexus-core-361y.onrender.com/api/payments?group_id={group_id}`
3. Call `editMessageText` to update the status line and buttons

## Summary Checklist

- [ ] Checkout URL is in `InlineKeyboardMarkup` button with `"url"` field — NEVER in text
- [ ] Using `parse_mode: "HTML"` (not Markdown)
- [ ] Bold text uses `<b>...</b>`, monospace uses `<code>...</code>`
- [ ] Status updates use `editMessageText` on the original message (not a new message)
- [ ] `merchant_did` truncated to last segment (e.g., `did:nexus:20250407:demo_flight` → `demo_flight`)
