---
name: nexus-telegram-renderer
version: "1.0.0"
description: Render xXAgent Pay payment orders as rich Telegram messages with auto-updating status
protocol: HTTP/REST
category: notification.telegram
---

# xXAgent Pay Telegram Order Renderer

A lightweight service that renders xXAgent Pay payment orders as interactive Telegram messages using InlineKeyboardMarkup. Messages auto-update every 10 seconds to reflect payment status changes.

## When to Use

After you call `nexus_orchestrate_payment` and receive a `checkout_url` + `group_id`, POST the order details to this service to render a beautiful order card in the user's Telegram chat. The card includes:

- Order summary with all line items and amounts
- Live status badges (Pending → Escrowed → Settled → Completed)
- A clickable "Pay Now" button that opens the checkout page
- Auto-updating status every 10 seconds until all payments are settled

## API Endpoint

### `POST /api/render-order`

**Base URL:** `https://nexus-telegram-bot-nr8m.onrender.com`

**Request:**

```json
{
  "chat_id": 123456789,
  "checkout_url": "https://api.xagentpay.com/checkout/tok_xxx",
  "group_id": "grp_abc123",
  "total_amount_display": "0.30",
  "currency": "USDC",
  "payments": [
    {
      "nexus_payment_id": "PAY-uuid-1",
      "merchant_order_ref": "FLT-001",
      "amount_display": "0.10",
      "status": "CREATED",
      "summary": "Flight SQ321 PVG-NRT"
    },
    {
      "nexus_payment_id": "PAY-uuid-2",
      "merchant_order_ref": "HTL-001",
      "amount_display": "0.20",
      "status": "CREATED",
      "summary": "Hotel Tokyo Shibuya 2 nights"
    }
  ]
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chat_id` | number or string | Yes | Telegram chat ID where the message will be sent |
| `checkout_url` | string (URL) | Yes | xXAgent Pay checkout URL from orchestration response |
| `group_id` | string | Yes | Payment group ID (e.g. `grp_xxx` or `GRP-xxx`) |
| `total_amount_display` | string | Yes | Human-readable total amount (e.g. `"0.30"`) |
| `currency` | string | No | Currency symbol (default: `"USDC"`) |
| `payments` | array | Yes | Array of payment items (min 1) |
| `payments[].nexus_payment_id` | string | Yes | XAgent Pay payment ID (e.g. `PAY-xxx`) |
| `payments[].merchant_order_ref` | string | Yes | Merchant's order reference |
| `payments[].amount_display` | string | Yes | Human-readable amount for this item |
| `payments[].status` | string | Yes | Current status (e.g. `CREATED`, `ESCROWED`, `SETTLED`) |
| `payments[].summary` | string | No | Description displayed in the message (falls back to `merchant_order_ref`) |

**Response (200):**

```json
{
  "ok": true,
  "message_id": 42,
  "group_id": "grp_abc123"
}
```

## Integration Flow

```
1. User asks to book flight + hotel in Telegram chat
2. You (the bot) call merchant agents to search & generate quotes
3. You call nexus_orchestrate_payment → get checkout_url, group_id, payments
4. You POST to /api/render-order with chat_id + order details
   → User sees a rich order card with "Pay Now" button in Telegram
5. User taps "Pay Now" → opens MetaMask checkout in browser
6. User pays → the order card auto-updates with progressive backoff:
   10s → 15s → 20s → … (adds 5s each poll, max 20 queries ≈ 19 min)
   ⏳ Pending → 🔒 Escrowed → ✅ Settled → 🎉 Completed
   If order expires: ⏳ Pending → ❌ Expired (button changes to non-clickable badge)
7. No further action needed — the service handles all status updates
8. Polling stops on: terminal status, or after 20 queries
```

## How to Extract Data from Orchestration Response

After calling `nexus_orchestrate_payment`, you get back a response like:

```
CHECKOUT_URL: https://api.xagentpay.com/checkout/tok_xxx

Payment Summary:
  Group: grp_abc123
  Total: 0.30 USDC (2 payments)
  1. FLT-001 — 0.10 USDC
  2. HTL-001 — 0.20 USDC
```

Map this to the render-order request:
- `checkout_url` ← the URL after `CHECKOUT_URL:`
- `group_id` ← the Group ID
- `total_amount_display` ← the Total amount number
- `payments[]` ← each numbered item, with `merchant_order_ref` and `amount_display`

If you have the original quotes, use `context.summary` for richer `summary` text (e.g. "Flight SQ321 Shanghai to Tokyo" instead of "FLT-001").

## Message Appearance

The rendered Telegram message looks like:

```
📦 xXAgent Pay Order

⏳ Status: Pending Payment

Items
1. Flight SQ321 PVG-NRT
   0.10 USDC  [⏳ Pending]
2. Hotel Tokyo Shibuya 2 nights
   0.20 USDC  [⏳ Pending]

━━━━━━━━━━━━━━━
Total: 0.30 USDC

grp_abc123

[💳 Pay Now]  ← clickable button opens checkout URL
```

If the order expires before payment, the message auto-updates to:

```
📦 xXAgent Pay Order

❌ Status: Expired

Items
1. Flight SQ321 PVG-NRT
   0.10 USDC  [❌ Expired]
2. Hotel Tokyo Shibuya 2 nights
   0.20 USDC  [❌ Expired]

━━━━━━━━━━━━━━━
Total: 0.30 USDC

grp_abc123

[❌ Expired]  ← non-clickable badge
```

After payment, the message auto-updates to:

```
📦 xXAgent Pay Order

✅ Status: Settled

Items
1. Flight SQ321 PVG-NRT
   0.10 USDC  [✅ Settled]
2. Hotel Tokyo Shibuya 2 nights
   0.20 USDC  [✅ Settled]

━━━━━━━━━━━━━━━
Total: 0.30 USDC

grp_abc123
TX: 0xabcdef...

[✅ Settled]  ← button updates automatically
```

## Health Check

```bash
GET /health
→ {"status":"ok","active_polls":2}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from @BotFather |
| `NEXUS_CORE_URL` | Yes | — | xXAgent Pay Core URL for status polling |
| `PORT` | No | `4100` | HTTP server port |
| `POLL_INTERVAL_MS` | No | `10000` | Initial poll interval in ms |
| `POLL_BACKOFF_MS` | No | `5000` | Added to interval per successive poll |
| `MAX_POLL_COUNT` | No | `20` | Max status queries per message |
