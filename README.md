# XAgent Pay — The Settlement Layer for Agentic Commerce

> AI Agents autonomously discover services, negotiate payments, and settle on-chain — no human clicks required.

## Why XAgent Pay?

Today's AI agents can browse, reason, and plan — but they can't pay. When an AI agent books a flight or reserves a hotel, a human must still click "confirm" and enter card details. **XAgent Pay removes this bottleneck** by giving AI agents the ability to settle payments autonomously on-chain, with cryptographic guarantees that the service was delivered.

**XAgent Pay** is a payment orchestration protocol that enables AI Agents to transact with each other using on-chain USDC settlement on **XLayer Mainnet**. It implements three payment standards:

- **NUPS** (XAgent Unified Payment Standard) — structured quote-to-settlement pipeline
- **x402** — HTTP-native on-chain payment ([Coinbase standard](https://github.com/coinbase/x402))
- **ERC-8183** — Agentic Commerce Protocol with verifiable task delivery

## Live Demo

| Service | URL |
|---------|-----|
| Website | https://xagenpay.com |
| Core API | https://xagenpay.com/api/health |
| Agent Marketplace | https://xagenpay.com (Market tab) |

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    User / AI Agent                         │
│                 (Claude, ChatGPT, etc.)                    │
└─────────────────────────┬─────────────────────────────────┘
                          │ MCP Protocol / REST API
┌─────────────────────────▼─────────────────────────────────┐
│                     XAgent Core                            │
│                                                            │
│  ┌────────────┐ ┌─────────────┐ ┌─────────┐ ┌──────────┐ │
│  │Orchestrator│ │ChainWatcher │ │ Relayer │ │ Checkout │ │
│  └─────┬──────┘ └──────┬──────┘ └────┬────┘ └──────────┘ │
│        │               │             │                    │
│  ┌─────▼───────────────▼─────────────▼──────┐             │
│  │       PostgreSQL (State Machine)          │             │
│  └───────────────────────────────────────────┘             │
└─────────────────────────┬─────────────────────────────────┘
                          │ Webhook
┌─────────────────────────▼─────────────────────────────────┐
│                   Merchant Agents                          │
│                                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │Flight Agent │ │ Hotel Agent │ │ eSIM Agent  │          │
│  │  (Duffel)   │ │  (Amadeus)  │ │  (Airalo)   │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────┬─────────────────────────────────┘
                          │ On-chain Settlement
┌─────────────────────────▼─────────────────────────────────┐
│               XLayer Mainnet (Chain ID: 196)               │
│                                                            │
│  ┌──────────────┐ ┌──────────────────┐ ┌──────┐           │
│  │XAgentPay     │ │AgenticCommerce   │ │ USDC │           │
│  │Escrow        │ │(ERC-8183 Jobs)   │ │      │           │
│  └──────────────┘ └──────────────────┘ └──────┘           │
└───────────────────────────────────────────────────────────┘
```

## Three Payment Paths

### 1. NUPS + Escrow (Default)

Traditional escrow flow — funds locked in `XAgentPayEscrow`, auto-released after merchant fulfillment.

```
User → approve USDC → batchDepositApprove() → ESCROWED → auto-release() → SETTLED
```

### 2. x402 Protocol

HTTP-native payment standard by Coinbase. When an AI agent calls a paid API, the server returns `HTTP 402 Payment Required` with an on-chain payment instruction. The agent signs an EIP-3009 USDC authorization, attaches it to the retry request, and the server verifies + settles on-chain before fulfilling.

```
Agent → GET /api/search → 402 { paymentRequired: { amount, recipient } }
Agent → sign EIP-3009 → retry with X-PAYMENT header → 200 OK (fulfilled)
```

### 3. ERC-8183 Agentic Commerce (New)

Job-based escrow with **third-party Evaluator verification**:

```
User → approve USDC → createAndFund() → JOB_FUNDED
                                            ↓
                                   Agent submits deliverable
                                            ↓
                                       JOB_SUBMITTED
                                            ↓
                                   AutoEvaluator.evaluate()
                                            ↓
                                      JOB_COMPLETED → funds released to provider
```

**Key Innovation**: Unlike self-attestation (merchant says "I delivered"), ERC-8183 requires an independent Evaluator to verify the deliverable before releasing funds. This creates a **trustless, verifiable task delivery** mechanism for AI-to-AI commerce.

## Deployed Contracts (XLayer Mainnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| XAgentPayEscrow | `0x959028964e8a4e52d6AC716E621B68b3fa579A25` | [View](https://www.oklink.com/xlayer/address/0x959028964e8a4e52d6AC716E621B68b3fa579A25) |
| AgenticCommerce (ERC-8183) | `0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33` | [View](https://www.oklink.com/xlayer/address/0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33) |
| AutoEvaluator | `0x49C11b686f45B0220B9d2Ce2B971049D9118e76a` | [View](https://www.oklink.com/xlayer/address/0x49C11b686f45B0220B9d2Ce2B971049D9118e76a) |
| USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` | [View](https://www.oklink.com/xlayer/address/0x74b7F16337b8972027F6196A17a631aC6dE26d22) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity (Foundry) |
| Backend | TypeScript, Node.js |
| Protocol | MCP (Model Context Protocol) |
| Database | PostgreSQL |
| Frontend | React + Vite + Tailwind CSS |
| Blockchain | XLayer Mainnet (EVM, Chain ID 196) |
| Settlement | USDC (ERC-20) |
| Standards | EIP-712, EIP-3009, ISO 20022, ERC-8183 |

## Project Structure

```
src/
├── contracts/           # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── XAgentPayEscrow.sol      # Batch escrow with dispute resolution
│   │   ├── AgenticCommerce.sol       # ERC-8183 job-based escrow
│   │   └── AutoEvaluator.sol         # Automated deliverable verification
│   └── test/
├── xagent-core/         # Payment orchestration engine
│   └── src/
│       ├── server.ts                 # MCP + HTTP dual transport
│       ├── services/
│       │   ├── orchestrator.ts       # Quote → Payment → Settlement
│       │   ├── chain-watcher.ts      # On-chain event monitoring
│       │   ├── relayer.ts            # TX submission (escrow + ACP)
│       │   └── state-machine.ts      # 16-state payment lifecycle
│       ├── checkout.ts               # Web checkout (MetaMask)
│       └── rest-api.ts               # REST endpoints
├── flight-agent/        # Flight booking merchant (Duffel API)
├── hotel-agent/         # Hotel booking merchant (Amadeus API)
├── esim-agent/          # eSIM data plans merchant
├── telegram-bot/        # Telegram bot interface (Eva)
├── telegram-order-panel/# Order management panel
└── xagent-website/      # Marketing website + Agent Marketplace
```

## MCP Tools

XAgent Core exposes 9 MCP tools for AI agents:

| Tool | Description |
|------|-------------|
| `xagent_orchestrate_payment` | Create payment from NUPS quotes |
| `xagent_get_payment_status` | Query payment/group status |
| `xagent_list_agents` | Discover merchant agents |
| `xagent_get_agent_skill` | Get agent capability descriptor |
| `xagent_register_merchant` | Register a new merchant agent |
| `xagent_get_merchant_payments` | Query merchant's payment history |
| `xagent_resolve_dispute` | Resolve escrow disputes |
| `xagent_star_agent` | Star/unstar agents |
| `xagent_get_agent_stars` | Get agent star counts |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- XLayer RPC access (`https://rpc.xlayer.tech`)

### Development

```bash
# Install dependencies
cd src/xagent-core && npm install

# Start in HTTP mode
TRANSPORT=http \
DATABASE_URL=postgresql://... \
RELAYER_PRIVATE_KEY=0x... \
ESCROW_CONTRACT=0x959028964e8a4e52d6AC716E621B68b3fa579A25 \
ACP_CONTRACT=0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33 \
AUTO_EVALUATOR_CONTRACT=0x49C11b686f45B0220B9d2Ce2B971049D9118e76a \
npm start
```

### Docker Deployment

```bash
cd deploy
cp .env.example .env  # Fill in credentials
docker compose up -d --build
```

## End-to-End Flow (ERC-8183)

1. **User** initiates order via Telegram Bot (Eva)
2. **XAgent Core** orchestrates quotes from merchant agents
3. **User** opens checkout page, connects MetaMask
4. **User** approves USDC + calls `createAndFund()` on AgenticCommerce
5. **ChainWatcher** detects `JobCreated` event → status = `JOB_FUNDED`
6. **Webhook** notifies merchant agent
7. **Merchant Agent** constructs deliverable → calls `/api/acp/submit-deliverable`
8. **Relayer** calls `AgenticCommerce.submit()` → status = `JOB_SUBMITTED`
9. **ChainWatcher** detects `JobSubmitted` → triggers `AutoEvaluator.evaluate()`
10. **AutoEvaluator** calls `complete()` → funds released to provider
11. **Status** = `JOB_COMPLETED` — verifiable on-chain settlement

## License

Copyright (c) 2026. All rights reserved.
