# XAgent Pay — The Settlement Layer for Agentic Commerce

> AI Agents autonomously discover services, negotiate payments, and settle on-chain — no human clicks required.

## Why XAgent Pay?

Today's AI agents can browse, reason, and plan — but they can't pay. When an AI agent books a flight or reserves a hotel, a human must still click "confirm" and enter card details. **XAgent Pay removes this bottleneck** by giving AI agents the ability to settle payments autonomously on-chain, with cryptographic guarantees that the service was delivered.

**XAgent Pay** is a payment orchestration protocol that enables AI Agents to transact with each other using on-chain USDC settlement on **XLayer Mainnet**. It is built on two complementary layers:

- **x402** ([Coinbase standard](https://github.com/coinbase/x402)) — HTTP payment signaling layer. Defines how an agent discovers payment requirements: a service returns `HTTP 402` with payment metadata, the agent signs an EIP-3009 authorization and retries. x402 is a *communication protocol*, not a settlement workflow.
- **ERC-8183 Agentic Commerce Protocol** — On-chain settlement workflow standard. Defines the complete job lifecycle (fund → deliver → evaluate → complete) with cryptographic escrow and third-party verification. x402 can serve as the *signaling trigger* for an ERC-8183 settlement.

XAgent Pay implements both, plus its own **NUPS Group Escrow** for multi-merchant batch payments.

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
│              (Lark, Claude, ChatGPT, etc.)                 │
└──────┬────────────────────────────────┬────────────────────┘
       │ ① search_and_quote (MCP/REST)  │ ② xagent_orchestrate_payment
       │                                │    (MCP/REST)
┌──────▼──────────────────────┐  ┌──────▼─────────────────────────────┐
│      Merchant Agents        │  │           XAgent Core               │
│                             │  │                                      │
│  ┌──────────┐ ┌──────────┐  │  │  ┌────────────┐  ┌──────────────┐  │
│  │  Flight  │ │  Hotel   │  │  │  │Orchestrator│  │ ChainWatcher │  │
│  │  Agent   │ │  Agent   │  │  │  └─────┬──────┘  └──────┬───────┘  │
│  └──────────┘ └──────────┘  │  │        │                │          │
│  ┌──────────┐               │  │  ┌─────▼────────────────▼───────┐  │
│  │   eSIM   │  x402: agent  │  │  │   PostgreSQL (State Machine) │  │
│  │  Agent   │◄──calls API──►│  │  └──────────────────────────────┘  │
│  └──────────┘  402→pay→retry│  │  ┌──────────┐  ┌───────────────┐  │
│                             │  │  │  Relayer │  │   Checkout    │  │
└──────┬──────────────────────┘  │  └──────────┘  └───────────────┘  │
       │ ③ Webhook (deliver)     └──────────────────────┬─────────────┘
       └──────────────────────────────────────────────── │
                                                         │ On-chain Settlement
                          ┌──────────────────────────────▼──────────────┐
                          │          XLayer Mainnet (Chain ID: 196)      │
                          │                                               │
                          │  ┌───────────────┐  ┌──────────────────┐    │
                          │  │ XAgentPay     │  │ AgenticCommerce  │    │
                          │  │ Escrow        │  │ (ERC-8183 Jobs)  │    │
                          │  └───────────────┘  └──────────────────┘    │
                          │  ┌───────────────┐  ┌──────────────────┐    │
                          │  │ AutoEvaluator │  │      USDC        │    │
                          │  └───────────────┘  └──────────────────┘    │
                          └───────────────────────────────────────────────┘
```

**Two layers, three implementations:**
- **x402 (HTTP signaling)** — agent calls merchant API → `402 Payment Required` → signs EIP-3009 → retries → fulfilled directly on-chain
- **ERC-8183 (settlement workflow)** — `batchCreateAndFund()` → job escrow → deliver → AutoEvaluator verifies → `complete()` → funds released
- **NUPS Group Escrow** — ① quote → ② orchestrate → checkout → multi-sig escrow → ③ deliver → auto-release

## Payment Standards

### x402 — HTTP Payment Signaling Layer

x402 is a **communication protocol**, not a settlement workflow. It standardizes how a service communicates "you need to pay before I respond."

When an AI agent calls a paid API endpoint:

```
Agent → GET /api/search_and_quote
     ← 402 { amount: "100000", payTo: "0x...", network: "eip155:196" }

Agent → signs EIP-3009 USDC authorization
     → retry with X-PAYMENT: { signature, ... }
     ← 200 OK + result
```

Settlement is immediate — an EIP-3009 signed transfer, no escrow, no job lifecycle. x402 can also serve as the **signaling trigger** for an ERC-8183 job: the 402 response instructs the agent to create an on-chain job instead of a direct transfer.

### ERC-8183 — Agentic Commerce Workflow Standard

ERC-8183 is a **smart contract workflow standard** for verifiable job-based commerce. Unlike x402's direct transfer, ERC-8183 holds funds in escrow until an independent Evaluator confirms delivery.

```
User → approve USDC → batchCreateAndFund() → JOB_FUNDED
                                                   ↓
                                        Agent delivers service
                                                   ↓
                                        submit()→ JOB_SUBMITTED
                                                   ↓
                                        AutoEvaluator.evaluate()
                                                   ↓
                                        complete() → JOB_COMPLETED
                                                   ↓
                                        Funds released to provider
```

**Key innovation**: ERC-8183 requires an independent `AutoEvaluator` to verify the deliverable on-chain before releasing funds — creating trustless, verifiable AI-to-AI commerce.

### NUPS Group Escrow — Multi-Merchant Batch Settlement

XAgent Pay's native escrow for bundling multiple merchant payments into a single user transaction. Quotes from multiple agents are aggregated, signed, and settled together via `XAgentPayEscrow`.

```
Agent A quote + Agent B quote + Agent C quote
→ xagent_orchestrate_payment()
→ batchDepositApprove() [one tx, one approval]
→ funds escrowed per merchant
→ each merchant delivers → auto-release()
→ SETTLED
```

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

1. **User** sends request via AI Agent (Lark, Claude, etc.)
2. **AI Agent** calls `search_and_quote` on each merchant agent — flight, hotel, eSIM respond with signed quotes
3. **AI Agent** calls `xagent_orchestrate_payment` on XAgent Core → receives checkout URL
4. **User** opens checkout page, connects wallet (OKX Wallet / MetaMask)
5. **User** approves USDC + calls `batchCreateAndFund()` on AgenticCommerce — one tx, multiple jobs
6. **ChainWatcher** detects `JobCreated` events → status = `JOB_FUNDED`
7. **Webhook** notifies each merchant agent
8. **Merchant Agent** constructs deliverable → calls `/api/acp/submit-deliverable`
9. **Relayer** calls `AgenticCommerce.submit()` → status = `JOB_SUBMITTED`
10. **ChainWatcher** detects `JobSubmitted` → triggers `AutoEvaluator.evaluate()`
11. **AutoEvaluator** calls `complete()` → funds released to provider
12. **Status** = `JOB_COMPLETED` — verifiable on-chain settlement

## License

Copyright (c) 2026. All rights reserved.
