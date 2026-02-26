# NexusPay — Open Issues

## ISSUE-001: EIP-3009 "invalid signature" on PlatON Devnet USDC

**Status:** Open
**Priority:** High
**Date:** 2026-02-25
**Related commits:** `65715c93` (ms timestamp fix), `a99f664c` (wallet validation), `baa1a5e2` (debug logging)

### Symptom

`depositWithAuthorization` reverts with `"EIP3009: invalid signature"` when the relayer submits the user's EIP-3009 signature to the on-chain USDC contract (`0xFF8dEe9983768D0399673014cf77826896F97e4d`).

The error means `ecrecover(digest, v, r, s) != from` — the signature is structurally valid but the recovered signer doesn't match the expected `from` address.

### Error example

```
submitDeposit: retries exhausted — The contract function "depositWithAuthorization" reverted with:
  EIP3009: invalid signature
Args:
  from:        0x6c3103FFF34916Ef2df44CE952BcE610d7e23cB5
  merchant:    0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1
  amount:      300000
  validBefore: 1772087779659   (milliseconds — ms fix confirmed working)
  v: 27
```

### What has been ruled out

| Hypothesis | Status | Evidence |
|---|---|---|
| `validBefore` in wrong unit (sec vs ms) | FIXED in `65715c93` | Time check now passes; error changed from "expired" to "invalid signature" |
| Wrong DOMAIN_SEPARATOR | Ruled out | Manually computed matches on-chain `0x74e293...1804a` |
| Wrong TYPEHASH | Ruled out | Standard `TransferWithAuthorization` hash `0x7c7c6c...` found in bytecode |
| Wrong chainId | Ruled out | RPC returns 20250407, `eip712Domain()` confirms 20250407 |
| String vs BigInt encoding for uint256 fields | Ruled out | viem `hashTypedData` produces identical digest for both |
| Wrong MetaMask wallet connected | Possible | Added wallet validation in `a99f664c`, user reports signing with correct wallet |

### Current diagnostics in place

1. **Client-side** (browser console): logs exact EIP-712 params, field types, and signature components sent to MetaMask
2. **Server-side** (Render logs): recovers signer via `recoverAddress(hashTypedData(...), {v,r,s})` and logs comparison with expected `from`, plus full `depositParams` vs `signData` dump

### Remaining hypotheses

1. **MetaMask signs different data than viem computes** — MetaMask's internal EIP-712 encoder may differ subtly from viem's `hashTypedData` for this chain/contract. Need to compare browser console output with server log digest.
2. **PlatON-specific ECDSA quirk** — PlatON EVM may use a modified signature verification that differs from standard `ecrecover`. Need to test with a known private key signing off-chain and submitting.
3. **USDC FiatToken variant** — This PlatON USDC is a modified FiatToken with router fees and batch operations. Even though `routerFee()` returns 0, the `transferWithAuthorization` implementation may encode the struct hash differently (e.g., extra fields in the typehash).

### Next steps

1. Reproduce on checkout page, capture browser console + Render logs with the debug output
2. Compare server-side recovered signer vs expected — if they match, the issue is between our digest and the contract's digest; if they don't match, the issue is between MetaMask's signing and our expected data
3. Consider testing with a private key signing via viem's `signTypedData` (bypassing MetaMask) to isolate whether MetaMask is the variable
4. Consider decompiling the USDC implementation's `_transferWithAuthorization` to see the exact digest computation

### Files involved

- `src/nexus-core/src/checkout.ts` — checkout page + submit handler
- `src/nexus-core/src/services/instruction-builder.ts` — builds EIP-3009 sign data
- `src/nexus-core/src/services/relayer.ts` — submits deposit to escrow contract
- `src/nexus-core/src/server.ts` — MCP tool submit handler (alternative path)
- `src/contracts/src/NexusPayEscrow.sol` — escrow contract (passes through to USDC)

---

## ISSUE-002: NexusPayEscrow timeouts misconfigured for PlatON ms timestamps

**Status:** Open
**Priority:** Medium
**Date:** 2026-02-25

### Description

The deployed NexusPayEscrow contract at `0xC1aF5ea6e661cB815DB166549178314E6BCfc3CF` was deployed with:
- `defaultReleaseTimeout = 86400` (intended as 24 hours in seconds)
- `defaultDisputeWindow = 259200` (intended as 3 days in seconds)

Because PlatON EVM uses `block.timestamp` in **milliseconds**, these values when added to `block.timestamp` produce deadlines only ~86 seconds / ~259 seconds in the future.

### Fix required

Redeploy NexusPayEscrow with millisecond-scaled values:
- `defaultReleaseTimeout = 86_400_000` (24h in ms)
- `defaultDisputeWindow = 259_200_000` (3d in ms)

Or alternatively call the admin functions on the existing contract:
- `setDefaultReleaseTimeout(86400000)`
- `setDefaultDisputeWindow(259200000)`
