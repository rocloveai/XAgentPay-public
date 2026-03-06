# xXAgent Pay Functional Regression Test Cases

## Environment

| Item | Value |
|------|-------|
| Chain | XLayer Devnet (chainId 20250407) |
| USDC | `0xFF8dEe9983768D0399673014cf77826896F97e4d` |
| Escrow Proxy | `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236` |
| Core API | `https://api.xagentpay.com` |
| Core MCP | `https://api.xagentpay.com/mcp` |
| Website | `https://xagentpay.com` |
| Flight Agent | `https://nexus-flight-agent-nr8m.onrender.com` |
| Hotel Agent | `https://nexus-hotel-agent-nr8m.onrender.com` |
| Telegram Bot | `https://nexus-telegram-bot-nr8m.onrender.com` |

## Test Case Index

| ID | Module | Test Cases | Priority Coverage |
|----|--------|-----------|-------------------|
| [TC-001](TC-001-payment-orchestration.md) | Payment Orchestration | 14 | 5x P0, 7x P1, 2x P2 |
| [TC-002](TC-002-checkout-flow.md) | Checkout Flow | 18 | 8x P0, 9x P1, 1x P2 |
| [TC-003](TC-003-payment-status.md) | Payment Status & State Machine | 13 | 8x P0, 4x P1, 1x P2 |
| [TC-004](TC-004-merchant-settlement.md) | Merchant Settlement | 12 | 5x P0, 7x P1, 0x P2 |
| [TC-005](TC-005-dispute-flow.md) | Dispute Flow | 12 | 5x P0, 6x P1, 1x P2 |
| [TC-006](TC-006-marketplace.md) | Marketplace & Discovery | 17 | 8x P0, 6x P1, 3x P2 |
| [TC-007](TC-007-webhooks.md) | Webhooks | 12 | 7x P0, 5x P1, 0x P2 |
| [TC-008](TC-008-telegram-bot.md) | Telegram Bot | 12 | 4x P0, 5x P1, 3x P2 |
| [TC-009](TC-009-merchant-agents.md) | Merchant Agents | 21 | 9x P0, 12x P1, 0x P2 |
| **Total** | | **131** | **59x P0, 61x P1, 11x P2** |

## Priority Definitions

| Priority | Meaning | Regression Frequency |
|----------|---------|---------------------|
| **P0** | Critical path, must pass before any release | Every deployment |
| **P1** | Important features, should pass | Every release |
| **P2** | Edge cases and boundary conditions | Monthly |

## Test Types

- **Functional** — Core feature works as specified
- **Negative** — Invalid inputs handled correctly
- **Security** — Authentication, authorization, signature verification
- **Integration** — Cross-service communication (webhook, on-chain, MCP)
- **E2E** — Full user journey from search to settlement
- **UI** — Checkout page and Telegram message rendering
- **Boundary** — Limits, max values, timeouts
- **Edge Case** — Unusual but valid scenarios
- **Error Handling** — Graceful degradation on failures
- **Performance** — Concurrent load, polling behavior

## Critical E2E Flow (Smoke Test)

Run this sequence to verify the entire system is operational:

1. **Search** — `search_flights` on flight agent
2. **Quote** — `nexus_generate_quote` with selected offer
3. **Orchestrate** — `nexus_orchestrate_payment` on nexus-core
4. **Checkout** — Open checkout URL, verify page renders
5. **Pay** — Connect MetaMask, sign, submit tx
6. **Confirm** — `POST /api/checkout/:token/confirm`
7. **Verify Escrowed** — `nexus_get_payment_status` shows ESCROWED
8. **Settle** — Merchant calls `POST /api/merchant/confirm-fulfillment`, relayer releases
9. **Verify Settled** — Status shows SETTLED
10. **Complete** — Second fulfillment call, status COMPLETED

All JSON responses include `http_status` field in envelope (e.g. `{ "http_status": 402, ... }`).

## Payment State Machine Reference

```
CREATED ──────> AWAITING_TX ──────> BROADCASTED
  │                 │                    │
  │                 │                    ├──> ESCROWED ──> SETTLED ──> COMPLETED
  │                 │                    │       │
  │                 │                    │       ├──> DISPUTE_OPEN ──> DISPUTE_RESOLVED
  │                 │                    │       │                     (RESOLVED_TO_MERCHANT /
  │                 │                    │       │                      RESOLVED_TO_PAYER /
  │                 │                    │       │                      RESOLVED_SPLIT on-chain)
  │                 │                    │       └──> REFUNDED
  │                 │                    │
  ├──> EXPIRED      ├──> EXPIRED         ├──> TX_FAILED
  └──> RISK_REJECTED└──> RISK_REJECTED   └──> RISK_REJECTED
```

Group statuses: GROUP_CREATED, GROUP_DEPOSITED, GROUP_AWAITING_TX, GROUP_ESCROWED, GROUP_SETTLED, GROUP_COMPLETED, GROUP_PARTIAL, GROUP_EXPIRED

ID Formats: `GRP-<uuid>` (group), `PAY-<uuid>` (payment), `tok_<uuid>` (checkout token), `WHEVT-<uuid>` (webhook event)

Terminal states: COMPLETED, EXPIRED, TX_FAILED, RISK_REJECTED, REFUNDED, DISPUTE_RESOLVED
