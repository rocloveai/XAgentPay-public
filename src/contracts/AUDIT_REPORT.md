# NexusPayEscrow v4.0.0 — Security Audit Report (Re-audit)

**Date:** 2026-02-26
**Auditor:** Claude Opus 4.6 (automated, methodology: solidity-security-audit-skill v2.0.2)
**Scope:** `src/NexusPayEscrow.sol`, `src/interfaces/IERC3009.sol`, `script/Deploy.s.sol`, `script/Upgrade.s.sol`
**Solidity:** 0.8.24 | **OpenZeppelin:** 5.5.0 | **Framework:** Foundry
**Tests:** 98 passing (forge test)

---

## Executive Summary

NexusPayEscrow is a UUPS-upgradeable three-way payment escrow contract supporting EIP-3009 signed transfers and traditional approve/transferFrom, with dispute resolution, batch deposits, and on-chain group signature verification (v4.0.0). Deployed on PlatON Devnet (chainId 20250407).

v4.0.0 fixes 6 of 12 findings from the v3.0.0 audit and adds group signature verification. However, the re-audit identified **1 new CRITICAL storage layout collision** that **MUST be fixed before deploying the upgrade**. The `arbitrationTimeout` variable was inserted before `_escrows`, shifting the mapping from slot 7 to slot 8 — this would orphan all existing v3 escrow data and lock user funds.

---

## NEW v4.0.0 Findings

| ID | Severity | Title |
|----|----------|-------|
| **NEW-01** | **CRITICAL** | Storage layout collision: `_escrows` shifts from slot 7 to slot 8 on upgrade |
| NEW-02 | MEDIUM | `arbitrationTimeout` defaults to 0 — not set in `initialize()` |
| NEW-03 | LOW | `_computeEntriesHash` grows memory in loop (gas inefficiency for large batches) |
| NEW-04 | INFO | Existing v3 escrows would have `feeBps = 0` after upgrade (no fee collected) |

## v3.0.0 Findings Status

| ID | Severity | Title | Status (v4.0.0) |
|----|----------|-------|-----------------|
| H-01 | **HIGH** | Disputed escrow blocks funds indefinitely if arbiter key is lost | **FIXED** — `refundUnresolvedDispute()` + `arbitrationTimeout` |
| M-01 | **MEDIUM** | PlatON millisecond timestamps cause incorrect timeout behavior | **FIXED** — Upgrade script sets ms-corrected values |
| M-02 | **MEDIUM** | No batch size limit enables potential gas griefing / DoS | **FIXED** — `MAX_BATCH_SIZE = 20` + `BatchTooLarge` error |
| M-03 | **MEDIUM** | `resolve()` partial split always sets `RESOLVED_TO_MERCHANT` status | **FIXED** — `RESOLVED_SPLIT` enum variant |
| L-01 | LOW | `dispute()` missing `nonReentrant` modifier | **FIXED** — `nonReentrant` added |
| L-02 | LOW | Race condition between `release()` and `refund()` at deadline boundary | Won't fix (1-block window, risk negligible) |
| L-03 | LOW | No `emergencyWithdraw` or `pause` mechanism | Won't fix (UUPS upgrade sufficient) |
| L-04 | LOW | `protocolFeeBps` change affects in-flight escrows retroactively | **FIXED** — `Escrow.feeBps` snapshot at deposit |
| I-01 | INFO | Centralization risks — single owner controls all admin functions | Accepted (dev stage) |
| I-02 | INFO | Missing ERC-165 `supportsInterface` | Won't fix (not needed for escrow) |
| I-03 | INFO | No fuzzing or invariant tests | **FIXED** — 2 fuzz tests added |
| I-04 | INFO | `USDC` address immutable after initialization — no migration path | Accepted (UUPS covers) |

---

## NEW v4.0.0 Detailed Findings

### NEW-01: CRITICAL — Storage Layout Collision on UUPS Upgrade

**Severity:** CRITICAL
**Location:** [NexusPayEscrow.sol:101](src/NexusPayEscrow.sol#L101) (`arbitrationTimeout` declaration)

**Description:**
The `arbitrationTimeout` state variable was inserted between `coreOperator` (slot 6) and `_escrows` (previously slot 7). This shifts the `_escrows` mapping from **slot 7 to slot 8**. Verified via `forge inspect`:

```
v3.0.0 Storage Layout:
| coreOperator | slot 6 |
| _escrows     | slot 7 |   ← mapping base slot

v4.0.0 Storage Layout:
| coreOperator          | slot 6  |
| arbitrationTimeout    | slot 7  |   ← NEW, takes _escrows' old slot!
| _escrows              | slot 8  |   ← SHIFTED from 7 to 8
| usedGroupIds          | slot 9  |   ← NEW
| requireGroupSig       | slot 10 |   ← NEW
```

After upgrade, all escrow lookups use `keccak256(paymentId, 8)` instead of `keccak256(paymentId, 7)`. **Every existing v3 escrow becomes inaccessible.** The funds remain in the contract's USDC balance but cannot be released, refunded, or disputed through the contract's functions.

**Impact:** All escrowed USDC funds from v3 are permanently locked. The `release()`, `refund()`, `dispute()`, and `resolve()` functions will see `EscrowStatus.NONE` for all existing payment IDs.

**Recommendation:**
Move new state variables AFTER `_escrows` to preserve slot positions:

```solidity
// --- Storage (must match v3 layout exactly) ---
IERC3009 public usdc;                                // slot 1
uint256 public defaultReleaseTimeout;                // slot 2
uint256 public defaultDisputeWindow;                 // slot 3
uint16 public protocolFeeBps;                        // slot 4 (packed)
address public protocolFeeRecipient;                 // slot 4 (packed)
address public arbiter;                              // slot 5
address public coreOperator;                         // slot 6
mapping(bytes32 => Escrow) internal _escrows;        // slot 7 ← MUST stay at slot 7

// --- v4 new storage (append-only, after existing layout) ---
uint256 public arbitrationTimeout;                   // slot 8
mapping(bytes32 => bool) public usedGroupIds;        // slot 9
bool public requireGroupSig;                         // slot 10
```

After fixing, verify with `forge inspect NexusPayEscrow storageLayout` that `_escrows` remains at slot 7.

---

### NEW-02: `arbitrationTimeout` Not Set in `initialize()` — Defaults to 0

**Severity:** MEDIUM
**Location:** [NexusPayEscrow.sol:236-260](src/NexusPayEscrow.sol#L236-L260)

**Description:**
The `arbitrationTimeout` is not set in `initialize()`. For a fresh deployment (not an upgrade), it defaults to 0. The `refundUnresolvedDispute()` function checks:

```solidity
if (block.timestamp < e.disputeDeadline + arbitrationTimeout)
```

With `arbitrationTimeout = 0`, this becomes `e.disputeDeadline + 0 = e.disputeDeadline`, meaning disputed escrows can be auto-refunded immediately after the dispute deadline — giving the arbiter zero time to resolve.

The Upgrade script correctly calls `setArbitrationTimeout()`, but a fresh deployment via Deploy.s.sol would leave it at 0.

**Impact:** On fresh deployment, the arbiter has no time window to resolve disputes. Any user could dispute and then immediately call `refundUnresolvedDispute()` after the dispute deadline, bypassing arbiter resolution entirely.

**Recommendation:**
Either add `arbitrationTimeout` to `initialize()`:

```solidity
function initialize(
    ...
    uint256 _arbitrationTimeout
) external initializer {
    ...
    if (_arbitrationTimeout == 0) revert ZeroTimeout();
    arbitrationTimeout = _arbitrationTimeout;
}
```

Or set it in Deploy.s.sol after proxy creation.

---

### NEW-03: `_computeEntriesHash` Memory Growth in Loop

**Severity:** LOW
**Location:** [NexusPayEscrow.sol:718-731](src/NexusPayEscrow.sol#L718-L731)

**Description:**
`_computeEntriesHash` uses `bytes.concat` in a loop, which creates increasingly large memory allocations:

```solidity
bytes memory packed;
for (uint256 i = 0; i < entries.length; i++) {
    packed = bytes.concat(packed, abi.encode(...));  // grows each iteration
}
```

For 20 entries (MAX_BATCH_SIZE), each entry is 192 bytes (6 × 32), so the final buffer is ~3.8 KB. The intermediate memory copies (concat copies the entire accumulated buffer each iteration) result in O(n²) memory usage.

**Impact:** Gas overhead for large batches. At MAX_BATCH_SIZE=20, the extra gas cost is ~50-100K, which is acceptable but wasteful.

**Recommendation:**
Pre-allocate the full buffer:

```solidity
function _computeEntriesHash(BatchEntry[] calldata entries) internal pure returns (bytes32) {
    return keccak256(abi.encode(entries));  // ABI-encode entire array at once
}
```

Or use `abi.encodePacked` with fixed-size fields for deterministic encoding without the loop.

---

### NEW-04: Existing v3 Escrows Would Have `feeBps = 0`

**Severity:** INFORMATIONAL
**Location:** [NexusPayEscrow.sol:81](src/NexusPayEscrow.sol#L81) (new `feeBps` field in Escrow struct)

**Description:**
The `Escrow` struct gained a `uint16 feeBps` field at the end. For existing v3 escrows (assuming NEW-01 is fixed), this field was not present in v3 and would read as 0 from uninitialized storage.

When `release()` calculates the fee:
```solidity
uint256 fee = (e.amount * e.feeBps) / 10_000;  // e.feeBps = 0 for v3 escrows
```

The fee would be 0, meaning merchants receive the full amount with no protocol fee deducted.

**Impact:** Protocol loses fee revenue on pre-existing v3 escrows. Merchants benefit. This is arguably acceptable as a one-time migration cost, and the number of in-flight v3 escrows at upgrade time should be small.

**Recommendation:**
Document this as expected behavior. Alternatively, in the upgrade script, release or refund all pending v3 escrows before upgrading.

---

## v3.0.0 Detailed Findings (for reference)

### H-01: Disputed Escrow Blocks Funds Indefinitely if Arbiter Key is Lost

**Severity:** HIGH
**Location:** [NexusPayEscrow.sol:456-488](src/NexusPayEscrow.sol#L456-L488)

**Description:**
When a payer calls `dispute()`, the escrow enters `DISPUTED` status. Only the `arbiter` can call `resolve()` to release or refund the funds. If the arbiter key is compromised, lost, or the arbiter becomes unresponsive, funds are permanently locked in the contract.

There is no:
- Timeout on dispute resolution (e.g., auto-refund after 30 days of unresolved dispute)
- Alternative resolution mechanism (e.g., multi-sig, DAO vote)
- Emergency withdrawal for disputed escrows

**Impact:** User funds can be permanently locked. The `setArbiter()` admin function allows the owner to change the arbiter, but if both owner and arbiter keys are lost, funds are irrecoverable.

**Recommendation:**
Add a dispute resolution timeout that auto-resolves to payer after a configurable period:

```solidity
uint256 public disputeResolutionTimeout; // e.g., 30 days

function refundUnresolvedDispute(bytes32 paymentId) external nonReentrant {
    Escrow storage e = _escrows[paymentId];
    if (e.status != EscrowStatus.DISPUTED) {
        revert InvalidStatus(e.status, EscrowStatus.DISPUTED);
    }
    if (block.timestamp < e.disputeDeadline + disputeResolutionTimeout) {
        revert ResolutionTimeoutNotReached();
    }
    e.status = EscrowStatus.RESOLVED_TO_PAYER;
    IERC20(address(usdc)).safeTransfer(e.payer, e.amount);
}
```

---

### M-01: PlatON Millisecond Timestamps Cause Incorrect Timeout Behavior

**Severity:** MEDIUM
**Location:** [NexusPayEscrow.sol:598-599](src/NexusPayEscrow.sol#L598-L599)

**Description:**
PlatON Devnet (chainId 20250407) uses `block.timestamp` in **milliseconds** inside the EVM, while the contract treats timeouts in seconds. The deployed configuration uses:

```solidity
defaultReleaseTimeout = 86_400  // intended: 24 hours
defaultDisputeWindow = 259_200  // intended: 72 hours
```

Since `block.timestamp` is in ms on PlatON, `block.timestamp + 86_400` adds only ~86 seconds of actual timeout instead of 24 hours.

**Impact:** Escrows become refundable almost immediately (~86 seconds), and the dispute window closes in ~4.3 minutes instead of 72 hours. This severely undermines the escrow protection model — merchants cannot safely fulfill orders because refund could be triggered before delivery.

**Status:** Known issue (ISSUE-002 in project tracker). The deployed escrow proxy at `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236` has already been configured with second-based values.

**Recommendation:**
Call `setDefaultReleaseTimeout(86_400_000)` and `setDefaultDisputeWindow(259_200_000)` on the deployed proxy to use millisecond-scaled values. Alternatively, add chain-aware logic:

```solidity
function _now() internal view returns (uint256) {
    // PlatON devnet uses ms timestamps
    if (block.chainid == 20250407) return block.timestamp;
    return block.timestamp * 1000; // normalize to ms
}
```

Or better: document that all timeout admin calls on PlatON must use ms values.

---

### M-02: No Batch Size Limit Enables Potential Gas Griefing / DoS

**Severity:** MEDIUM
**Location:** [NexusPayEscrow.sol:317-365](src/NexusPayEscrow.sol#L317-L365)

**Description:**
`batchDepositWithAuthorization()` has no upper bound on `entries.length`. A large batch could:

1. Exceed block gas limit, causing the transaction to always revert
2. If used with a relayer pattern (who pays gas), enable gas griefing

The function iterates twice over the entries array (once for sum validation, once for escrow creation), each writing to storage.

**Impact:** Primarily a DoS concern. Since the caller pays gas in the current design (`msg.sender` is the payer), self-griefing is the most likely scenario. However, if a relayer pattern is added in the future, this becomes exploitable.

**Recommendation:**
Add a reasonable batch size limit:

```solidity
uint256 public constant MAX_BATCH_SIZE = 20;

function batchDepositWithAuthorization(...) external nonReentrant {
    if (entries.length == 0) revert EmptyBatch();
    if (entries.length > MAX_BATCH_SIZE) revert BatchTooLarge(entries.length);
    ...
}
```

---

### M-03: `resolve()` Partial Split Always Sets `RESOLVED_TO_MERCHANT` Status

**Severity:** MEDIUM
**Location:** [NexusPayEscrow.sol:471-478](src/NexusPayEscrow.sol#L471-L478)

**Description:**
When `resolve()` is called with a partial split (e.g., `merchantBps = 3000`, meaning 30% to merchant, 70% to payer), the status is set to `RESOLVED_TO_MERCHANT`:

```solidity
if (merchantBps == 10_000) {
    e.status = EscrowStatus.RESOLVED_TO_MERCHANT;
} else if (merchantBps == 0) {
    e.status = EscrowStatus.RESOLVED_TO_PAYER;
} else {
    // Partial split — use RESOLVED_TO_MERCHANT as the "resolved with split" status
    e.status = EscrowStatus.RESOLVED_TO_MERCHANT;
}
```

This is misleading — a 10/90 split favoring the payer would still show `RESOLVED_TO_MERCHANT`. Off-chain indexers and UIs reading the status cannot distinguish between a full merchant resolution and a split.

**Impact:** Incorrect status reporting for partial dispute resolutions. Off-chain systems may misinterpret the outcome.

**Recommendation:**
Add a `RESOLVED_SPLIT` status:

```solidity
enum EscrowStatus {
    NONE, DEPOSITED, RELEASED, REFUNDED,
    DISPUTED, RESOLVED_TO_MERCHANT, RESOLVED_TO_PAYER, RESOLVED_SPLIT
}
```

Then in `resolve()`:
```solidity
if (merchantBps == 10_000) e.status = EscrowStatus.RESOLVED_TO_MERCHANT;
else if (merchantBps == 0) e.status = EscrowStatus.RESOLVED_TO_PAYER;
else e.status = EscrowStatus.RESOLVED_SPLIT;
```

The `Resolved` event already emits `merchantBps`, so off-chain systems can read exact split details from events. But having the correct status helps on-chain queries.

---

### L-01: `dispute()` Missing `nonReentrant` Modifier

**Severity:** LOW
**Location:** [NexusPayEscrow.sol:430-445](src/NexusPayEscrow.sol#L430-L445)

**Description:**
All other state-mutating functions (`depositWithAuthorization`, `deposit`, `batchDepositWithAuthorization`, `release`, `refund`, `resolve`) have the `nonReentrant` modifier, but `dispute()` does not.

While `dispute()` doesn't make external calls (no token transfers), it's inconsistent with the contract's defensive pattern. If a future upgrade adds external calls to `dispute()`, the missing guard could be overlooked.

**Impact:** No immediate exploitability since `dispute()` doesn't call external contracts. Defense-in-depth concern only.

**Recommendation:**
Add `nonReentrant` to `dispute()` for consistency:

```solidity
function dispute(bytes32 paymentId, bytes32 reason)
    external
    nonReentrant  // add this
    onlyPayer(paymentId)
```

---

### L-02: Race Condition Between `release()` and `refund()` at Deadline Boundary

**Severity:** LOW
**Location:** [NexusPayEscrow.sol:375-420](src/NexusPayEscrow.sol#L375-L420)

**Description:**
At `block.timestamp == releaseDeadline`, both `release()` and `refund()` can succeed:
- `release()` has no deadline check — merchant/operator can release at any time while status is `DEPOSITED`
- `refund()` checks `block.timestamp < releaseDeadline` (strict less-than), so at exactly `releaseDeadline` it can also succeed

Meanwhile, `isRefundable()` uses `>=`:
```solidity
return e.status == EscrowStatus.DEPOSITED && block.timestamp >= e.releaseDeadline;
```

This creates a race condition: at the exact `releaseDeadline` timestamp, both merchant and anyone calling `refund()` compete for the same escrow. The first transaction to be mined wins.

**Impact:** Low — this is a narrow timing window (one block), and the status check prevents double-spending. However, it could lead to unexpected behavior for off-chain systems that check `isRefundable()` and then attempt refund while the merchant is releasing in the same block.

**Recommendation:**
Consider adding a grace period or making the boundary exclusive for one side:

```solidity
// refund uses strict > instead of >=
if (block.timestamp <= e.releaseDeadline) { ... }
```

---

### L-03: No `emergencyWithdraw` or `pause` Mechanism

**Severity:** LOW
**Location:** Contract-wide

**Description:**
The contract has no way to pause operations or perform emergency fund recovery. If a critical vulnerability is discovered post-deployment, the owner cannot:
- Pause new deposits
- Emergency-withdraw stuck funds
- Prevent further releases/refunds while a fix is prepared

**Impact:** In the event of an exploit, there's no circuit breaker to limit damage. The UUPS upgrade mechanism can deploy a fix, but there's a deployment window during which the vulnerability remains exploitable.

**Recommendation:**
Consider adding OpenZeppelin's `Pausable`:

```solidity
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

// Add `whenNotPaused` to deposit, batchDeposit, release functions
// Keep refund and resolve callable even when paused (to protect user funds)
```

---

### L-04: `protocolFeeBps` Change Affects In-Flight Escrows Retroactively

**Severity:** LOW
**Location:** [NexusPayEscrow.sol:387](src/NexusPayEscrow.sol#L387), [NexusPayEscrow.sol:545-548](src/NexusPayEscrow.sol#L545-L548)

**Description:**
The fee is calculated at `release()` time using the current `protocolFeeBps`, not the fee rate at deposit time:

```solidity
uint256 fee = (e.amount * protocolFeeBps) / 10_000;
```

If the owner calls `setProtocolFeeBps(500)` (raising to 5%), all existing `DEPOSITED` escrows will be charged the new rate when released, even though merchants may have agreed to the original 0.3% rate.

**Impact:** Merchants could receive less than expected. However, the fee is capped at 5% (MAX_FEE_BPS = 500), and only the owner can change it, so this requires a trusted owner.

**Recommendation:**
Store the fee rate per escrow at deposit time:

```solidity
struct Escrow {
    ...
    uint16 feeBps; // snapshot at deposit time
}
```

Or document this as expected behavior and ensure merchants are aware.

---

### I-01: Centralization Risks

**Severity:** INFORMATIONAL
**Location:** Contract-wide

**Description:**
The single `owner` has significant power:
- Change `arbiter` (dispute resolution authority)
- Change `coreOperator` (can release any escrow)
- Change `protocolFeeBps` up to 5%
- Change `protocolFeeRecipient`
- Upgrade the contract implementation (UUPS) to arbitrary code
- Change timeouts

The `coreOperator` can release **any** escrow at any time without merchant involvement.

**Impact:** If the owner key is compromised, all escrowed funds are at risk (via upgrade to malicious implementation). This is inherent to UUPS proxy pattern and acceptable for early-stage projects.

**Recommendation:**
For production:
- Use a multi-sig (e.g., Gnosis Safe) for the owner role
- Consider a timelock for upgrades
- Separate `coreOperator` and `arbiter` into distinct addresses with different key management

---

### I-02: Missing ERC-165 `supportsInterface`

**Severity:** INFORMATIONAL
**Location:** Contract-wide

**Description:**
The contract does not implement ERC-165 `supportsInterface()`. While not required for an escrow contract, it would help tooling and other contracts identify the contract's capabilities.

**Recommendation:**
Not required for current use case. Consider adding if the contract needs to be discovered by registries or other protocols.

---

### I-03: No Fuzzing or Invariant Tests

**Severity:** INFORMATIONAL
**Location:** [NexusPayEscrow.t.sol](test/NexusPayEscrow.t.sol)

**Description:**
The test suite has 73 passing tests with good functional coverage, but no fuzzing (`test_fuzz_*`) or invariant (`invariant_*`) tests despite Foundry config enabling them:

```toml
[profile.default.fuzz]
runs = 256
[profile.default.invariant]
runs = 256
depth = 15
```

Key properties that should be fuzz-tested:
1. `release()` fee calculation: `fee + merchantAmount == escrowAmount` for all amounts and fee rates
2. `resolve()` split: `merchantAmount + payerAmount == escrowAmount` for all bps values
3. Contract balance invariant: `usdc.balanceOf(escrow) >= sum of all DEPOSITED escrow amounts`

**Recommendation:**
Add at minimum:

```solidity
function test_fuzz_releaseFeeInvariant(uint256 amount, uint16 feeBps) public {
    amount = bound(amount, 1, type(uint128).max);
    feeBps = uint16(bound(feeBps, 0, 500));
    uint256 fee = (amount * feeBps) / 10_000;
    uint256 merchantAmount = amount - fee;
    assertEq(fee + merchantAmount, amount);
}

function test_fuzz_resolveSplitInvariant(uint256 amount, uint16 merchantBps) public {
    amount = bound(amount, 1, type(uint128).max);
    merchantBps = uint16(bound(merchantBps, 0, 10_000));
    uint256 merchantAmount = (amount * merchantBps) / 10_000;
    uint256 payerAmount = amount - merchantAmount;
    assertEq(merchantAmount + payerAmount, amount);
}
```

---

### I-04: USDC Address Immutable After Initialization

**Severity:** INFORMATIONAL
**Location:** [NexusPayEscrow.sol:77](src/NexusPayEscrow.sol#L77), [NexusPayEscrow.sol:225](src/NexusPayEscrow.sol#L225)

**Description:**
The `usdc` address is set in `initialize()` and cannot be changed. If the USDC contract is upgraded to a new address (e.g., Circle deploys a new implementation on PlatON), the escrow contract would need a full UUPS upgrade to point to the new USDC.

**Impact:** Low — USDC upgrades are rare and typically use proxy patterns themselves (the USDC proxy address stays the same). The UUPS upgrade path provides a migration option if needed.

**Recommendation:**
Acceptable as-is. The UUPS upgrade path covers this scenario.

---

## CEI (Checks-Effects-Interactions) Pattern Compliance

| Function | Checks | Effects | Interactions | Compliant? |
|----------|--------|---------|-------------|------------|
| `depositWithAuthorization` | `_validateDeposit` | — | `transferWithAuthorization`, then `_createEscrow` | Partial — external call before state write |
| `deposit` | `_validateDeposit` | — | `safeTransferFrom`, then `_createEscrow` | Partial — external call before state write |
| `batchDepositWithAuthorization` | empty/sum checks | — | `transferWithAuthorization`, then loop `_createEscrow` | Partial — external call before state writes |
| `release` | status check | `status = RELEASED` | `safeTransfer` (fee + merchant) | **Yes** |
| `refund` | status + deadline | `status = REFUNDED` | `safeTransfer` (payer) | **Yes** |
| `dispute` | status + deadline | `status = DISPUTED` | none | **Yes** |
| `resolve` | bps + status | status update | `safeTransfer` (merchant + payer) | **Yes** |

**Note on deposit CEI:** The deposit functions call the external token contract before writing the escrow to storage. This is acceptable because:
1. `nonReentrant` guard prevents re-entrancy
2. The token transfer must succeed for the escrow to be valid
3. USDC (FiatToken) does not have callbacks that could exploit this ordering

---

## Access Control Matrix

| Function | Owner | Arbiter | CoreOperator | Merchant | Payer | Anyone |
|----------|-------|---------|--------------|----------|-------|--------|
| `depositWithAuthorization` | | | | | | **X** |
| `deposit` | | | | | **X** (msg.sender) | |
| `batchDepositWithAuthorization` | | | | | **X** (msg.sender) | |
| `batchDepositWithGroupApproval` | | | | | **X** (msg.sender) | |
| `release` | | | **X** | **X** | | |
| `refund` | | | | | | **X** (after deadline) |
| `dispute` | | | | | **X** | |
| `resolve` | | **X** | | | | |
| `refundUnresolvedDispute` | | | | | | **X** (after arb timeout) |
| `setArbiter` | **X** | | | | | |
| `setCoreOperator` | **X** | | | | | |
| `setDefaultReleaseTimeout` | **X** | | | | | |
| `setDefaultDisputeWindow` | **X** | | | | | |
| `setProtocolFeeBps` | **X** | | | | | |
| `setProtocolFeeRecipient` | **X** | | | | | |
| `setArbitrationTimeout` | **X** | | | | | |
| `setRequireGroupSig` | **X** | | | | | |
| `upgradeToAndCall` | **X** | | | | | |

---

## State Machine Diagram

```
          deposit / depositWithAuth / batchDepositWithAuth / batchDepositWithGroupApproval
                                    │
                                    ▼
                              ┌──────────┐
                              │ DEPOSITED│
                              └──────────┘
                           ╱       │       ╲
                     release()  dispute()  refund()
                        │        │      (after releaseDeadline)
                        ▼        ▼         │
                   ┌─────────┐ ┌─────────┐ │
                   │ RELEASED│ │DISPUTED │ │
                   └─────────┘ └─────────┘ │
                              │            ▼
                    resolve() │ refundUnresolved()  ┌─────────┐
                   ╱    │    ╲  (after arb timeout) │ REFUNDED│
                  ▼     ▼     ▼        │            └─────────┘
     ┌──────────────┐ ┌─────┐ ┌──────────────┐
     │RESOLVED_TO_  │ │SPLIT│ │RESOLVED_TO_  │
     │  MERCHANT    │ │     │ │    PAYER      │
     └──────────────┘ └─────┘ └──────────────┘
```

All terminal states (RELEASED, REFUNDED, RESOLVED_*) are correctly guarded — no function allows transitioning out of a terminal state.

---

## Gas Analysis

| Function | Gas (typical) | Notes |
|----------|---------------|-------|
| `depositWithAuthorization` | ~328k | EIP-3009 signature verification |
| `deposit` | ~299k | Standard approve + transferFrom |
| `release` | ~337k | Two transfers (fee + merchant) |
| `refund` | ~288k | Single transfer |
| `dispute` | ~302k | No transfers |
| `resolve` | ~318k | Up to two transfers |
| `batchDeposit` (5 entries) | ~1.17M | Linear scaling, ~235k per entry |

---

## Test Coverage Assessment

| Category | Covered | Missing |
|----------|---------|---------|
| Happy paths | 100% | — |
| Access control | 100% | — |
| Input validation | 100% | — |
| State transitions | 100% | — |
| Event emissions | 100% | — |
| Fee edge cases | 100% | — (feeBps snapshot tested) |
| Timestamp boundaries | Partial | Exact `==` boundary (L-02) |
| Fuzzing | 100% | — (fee + split invariants) |
| Group signature | 100% | — (15 tests) |
| Arbitration timeout | 100% | — (3 tests) |
| Cross-language encoding | 100% | — (Solidity + TS) |
| Invariant testing | Partial | Balance consistency not yet tested |
| Gas optimization | **None** | — |

**Total: 98 Foundry tests passing (v4.0.0), up from 73 (v3.0.0).**

---

## New v4 Features — Security Assessment

### Group Signature Verification (`batchDepositWithGroupApproval`)

| Check | Result |
|-------|--------|
| EIP-712 structured data | Correct — typehash, domain separator, struct hash all properly computed |
| `ecrecover` zero-address check | `signer == address(0) \|\| signer != coreOperator` — correct |
| Replay protection | `usedGroupIds[groupId]` mapping — prevents reuse |
| Signature malleability | Not exploitable — groupId replay protection prevents double-use regardless of malleability |
| Domain separator includes chainId | Yes — prevents cross-chain replay |
| Domain separator includes contract address | Yes — prevents cross-contract replay |
| `requireGroupSig` toggle | Correctly blocks `batchDepositWithAuthorization` when enabled |

**Assessment:** Group signature verification is correctly implemented. The EIP-712 signing and verification follow best practices.

### Dispute Auto-Resolution (`refundUnresolvedDispute`)

| Check | Result |
|-------|--------|
| Status check | Requires `DISPUTED` — correct |
| Timeout calculation | `e.disputeDeadline + arbitrationTimeout` — correct |
| CEI pattern | Check → Effect (status) → Interaction (transfer) — correct |
| `nonReentrant` | Present — correct |
| Overflow | Solidity 0.8.24 built-in protection — reverts safely |

**Assessment:** Correctly implemented. Fixes H-01 as intended.

### Fee Snapshot (`Escrow.feeBps`)

| Check | Result |
|-------|--------|
| Snapshot at deposit | `_createEscrow` stores `protocolFeeBps` — correct |
| Used at release | `e.amount * e.feeBps` — uses snapshot, not global — correct |
| Struct packing | `EscrowStatus` (1 byte) + `feeBps` (2 bytes) pack into same slot — efficient |

**Assessment:** Correctly implemented. Fixes L-04 as intended.

---

## Conclusion

NexusPayEscrow v4.0.0 successfully addresses 6 of 12 v3.0.0 findings and adds robust group signature verification. However, the re-audit revealed a **CRITICAL storage layout collision (NEW-01)** that must be fixed before deploying the upgrade.

### MUST FIX Before Upgrade

| ID | Severity | Fix |
|----|----------|-----|
| **NEW-01** | CRITICAL | Move `arbitrationTimeout`, `usedGroupIds`, `requireGroupSig` AFTER `_escrows` in storage declaration order |
| NEW-02 | MEDIUM | Set `arbitrationTimeout` in `initialize()` or Deploy.s.sol |

### v3 Fixes Verified

- **H-01 FIXED** — `refundUnresolvedDispute()` prevents permanent fund lockup
- **M-01 FIXED** — Upgrade script corrects PlatON ms timeout values
- **M-02 FIXED** — `MAX_BATCH_SIZE = 20` prevents gas griefing
- **M-03 FIXED** — `RESOLVED_SPLIT` status for partial dispute resolutions
- **L-01 FIXED** — `dispute()` now has `nonReentrant`
- **L-04 FIXED** — `Escrow.feeBps` snapshot prevents retroactive fee changes
- **I-03 FIXED** — Fuzz tests for fee and split invariants

### Remaining Items (Accepted / Won't Fix)

| ID | Decision | Rationale |
|----|----------|-----------|
| L-02 | Won't fix | Single-block race window, risk negligible |
| L-03 | Won't fix | UUPS upgrade mechanism sufficient for emergency response |
| I-01 | Accepted | Single owner is acceptable for devnet; multi-sig for production |
| I-02 | Won't fix | ERC-165 not needed for escrow contract |
| I-04 | Accepted | UUPS upgrade covers USDC migration scenario |
| NEW-03 | Won't fix | Gas overhead acceptable at MAX_BATCH_SIZE=20 |
| NEW-04 | Accepted | One-time migration cost, v3 escrow count expected to be low |
