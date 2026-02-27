---
name: nexus-tg-messaging
description: Specialized skill for presenting Nexus payment orders via Telegram Bot API InlineKeyboard
version: 1.0.0
---

# Nexus Telegram Messaging Skill

Present Nexus payment orders as rich Telegram messages using `InlineKeyboardMarkup`, Markdown formatting, and status update via `editMessageText`.

## Message Format

When you receive a checkout response from `nexus_orchestrate_payment` (or `POST /api/orchestrate`), present it to the user as follows.

### Order Card (Markdown + InlineKeyboard)

```
📋 *NexusPay Order*

1️⃣ Japan Airlines JL710 (SIN-NRT)
   └ 0.10 USDC · `did:nexus:...:demo_flight`

2️⃣ Hotel Gracery Shinjuku (Tokyo)
   └ 0.10 USDC · `did:nexus:...:demo_hotel`

━━━━━━━━━━━━━━━
💰 *Total: 0.20 USDC*
🔗 Chain: PlatON Devnet
📦 Group: `GRP-xxx`
⏳ Status: ⚪ Awaiting Payment
```

With `InlineKeyboardMarkup`:

```json
{
  "inline_keyboard": [
    [{ "text": "💳 Pay Now", "url": "${checkout_url}" }],
    [{ "text": "🔄 Check Status", "callback_data": "nexus_status:${group_id}" }]
  ]
}
```

### Field Mapping

| Orchestrate Response Field | Telegram Display |
|---|---|
| `instruction.payments[].summary` | Line item name (numbered) |
| `instruction.payments[].amount_display` | Amount per item |
| `instruction.payments[].merchant_did` | Merchant identifier (truncated) |
| `instruction.total_amount_display` | Total amount (bold) |
| `instruction.chain_name` | Chain badge |
| `group_id` | Group reference (monospace) |
| `checkout_url` | "Pay Now" button URL |

### Status Icons

| Status | Icon | Label |
|---|---|---|
| `GROUP_CREATED` | ⚪ | Awaiting Payment |
| `GROUP_AWAITING_TX` | 🟡 | Transaction Pending |
| `GROUP_ESCROWED` | 🟢 | Paid — In Escrow |
| `GROUP_SETTLED` | ✅ | Settled |
| `GROUP_COMPLETED` | ✅ | Completed |
| `EXPIRED` | 🔴 | Expired |

## Status Update Protocol

Telegram supports `editMessageText` — when payment status changes:

1. **After user clicks "Pay Now" and completes checkout:**
   - Poll `GET /api/checkout/${token}` every 5 seconds (max 60s)
   - Or wait for webhook callback if configured

2. **On status change, edit the original message:**
   - Update the status line: `⏳ Status: ⚪ Awaiting Payment` → `⏳ Status: 🟢 Paid — In Escrow`
   - Replace the "Pay Now" button with "✅ Payment Confirmed"
   - Keep the order details unchanged

3. **On settlement:**
   - Update status to `✅ Settled`
   - Add "📄 View Receipt" button linking to portal if available

### editMessageText Example

```json
{
  "method": "editMessageText",
  "chat_id": "${chat_id}",
  "message_id": "${original_message_id}",
  "text": "📋 *NexusPay Order*\n\n1️⃣ ...\n\n━━━━━━━━━━━━━━━\n💰 *Total: 0.20 USDC*\n⏳ Status: 🟢 Paid — In Escrow\n🔗 TX: `0xabc...def`",
  "parse_mode": "Markdown",
  "reply_markup": {
    "inline_keyboard": [
      [{ "text": "✅ Payment Confirmed", "callback_data": "noop" }],
      [{ "text": "🔄 Check Status", "callback_data": "nexus_status:${group_id}" }]
    ]
  }
}
```

## Callback Query Handling

When user taps "Check Status" button:

1. Answer the callback query immediately: `answerCallbackQuery`
2. Call `GET /api/payments?group_id=${group_id}`
3. Edit the message with updated status using the mapping above

## Key Rules

- Always use `parse_mode: "Markdown"` (or `MarkdownV2` with proper escaping)
- Keep the checkout_url in an InlineKeyboard button — never as raw text
- Truncate `merchant_did` to last segment for readability (e.g., `demo_flight`)
- Use monospace (backticks) for IDs, hashes, and addresses
- Maximum 3 buttons per row for mobile readability
