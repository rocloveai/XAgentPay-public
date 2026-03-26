# XAgent Pay — The Settlement Layer for Agentic Commerce

> AI Agents autonomously discover services, pay on-chain, and receive confirmations — no human clicks required.

XAgent Pay is a payment infrastructure protocol that lets AI agents transact autonomously using on-chain USDC settlement on **XLayer Mainnet**. Built on the **x402 HTTP payment standard**, it is fully compatible with **OKX Onchain OS**.

---

## Proven Demo

[![XAgent Pay Demo — OKX AI Agent books a full trip with x402 on XLayer](https://img.youtube.com/vi/HtaIoYbf2uo/maxresdefault.jpg)](https://youtu.be/HtaIoYbf2uo)

> **0:00** — XAgent Pay overview &nbsp;|&nbsp; **2:15** — Live demo: OKX Onchain OS × x402 payment

An OKX AI Agent (Eva) completed a full Bangkok travel itinerary — search, payment, and confirmation — with zero human interaction:

| Item | Confirmation | Status |
|------|-------------|--------|
| ✈️ Singapore → Bangkok (Mar 26) | FLT-MN68FHA8 | ✅ Booked |
| 🏨 Bangkok Hotel (2 nights) | HTL-MN68FJL1 | ✅ Booked |
| ✈️ Bangkok → Singapore (Mar 28) | FLT-MN68FOH3 | ✅ Booked |
| 📱 Thailand eSIM 5GB/30d | ESIM-MN68FQAL | ✅ Activated |

**Total: ~4.5 USDC · Network: XLayer Mainnet**

Swap tx (OKB → USDC): [`0xeace52f0...`](https://www.oklink.com/xlayer/tx/0xeace52f0a194782c82a8ae4727a1d8e3f1bdf48eecd83b801d49b57651d19c3f)

---

## How It Works

XAgent Pay uses the **x402 HTTP payment protocol**: a service returns `HTTP 402` with on-chain payment requirements, the agent signs an EIP-3009 USDC authorization and replays the request — settlement is immediate, on-chain, no escrow.

```
┌─────────────────────────────────────────────────────────┐
│                    Developer / AI Agent                  │
└──────┬──────────────────────────────────────────────────┘
       │
       │  Step 1 — Search (FREE)
       │  GET /api/search?origin=SIN&destination=BKK&date=...
       │  ← 200 { offers: [ { offer_id, price, ... } ] }
       │
       │  Step 2 — Purchase (triggers 402)
       │  POST /api/purchase  { offer_id }
       │  ← HTTP 402
       │     base64({ x402Version: 2, accepts: [{
       │       scheme: "exact", network: "eip155:196",
       │       asset: "0x74b7...", amount: "100000",
       │       payTo: "0xac9d...", maxTimeoutSeconds: 300
       │     }]})
       │
       │  Step 3 — Sign on-chain
       │  onchainos payment x402-pay \
       │    --network eip155:196 --amount 100000 \
       │    --pay-to 0xac9d... --asset 0x74b7...
       │  → { signature: "0x...", authorization: { ... } }
       │
       │  Step 4 — Replay with payment
       │  POST /api/purchase  { offer_id }
       │  Header: PAYMENT-SIGNATURE: base64({ ...402_body, payload: { signature, authorization } })
       │  ← HTTP 200 { confirmation: "FLT-MN68FHA8", payment_tx: "0x..." }
       │     USDC transferred on-chain to merchant wallet
       │
└─────────────────────────────────────────────────────────┘
```

Settlement is a single EIP-3009 `transferWithAuthorization` call — no intermediary, no escrow, final.

---

## OKX Onchain OS — Quick Start

Add agents as MCP servers in OKX Onchain OS:

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
| ✈️ Flight | `search_flights` | `purchase_flight` |
| 🏨 Hotel | `search_hotels` | `purchase_hotel` |
| 📱 eSIM | `search_esim_plans` | `purchase_esim` |

Demo prices on XLayer Mainnet:

| Service | Price |
|---------|-------|
| Flight (per leg) | 0.10–0.30 USDC |
| Hotel (per night) | 0.10 USDC |
| eSIM (5GB/30d) | 0.50 USDC |

---

## REST API

Each agent exposes direct HTTP endpoints — no MCP required:

```bash
# Search (free)
GET https://xagenpay.com/flight/api/search?origin=SIN&destination=BKK&date=2026-03-26&passengers=1
GET https://xagenpay.com/hotel/api/search?city=Bangkok&checkin=2026-03-26&checkout=2026-03-28&guests=1
GET https://xagenpay.com/esim/api/search?country=Thailand&data_gb=5

# Purchase (x402 — returns 402 first, replay with PAYMENT-SIGNATURE for 200)
POST https://xagenpay.com/flight/api/purchase/flights   { "offer_id": "..." }
POST https://xagenpay.com/hotel/api/purchase/hotels     { "offer_id": "..." }
POST https://xagenpay.com/esim/api/purchase/esim        { "plan_id": "..." }
```

Skill descriptors (for AI agents to self-discover capabilities):

```
https://xagenpay.com/flight/skill.md
https://xagenpay.com/hotel/skill.md
https://xagenpay.com/esim/skill.md
```

---

## Live Services

| Service | URL |
|---------|-----|
| Agent Marketplace | https://xagenpay.com |
| Core API | https://xagenpay.com/api/health |
| ✈️ Flight Agent | https://xagenpay.com/flight/skill.md |
| 🏨 Hotel Agent | https://xagenpay.com/hotel/skill.md |
| 📱 eSIM Agent | https://xagenpay.com/esim/skill.md |

---

## Deployed Contracts (XLayer Mainnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| XAgentPayEscrow | `0x959028964e8a4e52d6AC716E621B68b3fa579A25` | [View](https://www.oklink.com/xlayer/address/0x959028964e8a4e52d6AC716E621B68b3fa579A25) |
| AgenticCommerce (ERC-8183) | `0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33` | [View](https://www.oklink.com/xlayer/address/0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33) |
| AutoEvaluator | `0x49C11b686f45B0220B9d2Ce2B971049D9118e76a` | [View](https://www.oklink.com/xlayer/address/0x49C11b686f45B0220B9d2Ce2B971049D9118e76a) |
| USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` | [View](https://www.oklink.com/xlayer/address/0x74b7F16337b8972027F6196A17a631aC6dE26d22) |

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
| Standards | x402, EIP-712, EIP-3009 |

---

## Project Structure

```
src/
├── contracts/           # Solidity smart contracts (Foundry)
│   └── src/
│       ├── XAgentPayEscrow.sol       # NUPS batch escrow
│       ├── AgenticCommerce.sol        # ERC-8183 job-based escrow
│       └── AutoEvaluator.sol          # Automated deliverable verification
├── xagent-core/         # Payment orchestration engine
│   └── src/
│       ├── services/orchestrator.ts   # Quote → Payment → Settlement
│       ├── services/chain-watcher.ts  # On-chain event monitoring
│       ├── services/relayer.ts        # TX submission
│       └── checkout.ts                # Web checkout (OKX Wallet / MetaMask)
├── shared/x402/         # x402 HTTP payment library (shared)
│   └── src/
│       ├── facilitator.ts             # EIP-3009 verify + settle on-chain
│       ├── http.ts                    # HTTP 402 build + extract
│       └── middleware.ts              # MCP x402 middleware
├── flight-agent/        # Flight booking merchant (x402)
├── hotel-agent/         # Hotel booking merchant (x402)
├── esim-agent/          # eSIM data plans merchant (x402)
├── telegram-bot/        # Telegram bot interface
└── xagent-website/      # Marketing website + Agent Marketplace
```

---

## In Development

### ERC-8183 — Agentic Commerce Protocol

On-chain escrow with independent verification. Funds held until an `AutoEvaluator` contract confirms delivery — enabling trustless, verifiable AI-to-AI commerce.

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

Contracts already deployed on XLayer Mainnet. Full agent integration in progress.

### NUPS Group Escrow — Multi-Merchant Batch Settlement

Bundle multiple merchant payments into a single user transaction. Quote from flight + hotel + eSIM agents, approve once, settle all.

```
Flight quote + Hotel quote + eSIM quote
→ xagent_orchestrate_payment()
→ batchDepositApprove() [one tx, one approval]
→ each merchant delivers → auto-release()
→ SETTLED
```

---

## License

Copyright (c) 2026. All rights reserved.
