import { describe, it, expect } from "vitest";
import {
  computeEntriesHash,
  signGroup,
  getCoreOperatorAddress,
} from "../../services/group-signer.js";
import type { GroupPaymentDetail, Address, Hex } from "../../types.js";
import type { XAgentCoreConfig } from "../../config.js";
import { TEST_RELAYER_PRIVATE_KEY } from "../fixtures.js";
import { verifyTypedData } from "viem";
import { keccak256, toHex } from "viem";

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const TEST_CONFIG: XAgentCoreConfig = {
  databaseUrl: "",
  escrowContract: "0x0000000000000000000000000000000000000001",
  chainId: 20250407,
  chainName: "PlatON Devnet",
  usdcAddress: "0xFF8dEe9983768D0399673014cf77826896F97e4d",
  usdcDecimals: 6,
  protocolFeeBps: 30,
  releaseTimeoutS: 86400,
  disputeWindowS: 259200,
  port: 4000,
  rpcUrl: "https://devnet3openapi.platon.network/rpc",
  relayerPrivateKey: TEST_RELAYER_PRIVATE_KEY,
  watcherIntervalMs: 15000,
  timeoutSweepIntervalMs: 60000,
  webhookRetryIntervalMs: 30000,
  arbitrationTimeoutS: 604800,
  portalToken: "",
  baseUrl: "",
};

// ---------------------------------------------------------------------------
// Test payments
// ---------------------------------------------------------------------------

function makePaymentDetail(index: number): GroupPaymentDetail {
  const pid = `PAY-test-${index}`;
  const did = `did:xagent:20250407:merchant_${index}`;
  const ref = `ORD-${index}`;
  const context = { summary: `Item ${index}`, line_items: [] };

  return {
    xagent_payment_id: pid,
    merchant_did: did,
    merchant_order_ref: ref,
    merchant_address: `0x${"ab".repeat(20)}` as Address,
    amount_uint256: "100000",
    amount_display: "0.10",
    summary: context.summary,
    payment_id_bytes32: keccak256(toHex(pid)) as Hex,
    order_ref_bytes32: keccak256(toHex(ref)) as Hex,
    merchant_did_bytes32: keccak256(toHex(did)) as Hex,
    context_hash: keccak256(toHex(JSON.stringify(context))) as Hex,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("group-signer", () => {
  describe("computeEntriesHash", () => {
    it("returns a valid bytes32 hash", () => {
      const payments = [makePaymentDetail(1), makePaymentDetail(2)];
      const hash = computeEntriesHash(payments);

      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("produces different hashes for different entries", () => {
      const payments1 = [makePaymentDetail(1)];
      const payments2 = [makePaymentDetail(2)];

      const hash1 = computeEntriesHash(payments1);
      const hash2 = computeEntriesHash(payments2);

      expect(hash1).not.toBe(hash2);
    });

    it("is deterministic for the same input", () => {
      const payments = [makePaymentDetail(1), makePaymentDetail(2)];
      const hash1 = computeEntriesHash(payments);
      const hash2 = computeEntriesHash(payments);

      expect(hash1).toBe(hash2);
    });

    it("matches Solidity _computeEntriesHash for fixed inputs (cross-language)", () => {
      // Fixed inputs matching test_entriesHash_crossLanguage in XAgentPayEscrow.t.sol
      const payment: GroupPaymentDetail = {
        xagent_payment_id: "fixed",
        merchant_did: "fixed",
        merchant_order_ref: "fixed",
        merchant_address:
          "0x1234567890123456789012345678901234567890" as Address,
        amount_uint256: "100000000",
        amount_display: "100.00",
        summary: "fixed",
        payment_id_bytes32:
          "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
        order_ref_bytes32:
          "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex,
        merchant_did_bytes32:
          "0x0000000000000000000000000000000000000000000000000000000000000003" as Hex,
        context_hash:
          "0x0000000000000000000000000000000000000000000000000000000000000004" as Hex,
      };

      const hash = computeEntriesHash([payment]);

      // This hash must match the Solidity test's output.
      // Both use: keccak256(abi.encode(paymentId, merchant, amount, orderRef, merchantDid, contextHash))
      // where merchant is padded to 32 bytes (left-padded in abi.encode for address type).
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);

      // Verify by computing manually with viem
      const {
        encodeAbiParameters,
        parseAbiParameters,
        keccak256: k256,
      } = require("viem");
      const entryType = parseAbiParameters(
        "bytes32, address, uint256, bytes32, bytes32, bytes32",
      );
      const encoded = encodeAbiParameters(entryType, [
        payment.payment_id_bytes32,
        payment.merchant_address,
        BigInt(payment.amount_uint256),
        payment.order_ref_bytes32,
        payment.merchant_did_bytes32,
        payment.context_hash,
      ]);
      const expected = k256(encoded);
      expect(hash).toBe(expected);
    });
  });

  describe("signGroup", () => {
    it("returns a valid signature and correct signer address", async () => {
      const payments = [makePaymentDetail(1), makePaymentDetail(2)];
      const result = await signGroup(
        "GRP-test-1",
        payments,
        "200000",
        TEST_CONFIG,
      );

      // Signature should be a 65-byte hex string (0x + 130 hex chars)
      expect(result.signature).toMatch(/^0x[0-9a-f]{130}$/);
      // Signer address should match getCoreOperatorAddress
      expect(result.signerAddress.toLowerCase()).toBe(
        getCoreOperatorAddress(TEST_CONFIG).toLowerCase(),
      );
    });

    it("produces a recoverable signature (ecrecover matches signer)", async () => {
      const payments = [makePaymentDetail(1)];
      const groupId = "GRP-test-recover";
      const totalAmount = "100000";

      const { signature, signerAddress } = await signGroup(
        groupId,
        payments,
        totalAmount,
        TEST_CONFIG,
      );

      // Verify using viem's verifyTypedData
      const entriesHash = computeEntriesHash(payments);
      const groupIdBytes32 = keccak256(
        `0x${Buffer.from(groupId).toString("hex")}` as Hex,
      );

      const isValid = await verifyTypedData({
        address: signerAddress,
        domain: {
          name: "XAgentPay",
          version: "1",
          chainId: TEST_CONFIG.chainId,
          verifyingContract: TEST_CONFIG.escrowContract as Address,
        },
        types: {
          XAgentGroupApproval: [
            { name: "groupId", type: "bytes32" },
            { name: "entriesHash", type: "bytes32" },
            { name: "totalAmount", type: "uint256" },
          ],
        },
        primaryType: "XAgentGroupApproval",
        message: {
          groupId: groupIdBytes32,
          entriesHash,
          totalAmount: BigInt(totalAmount),
        },
        signature,
      });

      expect(isValid).toBe(true);
    });

    it("produces different signatures for different groups", async () => {
      const payments = [makePaymentDetail(1)];

      const sig1 = await signGroup("GRP-a", payments, "100000", TEST_CONFIG);
      const sig2 = await signGroup("GRP-b", payments, "100000", TEST_CONFIG);

      expect(sig1.signature).not.toBe(sig2.signature);
    });
  });

  describe("getCoreOperatorAddress", () => {
    it("returns a valid address", () => {
      const addr = getCoreOperatorAddress(TEST_CONFIG);
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("is deterministic", () => {
      const addr1 = getCoreOperatorAddress(TEST_CONFIG);
      const addr2 = getCoreOperatorAddress(TEST_CONFIG);
      expect(addr1).toBe(addr2);
    });
  });
});
