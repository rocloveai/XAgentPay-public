# XAgentPay — Developer Guide

## Project Overview
XAgentPay — AI Agent autonomous payment protocol on XLayer Mainnet.
Enables AI agents to autonomously pay other AI agents using USDC via escrow smart contracts.

**GitHub:** https://github.com/rocloveai/XAgentPay

---

## Architecture (7 Services)

| Service | Local Path | Description |
|---|---|---|
| xagent-website | src/xagent-website | Marketing site + Agent Marketplace |
| xagent-core | src/xagent-core | Payment orchestration engine |
| flight-agent | src/flight-agent | Flight booking merchant (Duffel) |
| hotel-agent | src/hotel-agent | Hotel booking merchant (Amadeus) |
| esim-agent | src/esim-agent | eSIM data plans merchant |
| telegram-bot | src/telegram-bot | Telegram bot interface (Eva) |
| telegram-order-panel | src/telegram-order-panel | Order management panel |

---

## Blockchain Config

- **Network:** XLayer Mainnet, Chain ID: 196
- **RPC:** https://rpc.xlayer.tech
- **USDC:** `0x74b7F16337b8972027F6196A17a631aC6dE26d22`
- **XAgentPayEscrow:** `0x959028964e8a4e52d6AC716E621B68b3fa579A25`
- **AgenticCommerce (ERC-8183):** `0x6DE4FA2B5fd0746E773C4CFEa152e5252bBCbB33`
- **AutoEvaluator:** `0x49C11b686f45B0220B9d2Ce2B971049D9118e76a`

---

## Credentials

All credentials are stored in environment variables. See `deploy/.env.example` for the template.

**Never commit real credentials to the repository.**

---

## Merchants / Registered Agents

| Merchant | DID | Payment Address |
|---|---|---|
| Flight Agent | did:xagent:196:demo_flight | 0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1 |
| Hotel Agent | did:xagent:196:demo_hotel | 0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd |

---

## Tech Stack

| Service | Stack |
|---|---|
| xagent-website | React + Vite + Tailwind CSS + react-i18next |
| xagent-core | TypeScript + MCP + Docker |
| flight/hotel/esim-agent | TypeScript + Docker |
| telegram-bot | TypeScript + Docker |
| telegram-order-panel | Node.js |
| Contracts | Solidity (Foundry) |
| Database | PostgreSQL |

---

## Key Files

- `src/xagent-core/src/server.ts` — MCP + HTTP dual transport entry
- `src/xagent-core/src/services/orchestrator.ts` — payment orchestration
- `src/xagent-core/src/services/relayer.ts` — on-chain TX submission
- `src/xagent-core/src/services/state-machine.ts` — 16-state payment lifecycle
- `src/xagent-core/src/services/chain-watcher.ts` — on-chain event monitoring
- `src/xagent-core/src/rest-api.ts` — REST API endpoints
- `src/xagent-core/src/checkout.ts` — Web checkout page
- `src/contracts/src/XAgentPayEscrow.sol` — Escrow contract
- `src/contracts/src/AgenticCommerce.sol` — ERC-8183 ACP contract
- `src/contracts/src/AutoEvaluator.sol` — Deliverable verification

---

## Development

```bash
# Website dev server
cd src/xagent-website && npm run dev

# Core (HTTP mode)
cd src/xagent-core && TRANSPORT=http npm start

# Docker deployment
cd deploy && cp .env.example .env && docker compose up -d --build
```
