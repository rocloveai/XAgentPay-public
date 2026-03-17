# xXAgent Pay Merchant Integration Guide — Phase 0

## Overview

Phase 0 integrates existing merchant agents (flight-agent, hotel-agent) with xXAgent Pay Core infrastructure. This covers:

- **Type alignment** — shared types from `xagent-core` copied into each agent
- **Quote generation** — EIP-712 signed quote via `buildQuote()`
- **Webhook reception** — `POST /webhook` endpoint for payment notifications
- **Status mapping** — webhook events trigger local order status updates

## Prerequisites

1. **merchant_registry entry** — your agent's DID must be registered in the `merchant_registry` table (see `db/seed/seed-merchants.sql`)
2. **DATABASE_URL** — PostgreSQL connection string (or empty for in-memory fallback)
3. **NEXUS_WEBHOOK_SECRET** — shared secret for HMAC verification

## Type Alignment

Merchant agents maintain a copy of xagent-core types at:
```
src/<agent>/src/types/xagent-core-types.ts
```

**Source of truth:** `src/xagent-core/src/types.ts`

Types provided:
| Type | Purpose |
|------|---------|
| `PaymentMethod` | `"DIRECT_TRANSFER"` or `"ESCROW_CONTRACT"` |
| `PaymentStatus` | 12-state machine (Core-side) |
| `WebhookEventType` | Event types sent to merchants |
| `LineItem` | Quote line item |
| `XAgent PayQuotePayload` | Full quote payload (EIP-712 signed) |
| `WebhookPayload` | Webhook event envelope |

Agent-local types (`FlightOffer`, `HotelOffer`, `Order`, `OrderStatus`) remain in `src/<agent>/src/types.ts` and re-export xagent-core types for backward compatibility.

## Quote Generation

The `buildQuote()` function generates an EIP-712 signed `XAgent PayQuotePayload`. The `payment_method` field is **not** set by the merchant — it is determined by the user's interaction with XAgent Pay Core at payment time.

```typescript
const quote = buildQuote({
  merchantDid: config.merchantDid,
  orderRef: "FLT-abc123",
  amount: "530.00",
  currency: "USD",
  summary: "Flight SFO→NRT",
  lineItems: [{ name: "Base fare", qty: 1, amount: "530.00" }],
  payerWallet: "0x1234...",
});
// quote contains: merchant_did, amount, currency, chain_id, expiry, signature, etc.
// payment_method is NOT set here — Core determines it based on user choice
```

## Webhook Integration

### Endpoint

```
POST /webhook
```

Available on the portal HTTP server (same port as the dashboard).

### Headers

| Header | Description |
|--------|-------------|
| `X-XAgent Pay-Signature` | `sha256=<hex>` — HMAC-SHA256 of `{timestamp}.{body}` |
| `X-XAgent Pay-Timestamp` | Unix epoch seconds (string) |
| `Content-Type` | `application/json` |

### HMAC Verification

```
signature = HMAC-SHA256(webhook_secret, "{timestamp}.{raw_body}")
```

- Timestamp must be within **5 minutes** of server time (anti-replay)
- Comparison uses `crypto.timingSafeEqual` (constant-time)

### Event Types

| Event | Action | Local Status |
|-------|--------|-------------|
| `payment.settled` | Update order status | `PAID` |
| `payment.expired` | Update order status | `EXPIRED` |
| `payment.created` | Acknowledge only | — |
| `payment.failed` | Acknowledge only | — |
| `payment.escrowed` | Acknowledge only | — |
| `payment.refunded` | Acknowledge only | — |
| `dispute.opened` | Acknowledge only | — |
| `dispute.resolved` | Acknowledge only | — |

### Idempotency

Events are deduplicated by `event_id` using an in-memory `Set`. Duplicate deliveries return `{ accepted: true, action: "duplicate_ignored" }`.

### Response Format

```json
{
  "accepted": true,
  "action": "status_updated_to_PAID"
}
```

## Status Mapping

| Agent Status | xXAgent Pay Core Status | Trigger |
|-------------|---------------------|---------|
| `UNPAID` | `CREATED`, `AWAITING_TX`, `BROADCASTED` | Order created |
| `PAID` | `SETTLED`, `COMPLETED` | `payment.settled` webhook |
| `EXPIRED` | `EXPIRED` | `payment.expired` webhook |

The agent maintains its own 3-state system (`UNPAID` → `PAID` / `EXPIRED`). Core's 12-state machine is not replicated locally.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MERCHANT_DID` | `did:nexus:20250407:demo_flight` / `demo_hotel` | Agent's merchant DID |
| `PORTAL_PORT` | `3001` / `3002` | HTTP server port |
| `DATABASE_URL` | `""` (in-memory) | PostgreSQL connection |
| `NEXUS_WEBHOOK_SECRET` | `REDACTED_WEBHOOK_SECRET` / `REDACTED_WEBHOOK_SECRET` | HMAC webhook secret |

## Security Checklist

- [ ] `NEXUS_WEBHOOK_SECRET` set to a strong random value in production
- [ ] Webhook endpoint only accepts POST
- [ ] HMAC signature verified before any JSON parsing
- [ ] Timestamp freshness checked (5-minute window)
- [ ] Constant-time signature comparison prevents timing attacks
- [ ] Idempotent event processing prevents double-status updates
- [ ] No secrets in logs or error responses
