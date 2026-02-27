---
name: nexus-line-messaging
description: Specialized skill for sending Nexus payment orders as LINE Flex Messages
version: 1.0.0
---

# Nexus LINE Messaging Skill

This skill allows the agent to wrap Nexus NUPS quotes and payment group instructions into beautiful, interactive LINE Flex Messages.

## Capabilities

### `send_nexus_order_card`
Constructs and sends a rich Flex Message card for a Nexus order or payment group.

**Input Requirements:**
- `payment_info`: The JSON response from `nexus_orchestrate_payment` or a single NUPS quote.
- `recipient_id`: The LINE user or group ID.

**Logic:**
1. Parse the `payment_info`.
2. Map fields to the LINE Flex Bubble schema:
   - `merchant_did` -> Header Title
   - `status` -> Status Badge (Green for Settled, Yellow for Unpaid)
   - `context.line_items` -> Body List
   - `total_amount_display` -> Footer Total
   - `checkout_url` -> "Pay" Button Action
3. Call `channelData.line` with the generated JSON.

## Flex Message Template (Reference)

```json
{
  "type": "bubble",
  "styles": {
    "header": { "backgroundColor": "#F8F9FA" },
    "footer": { "separator": true }
  },
  "header": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "NexusPay Order",
        "weight": "bold",
        "size": "lg"
      }
    ]
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "${status_icon} ${status_text}",
        "weight": "bold",
        "color": "${status_color}"
      },
      { "type": "separator", "margin": "lg" },
      {
        "type": "box",
        "layout": "vertical",
        "margin": "lg",
        "contents": [
          // Dynamic list items here
        ]
      }
    ]
  },
  "footer": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "button",
        "style": "primary",
        "height": "sm",
        "color": "#1DB446",
        "action": {
          "type": "uri",
          "label": "Pay Now",
          "uri": "${checkout_url}"
        }
      }
    ]
  }
}
```

## State Change Protocol (New Card Logic)
Since LINE messages cannot be edited, when a payment status changes (e.g., from `ESCROWED` to `SETTLED`):
1. Wait for the `RELEASED` webhook event.
2. Construct a **NEW** Flex Message card with the updated status.
3. Include a "View History" or "Receipt Details" button linking to the Nexus Portal.
