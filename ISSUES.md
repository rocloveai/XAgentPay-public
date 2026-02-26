# NexusPay — Open Issues

## ISSUE-001: EIP-3009 "invalid signature" on PlatON Devnet USDC

**Status:** FIXED
**Priority:** High
**Date:** 2026-02-25
**Updated:** 2026-02-26
**Related commits:** `65715c93`, `a99f664c`, `baa1a5e2`, `ce86cbde` (EIP712Domain fix + debug digest)

### Symptom

`batchDepositWithGroupApproval` reverts with `"EIP3009: invalid signature"` when the user submits the tx via MetaMask checkout. The USDC contract's `transferWithAuthorization` internally computes `ecrecover(digest, v, r, s)` and gets a different address than `from`.

### Root cause analysis (2026-02-26)

Thorough investigation confirmed:
- Server-side digest computation is **correct** (matches viem's `hashTypedData`)
- DOMAIN_SEPARATOR, TYPEHASH, and all field encodings verified
- Direct signing with a known private key + `transferWithAuthorization` succeeds
- MetaMask's signature recovers to `0x0c8656...` instead of expected `0x6c3103...`
- **Conclusion:** MetaMask's `eth_signTypedData_v4` computed a different digest

### Fixes applied (`ce86cbde`)

1. **Added explicit `EIP712Domain` type** to the `types` object in EIP-3009 sign data — eliminates ambiguity in MetaMask's auto-inference of the domain type
2. **Added browser-side EIP-712 digest computation** (`computeEIP712Digest()`) — logs expected domainSeparator, structHash, and digest to console before MetaMask signs
3. **Receipt verification** — checkout confirm now checks on-chain receipt (200/202/422), prevents marking failed txs as ESCROWED

### What has been ruled out

| Hypothesis | Status | Evidence |
|---|---|---|
| `validBefore` in wrong unit (sec vs ms) | FIXED in `65715c93` | Time check now passes |
| Wrong DOMAIN_SEPARATOR | Ruled out | Matches on-chain `0x74e293...1804a` |
| Wrong TYPEHASH | Ruled out | Standard `TransferWithAuthorization` hash `0x7c7c6c...` |
| Wrong chainId | Ruled out | RPC returns 20250407, `eip712Domain()` confirms |
| String vs BigInt encoding | Ruled out | viem `hashTypedData` identical for both |
| Server-side digest wrong | Ruled out | viem, manual, BigInt all produce `0x8bcb5e76...` |
| Missing `EIP712Domain` in types | **FIXED** in `ce86cbde` | Most likely root cause — MetaMask may infer domain type differently |

### Next steps

1. **Re-test** the checkout flow with the new `EIP712Domain` fix deployed
2. If still fails, compare browser console digest (from `computeEIP712Digest()`) with MetaMask's signed digest
3. Consider testing with Rabby or other EIP-712 wallets to isolate MetaMask-specific behavior

---

## ISSUE-002: NexusPayEscrow timeouts misconfigured for PlatON ms timestamps

**Status:** FIXED
**Priority:** Medium
**Date:** 2026-02-25
**Fixed:** 2026-02-26

### Resolution

v4.0.0 deployed via UUPS upgrade (`Upgrade.s.sol`) with correct millisecond values:
- `defaultReleaseTimeout = 86_400_000` (24h in ms)
- `defaultDisputeWindow = 259_200_000` (3d in ms)
- `arbitrationTimeout = 604_800_000` (7d in ms)

Proxy address (stable): `0xeB33a9C2b4c7D3F44Fd5514F90C355AF6bb79236`
Implementation: `0x2EF4dB5E0021d074286c36821Cc897d2605e542E`

---

## ISSUE-003: Contract source accidentally reverted to v3.0.0

**Status:** FIXED
**Date:** 2026-02-26

### Description

Commit `92a787b8` accidentally reverted `NexusPayEscrow.sol` from v4.0.0 (798 lines) to v3.0.0 (605 lines), losing `batchDepositWithGroupApproval`, `requireGroupSig`, and all audit fixes. On-chain contract was unaffected (still v4.0.0).

### Resolution

Restored from `git checkout 49214a1a -- src/contracts/src/NexusPayEscrow.sol` in commit `ce86cbde`. All 98 Solidity tests pass.
