---
name: xnexus-patterns
description: Coding patterns extracted from the xNexus payment orchestration monorepo
version: 1.0.0
source: local-git-analysis
analyzed_commits: 107
---

# xNexus Patterns

## Commit Conventions

**Conventional commits** with optional scope:

| Type | Count | Usage |
|------|-------|-------|
| `fix` | 48 (45%) | Bug fixes, compatibility patches |
| `feat` | 36 (34%) | New features, capabilities |
| `docs` | 8 (7%) | Documentation updates |
| `refactor` | 5 (5%) | Code restructuring |
| `chore` | 5 (5%) | Maintenance, config, migrations |

**Scoped commits** use `type(scope):` with scopes: `core`, `contracts`, `agents`, `portal`, `deploy`, `chain-watcher`, `ui`.

Examples:
```
feat(core): implement checkout page with MetaMask + EIP-3009 signing (Phase 8)
fix(agents): map payment.escrowed webhook to PAID order status
feat(contracts): v4.0.0 — on-chain group signature verification + audit fixes
```

## Code Architecture

### Monorepo Structure

```
src/
├── nexus-core/          # Payment orchestration (MCP + HTTP server)
│   ├── src/
│   │   ├── services/    # Business logic (13 service modules)
│   │   ├── db/          # Repository pattern with interfaces
│   │   │   └── interfaces/  # Abstract repo interfaces
│   │   ├── __tests__/   # Vitest tests mirroring src/ structure
│   │   │   ├── mocks/   # Shared mock implementations
│   │   │   ├── services/
│   │   │   ├── db/
│   │   │   └── integration/
│   │   ├── abi/         # Contract ABI definitions
│   │   ├── server.ts    # HTTP + SSE server (main entry)
│   │   ├── checkout.ts  # Checkout page + confirm flow
│   │   ├── portal.ts    # Admin dashboard
│   │   ├── rest-api.ts  # Stateless REST endpoints
│   │   ├── market.ts    # Marketplace HTML
│   │   └── types.ts     # Shared type definitions
│   ├── skill.md         # Developer-facing capability manifest
│   └── skill-user.md    # User-agent-facing simplified guide
├── contracts/           # Solidity (Foundry)
│   ├── src/xNexusEscrow.sol
│   ├── test/xNexusEscrow.t.sol
│   └── script/          # Deployment scripts
├── flight-agent/        # Merchant agent (flights)
│   └── src/
│       ├── services/    # Quote builder, webhook handler, DB
│       ├── server.ts    # MCP + HTTP server
│       └── portal.ts    # Merchant dashboard
├── hotel-agent/         # Merchant agent (hotels) — mirrors flight-agent
├── nexus-website/       # Static marketing site (React)
└── skills/              # Skill definitions
```

### Key Patterns

**Repository Pattern**: Every data entity has an interface in `db/interfaces/` and an implementation in `db/`. Mock implementations live in `__tests__/mocks/`.

```
db/interfaces/payment-repo.ts  → PaymentRepository (interface)
db/payment-repo.ts             → NeonPaymentRepository (implementation)
__tests__/mocks/mock-payment-repo.ts → MockPaymentRepository (test)
```

**Service Layer**: Business logic in `services/` directory. Services depend on repository interfaces, never on concrete implementations.

**Immutable Data**: Objects are never mutated — always return new copies. State transitions create new records rather than modifying existing ones.

## Workflows

### Adding a New MCP Tool

1. Define tool in `server.ts` using `srv.tool(name, description, schema, handler)`
2. Use Zod for parameter validation
3. Handler calls services (orchestrator, relayer, etc.)
4. Add corresponding REST endpoint in `rest-api.ts` if needed
5. Update `skill.md` and `skill-user.md` with new tool documentation
6. Add tests in `__tests__/`

### Adding a New REST API Endpoint

1. Add route handler in `src/rest-api.ts`
2. Pattern: URL regex match → extract params → call service → `jsonResponse()`
3. CORS headers applied via `CORS_HEADERS` constant
4. Rate limiting via Token Bucket (per-IP, in-memory)
5. Portal token check for routes that overlap with portal dashboard
6. Add tests in `__tests__/rest-api.test.ts`

### Smart Contract Changes

1. Modify `src/contracts/src/xNexusEscrow.sol`
2. Add/update tests in `src/contracts/test/xNexusEscrow.t.sol`
3. Run `forge test` — all tests must pass
4. Deploy via UUPS proxy upgrade (no address change)
5. Use `--legacy --with-gas-price 20000000000` for PlatON Devnet
6. Update ABI in `src/nexus-core/src/abi/nexus-pay-escrow.ts`

### Merchant Agent Development

Flight-agent and hotel-agent mirror each other:
1. `server.ts` — MCP server with quote generation tool
2. `services/quote-builder.ts` — EIP-712 signed quote creation
3. `services/webhook-handler.ts` — Handles nexus-core webhooks
4. `services/order-store.ts` — In-memory order management
5. `portal.ts` — HTML dashboard with embedded JS
6. `skill.md` — Agent capability manifest

### Payment Flow Implementation

1. Merchant agent generates EIP-712 signed quote
2. User agent calls `nexus_orchestrate_payment` with quotes + wallet
3. Nexus-core validates signatures, creates payment group
4. Returns `BatchDepositInstruction` with EIP-3009 signing data
5. User signs via `eth_signTypedData_v4` and submits on-chain tx
6. ChainWatcher detects `Deposited` event → state: ESCROWED
7. Merchant confirms fulfillment → relayer submits `release()`
8. ChainWatcher detects `Released` event → state: SETTLED
9. Webhooks sent at each state transition

### Database Migrations

1. Create migration file in `db/migrations/NNN_description.sql`
2. Register in `db/seed.ts` for auto-application
3. All migrations are idempotent (use `IF NOT EXISTS`, `CREATE OR REPLACE`)
4. Run via `db/seed.ts` which applies in order

## Testing Patterns

- **Framework**: Vitest (TypeScript), Forge (Solidity)
- **Test count**: 291 TS + 98 Solidity = 389 total
- **Test structure**: Mirror `src/` layout in `__tests__/`
- **Mocks**: Dedicated `__tests__/mocks/` directory with mock repos
- **Fixtures**: Shared test data in `__tests__/fixtures.ts`
- **Pattern**: `describe` blocks per route/feature, `it` blocks per behavior
- **Mock style**: `vi.fn()` for function mocks, class-based mock repos implementing interfaces

```typescript
// Typical test structure
describe("handleRestApiRequest", () => {
  let deps: RestApiDeps;
  let merchantRepo: MockMerchantRepository;

  beforeEach(() => {
    merchantRepo = new MockMerchantRepository();
    deps = { orchestrator, merchantRepo, starRepo, kvRepo: null, portalToken: "token" };
  });

  it("returns 404 for unknown payment", async () => { ... });
});
```

## Security Patterns

- **EIP-712 signatures** for all quotes and group approvals
- **EIP-3009** (`transferWithAuthorization`) for gasless token transfers
- **UUPS proxy** pattern for upgradeable escrow contract
- **Token-protected checkout URLs** — `tok_` prefixed, 15-min TTL
- **Rate limiting** — Token Bucket per-IP (30 req/min burst)
- **Portal auth** — Bearer token for admin dashboard
- **Webhook HMAC** — signed webhook payloads to merchant agents

## XLayer Mainnet Specifics

- Chain ID: `196`
- RPC: `https://rpc.xlayer.tech`
- Explorer: `https://www.oklink.com/xlayer`
- Native gas token: OKB
- `block.timestamp` in **seconds** (standard EVM)
- Supports EIP-1559 transactions
- USDC (native): `0x74b7F16337b8972027F6196A17a631aC6dE26d22`

## File Co-Change Patterns

Files that frequently change together:
- `server.ts` ↔ `checkout.ts` ↔ `types.ts` (core payment flow)
- `flight-agent/server.ts` ↔ `hotel-agent/server.ts` (mirrored agents)
- `flight-agent/portal.ts` ↔ `hotel-agent/portal.ts` (mirrored dashboards)
- `xNexusEscrow.sol` ↔ `xNexusEscrow.t.sol` (contract + tests)
- `skill.md` files update when tools or endpoints change
