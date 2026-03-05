# RFC vs Implementation Gap Analysis

> Generated: 2026-02-26
> Scope: All 11 RFCs + SYSTEM-OVERVIEW vs actual codebase

## Summary

| RFC | Title | Conformance | Key Gap |
|-----|-------|:-----------:|---------|
| RFC-001 | DID Method | 20% | No on-chain registry, DID is just a DB string |
| RFC-002 | NUPS Payment Standard | 60% | Missing `iso_metadata`, `iso_hash` in signatures |
| RFC-003 | Agent Interface (NAIS) | 40% | No `@nexus/agent-kit` SDK, no MCP Resources/Prompts |
| RFC-004 | Client Standard (NCS) | 0% | `@nexus/seller-sdk` does not exist |
| RFC-005v2 | Payment Core MVP | 50% | Escrow replaced Direct Transfer; chain_id changed |
| RFC-006 | Risk Gatekeeper | 0% | Not implemented (future) |
| RFC-007 | Core Agentic Interface | 5% | Hub-Spoke/MPC/KYT are future; only PlatON single-chain |
| RFC-008 | Merchant Skill (NMSS) | 90% | Minor body section differences (no Quick Setup section) |
| RFC-009 | Webhook Standard | 85% | Event types differ (escrow events); no `iso_metadata` in payloads |
| RFC-010 | Escrow Contract | 70% | Implementation exceeds spec (batch, group sig, RESOLVED_SPLIT) |
| RFC-011 | Buyer Skills (NBSS) | 0% | `@nexus/buyer-skills` SDK does not exist |
| OVERVIEW | System Overview | 40% | Chain ID wrong; architecture diagram shows Direct Transfer |

---

## RFC-001: Nexus DID Method

### Spec Says
- On-chain `NexusMerchantRegistry` contract for CRUD operations
- W3C DID Document resolution (`verificationMethod`, `service`, `authentication`)
- Key separation: `signer` (hot wallet) vs `paymentAddress` (cold/multisig)
- EIP-1271 contract wallet support for signature verification
- DID format: `did:nexus:<chain_id>:<unique_id>`

### Reality
- DID is a plain string stored in `merchant_registry` PostgreSQL table
- No on-chain registry contract deployed
- No W3C DID Document generation or resolution
- No EIP-1271 support (only EOA `ecrecover`)
- `signer_address` and `payment_address` are separate DB columns (key separation exists in DB, not on-chain)

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| On-chain NexusMerchantRegistry contract | NOT IMPLEMENTED | Low (MVP acceptable) |
| W3C DID Document JSON generation | NOT IMPLEMENTED | Low |
| EIP-1271 contract wallet verification | NOT IMPLEMENTED | Medium |
| DID format used correctly | IMPLEMENTED | - |
| Key separation (signer vs payment) | PARTIAL (DB only) | Low |

### Recommendation
RFC-005v2 already acknowledges "Local DID Registry" as MVP approach. Update RFC-001 to mark on-chain registry as "Phase 2" and document the current DB-based resolution.

---

## RFC-002: NUPS Payment Standard

### Spec Says
- Quote payload includes `iso_metadata` with ISO 4217 (`account_currency`), ISO 24165 (`asset_identifier.dti_code`), creditor BIC
- EIP-712 signature covers `context_hash` AND `iso_hash`
- Payment type identifier: `urn:ucp:payment:nexus_v1`

### Reality
- Quote has `context` (summary + line_items) but **no `iso_metadata`**
- EIP-712 NexusQuote types include `context_hash` but **no `iso_hash`** field
- `urn:ucp:payment:nexus_v1` is used correctly
- Quote fields: `merchant_did`, `merchant_order_ref`, `amount`, `currency`, `chain_id`, `expiry`, `context`, `signature` (all match)

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| Core quote fields (did, ref, amount, etc.) | IMPLEMENTED | - |
| `context` with summary + line_items | IMPLEMENTED | - |
| `iso_metadata` in quote payload | NOT IMPLEMENTED | Low (enterprise feature) |
| `iso_hash` in EIP-712 signature | NOT IMPLEMENTED | Low |
| UCP payment type identifier | IMPLEMENTED | - |
| EIP-712 quote signing | IMPLEMENTED | - |

### Recommendation
`iso_metadata` is an enterprise feature targeting bank ERP integration. Remove from MVP spec or mark as optional. Update RFC-002 to reflect current minimal quote schema.

---

## RFC-003: Agent Interface (NAIS)

### Spec Says
- `@nexus/agent-kit` SDK with LangChain, Genkit, MCP adapters
- Two skills: `SignQuote` (generate signed quote) + `VerifyReceipt` (check settlement on-chain)
- MCP Resources: `nexus://orders/{order_ref}/state`
- MCP Prompts: `nexus_checkout_flow`
- MCP Tools: `nexus_generate_quote`, `nexus_check_status`

### Reality
- No `@nexus/agent-kit` package exists
- Merchant agents implement `nexus_generate_quote` tool directly in server.ts
- Merchant agents implement `nexus_check_order_status` tool
- **No MCP Resources** exposed (no `nexus://` URI scheme)
- **No MCP Prompts** defined
- UCP Checkout Response format is correctly implemented

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| `nexus_generate_quote` tool | IMPLEMENTED (directly) | - |
| `nexus_check_status` tool | IMPLEMENTED (as `nexus_check_order_status`) | - |
| UCP Checkout Response format | IMPLEMENTED | - |
| `@nexus/agent-kit` SDK | NOT IMPLEMENTED | Medium |
| MCP Resources (nexus://) | NOT IMPLEMENTED | Low |
| MCP Prompts | NOT IMPLEMENTED | Low |

### Recommendation
Tool name differs: `nexus_check_status` (spec) vs `nexus_check_order_status` (impl). Either rename or update spec. The SDK can be extracted later once patterns stabilize.

---

## RFC-004: Client Standard (NCS)

### Spec Says
- `@nexus/seller-sdk` npm package
- Three integration modes: AI Native (Genkit plugin), MCP Server, REST API
- Automatic ISO mapping, unit conversion, mock mode, smart retry

### Reality
- **Package does not exist**
- Each merchant agent (flight-agent, hotel-agent) implements quote building, EIP-712 signing, and webhook handling directly
- No Genkit/LangChain adapter

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| `@nexus/seller-sdk` package | NOT IMPLEMENTED | Medium |
| Genkit plugin mode | NOT IMPLEMENTED | Low |
| MCP Server mode | PARTIAL (agents implement MCP directly) | - |
| REST API mode | PARTIAL (agents have HTTP endpoints) | - |
| Auto ISO mapping | NOT IMPLEMENTED | Low |
| Auto unit conversion | NOT IMPLEMENTED (agents handle manually) | Low |

### Recommendation
This is a developer experience improvement. Extract common patterns from flight-agent and hotel-agent into a shared SDK. Not blocking for MVP.

---

## RFC-005v2: Payment Core MVP (Direct Settlement)

### Spec Says
- **Direct ERC-20 transfer** (user sends USDC directly to merchant address)
- Core doesn't touch funds
- Chain ID: **210425** (PlatON)
- States: CREATED → AWAITING_TX → BROADCASTED → SETTLED → COMPLETED → EXPIRED → TX_FAILED → RISK_REJECTED
- Chain Watcher monitors ERC-20 Transfer events
- `PaymentInstruction` with `method: "erc20_transfer"` and `tx_data`

### Reality
- **Escrow contract** is used (user deposits to xNexusEscrow, not direct to merchant)
- Core's relayer submits release transactions
- Chain ID: **20250407** (PlatON Devnet)
- States: CREATED → GROUP_AWAITING_TX → ESCROWED → SETTLED → COMPLETED (+ DISPUTE_OPEN, DISPUTE_RESOLVED, etc.)
- Chain Watcher monitors escrow Deposited/Released events
- `BatchDepositInstruction` with EIP-3009 signing data
- **Group concept** (multiple payments aggregated into one tx) — not in spec
- **Batch deposits** with group signatures — not in spec

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| Payment model | **DEVIATED** (Escrow, not Direct Transfer) | HIGH — spec needs update |
| Chain ID | **CHANGED** (20250407 vs 210425) | HIGH — spec needs update |
| State machine | **REDESIGNED** (group-aware, escrow states) | HIGH — spec needs update |
| Orchestrator + quote verification | IMPLEMENTED | - |
| Chain Watcher | IMPLEMENTED (escrow events) | - |
| Webhook notification | IMPLEMENTED | - |
| PostgreSQL persistence | IMPLEMENTED | - |
| EIP-712 signature verification | IMPLEMENTED | - |
| Anti-replay (nonce guard) | PARTIAL (expiry check, no quote_hash unique constraint) | Low |
| DID resolution from DB | IMPLEMENTED | - |
| Payment address trust (from registry, not quote) | IMPLEMENTED | - |
| RISK_REJECTED state | NOT IMPLEMENTED | Low (no risk engine) |
| DIRECT_TRANSFER mode | NOT IMPLEMENTED (Escrow only) | Medium |

### Recommendation
**RFC-005v2 is significantly out of date.** The implementation pivoted from Direct Transfer to Escrow-based settlement. Needs a major rewrite (or new RFC-005v3) to document:
1. Escrow-based payment model
2. Group/batch deposit concept
3. EIP-3009 authorization flow
4. Relayer-based gas abstraction
5. Updated state machine with escrow states
6. Chain ID 20250407

---

## RFC-006: Risk Gatekeeper

### Spec Says
- Off-chain AI risk engine + on-chain RiskPermit verification
- Chainalysis KYT integration
- Fail-close mechanism
- EIP-712 RiskPermit struct

### Reality
- **Not implemented at all**
- No risk assessment, no KYT, no permit system
- All payments are accepted without risk scoring

### Recommendation
Keep as future RFC. No action needed for MVP. Add a note in SYSTEM-OVERVIEW marking this as Phase 3.

---

## RFC-007: Core Agentic Interface

### Spec Says
- Hub-Spoke cross-chain (PlatON hub + Base/Ethereum spokes)
- MPC ephemeral addresses (Fireblocks/Coinbase WaaS)
- Draft-then-Finalize interaction model
- KYT integration at DETECTING state
- 8-state machine: DRAFT → AWAITING_DEPOSIT → DETECTING → SYNCING → LOCKED → RELEASE_SIGNED → CLAIMED → RISK_REJECTED

### Reality
- **Single chain** (PlatON Devnet only)
- No MPC, no cross-chain bridges
- No Draft-then-Finalize (orchestrate returns ready instruction immediately)
- No KYT integration
- Different state machine entirely

### Recommendation
This is the "Full Vision" architecture. Keep as-is but clearly label as future. SYSTEM-OVERVIEW already shows this as "Future" tier — that's correct.

---

## RFC-008: Merchant Skill Standard (NMSS)

### Spec Says
- `skill.md` in package root with YAML frontmatter
- Required frontmatter: `name`, `version`, `description`, **`merchant_did`**, `protocol`, `category`, `currencies`, `chain_id`, `tools`
- Tools array needs minimum 3 entries: `search` (1+), `quote` (1), `status` (1)
- Markdown body sections: Title, Quick Setup, Available Tools, Checkout Workflow, Portal Dashboard

### Reality (flight-agent/skill.md)
- `skill.md` exists with YAML frontmatter
- Frontmatter has: `name`, `version`, `description`, **`merchant_did`**, `protocol`, `category`, `currencies`, `chain_id`, `tools` — all required fields present
- Tools: `search_flights` (search), `nexus_generate_quote` (quote), `nexus_check_order_status` (status) — all 3 roles covered
- Body has tool documentation but **no "Quick Setup" section** with MCP JSON config
- Body has checkout workflow section

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| skill.md file exists | IMPLEMENTED | - |
| YAML frontmatter with required fields | IMPLEMENTED (all fields including `merchant_did`) | - |
| Minimum 3 tool roles (search/quote/status) | IMPLEMENTED | - |
| Tool documentation in body | IMPLEMENTED | - |
| Quick Setup section with MCP config JSON | NOT IMPLEMENTED | Medium |
| Checkout Workflow section | IMPLEMENTED | - |
| Portal Dashboard section | IMPLEMENTED | - |

### Recommendation
Add Quick Setup section with MCP connection JSON. Minor update only — frontmatter is fully conformant.

---

## RFC-009: Webhook Standard

### Spec Says
- HMAC-SHA256 signature in `X-Nexus-Signature` header
- Signature = `HMAC-SHA256(secret, timestamp + "." + body)`
- 6 retry attempts with exponential backoff
- Events: `payment.created`, `payment.settled`, `payment.expired`, `payment.failed`, `fulfillment.confirmed`
- `iso_metadata` block in webhook data payload
- `webhook_delivery_logs` table

### Reality
- **HMAC-SHA256 signing IS implemented** in `webhook-notifier.ts` — uses `createHmac("sha256", merchant.webhook_secret).update(\`${timestamp}.${body}\`).digest("hex")` with `X-Nexus-Signature` and `X-Nexus-Timestamp` headers
- Retry with exponential backoff: **6 attempts** (matches RFC-009 spec exactly: 10s, 30s, 2min, 10min, 30min)
- Events sent: `payment.escrowed`, `payment.settled`, `payment.completed`, `payment.refunded`, `dispute.opened`, `dispute.resolved` (escrow-extended set)
- **No `iso_metadata`** in webhook payloads (optional enterprise feature)
- **`webhook_delivery_logs` table EXISTS** in `db/migrations/003_nexus_core_schema.sql`
- Timing-safe comparison for signature verification

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| Webhook HTTP POST delivery | IMPLEMENTED | - |
| HMAC-SHA256 signature | IMPLEMENTED | - |
| `X-Nexus-Signature` header | IMPLEMENTED | - |
| `X-Nexus-Timestamp` header | IMPLEMENTED | - |
| Retry with backoff (6 attempts) | IMPLEMENTED | - |
| `webhook_delivery_logs` table | IMPLEMENTED | - |
| Event types match spec | DEVIATED — spec has `payment.created/settled/expired/failed`, impl has escrow events (`payment.escrowed`, `dispute.*`) | Medium |
| `iso_metadata` in payload | NOT IMPLEMENTED | Low (enterprise feature) |
| Idempotency via `event_id` | IMPLEMENTED (events table + delivery logs) | - |

### Recommendation
Update RFC-009 event types to include escrow-specific events (`payment.escrowed`, `payment.refunded`, `dispute.opened`, `dispute.resolved`, `payment.completed`). Mark `iso_metadata` as optional. Core security features (HMAC, retry, delivery logs) are fully conformant.

---

## RFC-010: xNexus Escrow Contract

### Spec Says
- EIP-3009 `transferWithAuthorization` + Relayer
- States: DEPOSITED → RELEASED / REFUNDED / DISPUTED → RESOLVED_TO_MERCHANT / RESOLVED_TO_PAYER
- Single deposit per payment
- Chain ID: 210425
- Gas model: Relayer pays all gas
- Role-based access: operator (release), arbiter (resolve), anyone (refund after timeout)

### Reality (v4.0.0)
- EIP-3009 implemented via `batchDepositWithAuthorization` (batch, not single)
- States match spec + added: **RESOLVED_SPLIT** (partial refund to both parties)
- **Batch deposits** with multiple payments in one tx
- **Group signature verification** (`batchDepositWithGroupApproval`)
- **UUPS proxy** pattern (upgradeable)
- Chain ID: **20250407**
- `MAX_BATCH_SIZE = 20` (gas griefing protection)
- `feeBps` snapshot at deposit time (L-04 audit fix)
- `refundUnresolvedDispute()` for auto-refund after arbitration timeout (H-01 audit fix)
- Millisecond-based timestamps (PlatON EVM quirk)

### Gaps
| Item | Status | Priority |
|------|--------|----------|
| EIP-3009 authorization | IMPLEMENTED | - |
| Escrow states (DEPOSITED/RELEASED/REFUNDED/DISPUTED) | IMPLEMENTED | - |
| Dispute resolution (RESOLVED_TO_MERCHANT/TO_PAYER) | IMPLEMENTED | - |
| RESOLVED_SPLIT (not in spec) | IMPLEMENTED (beyond spec) | Spec update needed |
| Batch deposits (not in spec) | IMPLEMENTED (beyond spec) | Spec update needed |
| Group signature (not in spec) | IMPLEMENTED (beyond spec) | Spec update needed |
| UUPS proxy (not in spec) | IMPLEMENTED (beyond spec) | Spec update needed |
| Chain ID 210425 | **CHANGED to 20250407** | Spec update needed |
| Relayer gas abstraction | IMPLEMENTED | - |
| Timeout auto-refund | IMPLEMENTED | - |
| Millisecond timestamps | IMPLEMENTED (not in spec) | Spec update needed |

### Recommendation
Implementation significantly exceeds the spec. RFC-010 needs a v2.0.0 update covering batch deposits, group signatures, UUPS proxy, RESOLVED_SPLIT, and PlatON ms timestamps.

---

## RFC-011 / NBSS: Buyer Skills Standard

### Spec Says
- `@nexus/buyer-skills` npm package
- 3 skills: `PreparePayment` → `ExecutePayment` → `TrackOrder`
- Genkit, LangChain, AutoGPT adapters
- Non-custodial design with `approvalCallback`

### Reality
- **Package does not exist**
- User agents interact with nexus-core via MCP tools (`nexus_orchestrate_payment`, `nexus_confirm_deposit`, `nexus_get_payment_status`) or REST API
- Checkout page handles MetaMask signing (browser-based, not SDK)
- No agent framework adapters

### Recommendation
Keep as future work. Current MCP tools + REST API serve the same purpose without an SDK wrapper. The "buyer skill" is effectively the `skill-user.md` document + REST endpoints.

---

## SYSTEM-OVERVIEW

### Outdated Items
| Item | Document Says | Reality |
|------|--------------|---------|
| Chain ID | 210425 | **20250407** |
| MVP architecture | Direct Settlement (ERC-20 transfer) | **Escrow Contract** (escrow is primary, no direct transfer) |
| `@nexus/buyer-skills` | Shown as existing | Does not exist |
| State machine | 6 states (Direct) / 12 states (Dual) | ~10 states (Escrow + group states) |
| Payment Router | DIRECT_TRANSFER \| ESCROW_CONTRACT | **ESCROW_CONTRACT only** |

### Recommendation
Rewrite SYSTEM-OVERVIEW to reflect current Escrow-only architecture with correct chain ID and state machine.

---

## Priority Actions

### HIGH (Spec-reality mismatch that can cause confusion)
1. **RFC-005v2** — Rewrite as v3 for Escrow model + groups + batch deposits
2. **RFC-010** — Update to v2 covering batch, group sig, RESOLVED_SPLIT, UUPS
3. **SYSTEM-OVERVIEW** — Update chain_id, architecture diagram, remove Direct Transfer as current

### MEDIUM (Should update but not blocking)
4. **RFC-002** — Mark `iso_metadata` as optional, document actual quote schema
5. **RFC-009** — Update event types for escrow model, add `payment.escrowed` (HMAC, retry, delivery logs already conformant)
6. **RFC-008** — Add Quick Setup section with MCP connection JSON (frontmatter already conformant)

### LOW (Future features, acceptable for MVP)
7. **RFC-001** — On-chain DID registry (Phase 2)
8. **RFC-003/004** — SDK extraction (`@nexus/agent-kit`, `@nexus/seller-sdk`)
9. **RFC-006** — Risk Gatekeeper (Phase 3)
10. **RFC-007** — Hub-Spoke cross-chain (Phase 3)
11. **RFC-011** — Buyer SDK (`@nexus/buyer-skills`)
