---
name: nexus-line-messaging
description: Specialized skill for sending XAgent Pay payment orders as LINE Flex Messages
version: 1.0.0
---

# XAgent Pay LINE Messaging Skill

This skill allows the agent to wrap XAgent Pay NUPS quotes and payment group instructions into beautiful, interactive LINE Flex Messages.

## CRITICAL: Output Rules

**After calling `nexus_orchestrate_payment`, you MUST follow these rules:**

1. **DO NOT** display the raw tool response (CHECKOUT_URL, Payment Summary, group_id, etc.) to the user in the chat.
2. **DO NOT** repeat order details as text — the Flex Message card already shows everything the user needs.
3. **ONLY** respond with a brief, natural-language confirmation like:
   - "I've created your order! Please tap Pay Now in the card below."
   - "Your booking is ready — use the button below to pay."
4. **IMMEDIATELY** send the Flex Message card — this is the only way the user should see order details.
5. The same rule applies to `nexus_get_payment_status` — do not dump raw status JSON. Instead, summarize naturally: "Your payment has been confirmed!" or "Still waiting for on-chain confirmation."

The raw tool response is **internal data for you to extract fields from**, not content to show the user.

## Capabilities

### `send_nexus_order_card`
Constructs and sends a rich Flex Message card for a XAgent Pay order or payment group.

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
        "text": "xXAgent Pay Order",
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
3. Include a "View History" or "Receipt Details" button linking to the XAgent Pay Portal.
