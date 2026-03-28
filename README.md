# XAgent Pay — The Settlement Layer for Agentic Commerce

> AI Agents autonomously discover services, pay on-chain, and get confirmations — no human clicks required.

## What Is XAgent Pay?

Today's AI agents can browse, reason, and plan — but they can't pay. When an AI agent books a flight or reserves a hotel, a human must still click "confirm" and enter card details. **XAgent Pay removes this bottleneck** by giving AI agents the ability to pay autonomously on-chain, with cryptographic guarantees.

XAgent Pay is a payment infrastructure protocol for AI agents built on **XLayer Mainnet**. It implements the **x402 HTTP payment standard** (OKX Onchain OS compatible) and the **ERC-8183 Agentic Commerce Protocol**, plus its own **NUPS Group Escrow** for multi-merchant batch settlements.

### Proven Demo

An OKX AI Agent (Eva) completed a full Bangkok travel itinerary autonomously:

| Item | Confirmation | Status |
|------|-------------|--------|
| ✈️ Singapore → Bangkok (Mar 26) | FLT-MN68FHA8 | ✅ Booked |
| 🏨 Bangkok Hotel (2 nights) | HTL-MN68FJL1 | ✅ Booked |
| ✈️ Bangkok → Singapore (Mar 28) | FLT-MN68FOH3 | ✅ Booked |
| 📱 Thailand eSIM 5GB | ESIM-MN68FQAL | ✅ Activated |

Swap tx (OKB→USDC): [`0xeace52f0...`](https://www.oklink.com/xlayer/tx/0xeace52f0a194782c82a8ae4727a1d8e3f1bdf48eecd83b801d49b57651d19c3f)

---

## Live Services

| Service | URL | Description |
|---------|-----|-------------|
| Website | https://xagenpay.com | Agent Marketplace |
| Core API | https://xagenpay.com/api/health | Payment orchestration |
| ✈️ Flight Agent | https://xagenpay.com/flight/skill.md | Search + book flights |
| 🏨 Hotel Agent | https://xagenpay.com/hotel/skill.md | Search + book hotels |
| 📱 eSIM Agent | https://xagenpay.com/esim/skill.md | Search + activate eSIMs |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User / AI Agent                       │
│          (OKX Onchain OS, Claude, etc.)                  │
└──────┬──────────────────────────────────────────────────┘
       │
       │  ① search (FREE)  →  GET /api/search
       │  ② purchase       →  POST /api/purchase
       │                      ← HTTP 402 + base64 payment requirement
       │  ③ sign EIP-3009  →  onchainos payment x402-pay
       │  ④ retry          →  POST /api/purchase + PAYMENT-SIGNATURE header
       │                      ← HTTP 200 + confirmation
       │
┌──────▼──────────────────────────────────────────────────┐
│                  Merchant Agents                          │
│                                                          │
│   Flight Agent              Hotel Agent                  │
│   /flight/api/search        /hotel/api/search            │
│   /flight/api/purchase      /hotel/api/purchase          │
│                                                          │
│   eSIM Agent                XAgent Core (NUPS)           │
│   /esim/api/search          /api/orchestrate             │
│   /esim/api/purchase        /api/checkout                │
└──────────────────────────────┬──────────────────────────┘
                               │ On-chain Settlement
                ┌──────────────▼──────────────────────┐
                │      XLayer Mainnet (Chain ID 196)   │
                │                                      │
                │  USDC EIP-3009 transferWithAuth       │
                │  XAgentPayEscrow (NUPS batch)         │
                │  AgenticCommerce (ERC-8183 jobs)      │
                └──────────────────────────────────────┘
```

---

## Payment Standards

### x402 — HTTP Payment Protocol (Primary)

x402 is the **OKX Onchain OS compatible** payment signaling layer. Any AI agent with x402 support can pay autonomously:

```
1. Agent → POST /api/purchase   (no payment header)
        ← HTTP 402
           base64({ x402Version:2, accepts:[{
             scheme:"exact", network:"eip155:196",
             asset:"0x74b7...", amount:"500000",
             payTo:"0xac9d...", maxTimeoutSeconds:300
           }]})

2. Agent runs: onchainos payment x402-pay \
     --network eip155:196 --amount 500000 \
     --pay-to 0xac9d... --asset 0x74b7...
   → { signature: "0x...", authorization: {...} }

3. Agent → POST /api/purchase
   Header: PAYMENT-SIGNATURE: base64({...decoded_402, payload:{signature,authorization}})
        ← HTTP 200 { confirmation: "FLT-MN68FHA8", payment_tx: "0x..." }
```

Settlement is immediate — EIP-3009 `transferWithAuthorization` moves USDC from payer to merchant in one on-chain transaction.

### ERC-8183 — Agentic Commerce Protocol

On-chain escrow with independent verification. Funds are held until an `AutoEvaluator` confirms delivery:

```
approve USDC → batchCreateAndFund() → JOB_FUNDED
                                          ↓
                              Merchant delivers service
                                          ↓
                              submit(deliverable) → JOB_SUBMITTED
                                          ↓
                              AutoEvaluator.evaluate()
                                          ↓
                              complete() → JOB_COMPLETED → funds released
```

### NUPS Group Escrow — Multi-Merchant Batch Settlement

Bundle multiple merchant payments into a single user transaction:

```
Flight quote + Hotel quote + eSIM quote
→ xagent_orchestrate_payment()
→ batchDepositApprove() [one tx]
→ each merchant delivers → auto-release()
→ SETTLED
```

---

## Deployed Contracts (XLayer Mainnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| XAgentPayEscrow | `0x959028964e8a4e52d6AC716E621B68b3fa579A25` | [View](https://www.oklink.com/xlayer/address/0x959028964e8a4e52d6AC716E621B68b3fa579A25) |
| AgenticCommerce (ERC-8183) | `0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33` | [View](https://www.oklink.com/xlayer/address/0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33) |
| AutoEvaluator | `0x49C11b686f45B0220B9d2Ce2B971049D9118e76a` | [View](https://www.oklink.com/xlayer/address/0x49C11b686f45B0220B9d2Ce2B971049D9118e76a) |
| USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` | [View](https://www.oklink.com/xlayer/address/0x74b7F16337b8972027F6196A17a631aC6dE26d22) |

---

## OKX Onchain OS — Quick Start

Add any agent as an MCP server in OKX Onchain OS:

```json
{
  "mcpServers": {
    "xagent-flight": { "url": "https://xagenpay.com/flight/mcp" },
    "xagent-hotel":  { "url": "https://xagenpay.com/hotel/mcp" },
    "xagent-esim":   { "url": "https://xagenpay.com/esim/mcp" }
  }
}
```

Available tools per agent:

| Agent | Free Tools | Paid Tools (x402) |
|-------|-----------|-------------------|
| Flight | `search_and_quote`, `search_flights` | `purchase_flight` |
| Hotel | `search_and_quote`, `search_hotels` | `purchase_hotel` |
| eSIM | `search_and_quote`, `search_esim_plans` | `purchase_esim` |

### Demo Prices (XLayer Mainnet)

| Service | Price |
|---------|-------|
| Flight (each leg) | 0.10–0.30 USDC |
| Hotel (per night) | 0.10 USDC |
| eSIM (5GB/30d) | 0.50 USDC |

---

## REST API

Each agent also exposes direct HTTP endpoints (no MCP required):

```bash
# Flight search (free)
GET https://xagenpay.com/flight/api/search?origin=SIN&destination=BKK&date=2026-03-26&passengers=1

# Hotel search (free)
GET https://xagenpay.com/hotel/api/search?city=Bangkok&checkin=2026-03-26&checkout=2026-03-28&guests=1

# eSIM search (free)
GET https://xagenpay.com/esim/api/search?country=Thailand&data_gb=5

# Purchase (x402 — returns 402 first, then 200 with PAYMENT-SIGNATURE)
POST https://xagenpay.com/flight/api/purchase/flights
POST https://xagenpay.com/hotel/api/purchase/hotels
POST https://xagenpay.com/esim/api/purchase/esim
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity (Foundry) |
| Backend | TypeScript, Node.js, Docker |
| Protocol | MCP (Model Context Protocol) + x402 HTTP |
| Database | PostgreSQL |
| Frontend | React + Vite + Tailwind CSS |
| Blockchain | XLayer Mainnet (EVM, Chain ID 196) |
| Payment Token | USDC (EIP-3009 `transferWithAuthorization`) |
| Standards | x402, EIP-712, EIP-3009, ERC-8183 |

---

## Project Structure

```
src/
├── contracts/           # Solidity smart contracts (Foundry)
│   └── src/
│       ├── XAgentPayEscrow.sol       # NUPS batch escrow
│       ├── AgenticCommerce.sol        # ERC-8183 job-based escrow
│       └── AutoEvaluator.sol          # Automated deliverable verification
├── xagent-core/         # Payment orchestration engine (NUPS)
│   └── src/
│       ├── services/orchestrator.ts   # Quote → Payment → Settlement
│       ├── services/chain-watcher.ts  # On-chain event monitoring
│       ├── services/relayer.ts        # TX submission
│       └── checkout.ts                # Web checkout (MetaMask / OKX Wallet)
├── shared/x402/         # x402 HTTP payment library (shared)
│   └── src/
│       ├── facilitator.ts             # EIP-3009 verify + settle
│       ├── http.ts                    # HTTP 402 build + parse
│       └── middleware.ts              # MCP x402 middleware
├── flight-agent/        # Flight booking merchant (x402)
├── hotel-agent/         # Hotel booking merchant (x402)
├── esim-agent/          # eSIM data plans merchant (x402)
├── telegram-bot/        # Telegram bot interface
└── xagent-website/      # Marketing website + Agent Marketplace
```

---

## End-to-End Flow (x402)

1. **Agent** calls `GET /api/search` — free, no payment
2. **Agent** picks an offer, calls `POST /api/purchase` — server returns HTTP 402 with payment requirement
3. **Agent** runs `onchainos payment x402-pay` — signs EIP-3009 USDC authorization
4. **Agent** assembles `PAYMENT-SIGNATURE` header and replays the purchase request
5. **Server** verifies signature, calls `transferWithAuthorization` on XLayer USDC
6. **Server** waits for on-chain confirmation, returns HTTP 200 with confirmation number
7. **Agent** returns booking details to user — fully autonomous, no human clicks

---

## License

MIT License — see [LICENSE](LICENSE) for details.
