import { describe, it, expect } from "vitest";
import {
  buildDirectTransferInstruction,
  buildEscrowInstruction,
  buildGroupEscrowInstruction,
  buildBatchDepositInstruction,
} from "../../services/instruction-builder.js";
import {
  makeTestPayment,
  makeTestGroup,
  TEST_FLIGHT_MERCHANT,
  TEST_HOTEL_MERCHANT,
} from "../fixtures.js";
import type { NexusCoreConfig } from "../../config.js";

const TEST_CONFIG: NexusCoreConfig = {
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
  relayerPrivateKey: "",
  watcherIntervalMs: 15000,
  timeoutSweepIntervalMs: 60000,
  webhookRetryIntervalMs: 30000,
  arbitrationTimeoutS: 604800,
  portalToken: "",
};

describe("instruction-builder", () => {
  describe("buildDirectTransferInstruction", () => {
    it("builds a valid direct transfer instruction", () => {
      const payment = makeTestPayment({ amount: "100000" });
      const instr = buildDirectTransferInstruction(
        payment,
        TEST_FLIGHT_MERCHANT,
        TEST_CONFIG,
      );

      expect(instr.payment_method).toBe("DIRECT_TRANSFER");
      expect(instr.amount_uint256).toBe("100000");
      expect(instr.chain_id).toBe(20250407);
      expect(instr.nexus_payment_id).toBe(payment.nexus_payment_id);
      expect(instr.tx_data.to).toBe(TEST_CONFIG.usdcAddress);
      expect(instr.tx_data.data).toMatch(/^0x/);
    });
  });

  describe("buildEscrowInstruction", () => {
    it("builds a valid escrow instruction", () => {
      const payment = makeTestPayment({ amount: "100000" });
      const instr = buildEscrowInstruction(
        payment,
        TEST_FLIGHT_MERCHANT,
        TEST_CONFIG,
        "0x1234567890abcdef1234567890abcdef12345678",
      );

      expect(instr.payment_method).toBe("ESCROW_CONTRACT");
      expect(instr.amount_uint256).toBe("100000");
      expect(instr.escrow_contract).toBe(TEST_CONFIG.escrowContract);
      expect(instr.user_action).toBe("SIGN_EIP3009");
      expect(instr.gas_paid_by).toBe("RELAYER");
      expect(instr.eip3009_sign_data.message.from).toBe(
        "0x1234567890abcdef1234567890abcdef12345678",
      );
      expect(instr.eip3009_sign_data.message.to).toBe(
        TEST_CONFIG.escrowContract,
      );
      expect(instr.eip3009_sign_data.message.value).toBe("100000");
      // PlatON EVM uses ms timestamps — validBefore should be in milliseconds
      const vb = Number(instr.eip3009_sign_data.message.validBefore);
      expect(vb).toBeGreaterThan(1e12); // > 1 trillion = definitely milliseconds
    });
  });

  describe("buildGroupEscrowInstruction", () => {
    it("builds aggregated instruction for multi-merchant group", () => {
      const p1 = makeTestPayment({
        amount: "530000000",
        amount_display: "530.00",
        merchant_did: "did:nexus:20250407:demo_flight",
      });
      const p2 = makeTestPayment({
        amount: "100100000",
        amount_display: "100.10",
        merchant_did: "did:nexus:20250407:demo_hotel",
      });
      const group = makeTestGroup({
        total_amount: "630100000",
        total_amount_display: "630.10",
        payment_count: 2,
        payer_wallet: "0x1234567890abcdef1234567890abcdef12345678",
      });

      const instr = buildGroupEscrowInstruction(
        group,
        [p1, p2],
        [TEST_FLIGHT_MERCHANT, TEST_HOTEL_MERCHANT],
        TEST_CONFIG,
      );

      expect(instr.group_id).toBe(group.group_id);
      expect(instr.total_amount_uint256).toBe("630100000");
      expect(instr.payments).toHaveLength(2);
      expect(instr.payments[0].amount_uint256).toBe("530000000");
      expect(instr.payments[1].amount_uint256).toBe("100100000");
      expect(instr.eip3009_sign_data.message.value).toBe("630100000");
      expect(instr.eip3009_sign_data.message.from).toBe(group.payer_wallet);
      // PlatON EVM uses ms timestamps — validBefore should be in milliseconds
      const vb = Number(instr.eip3009_sign_data.message.validBefore);
      expect(vb).toBeGreaterThan(1e12);
    });

    it("includes precomputed bytes32 hash fields on payments", () => {
      const p1 = makeTestPayment({
        merchant_did: "did:nexus:20250407:demo_flight",
      });
      const group = makeTestGroup({ payment_count: 1 });

      const instr = buildGroupEscrowInstruction(
        group,
        [p1],
        [TEST_FLIGHT_MERCHANT],
        TEST_CONFIG,
      );

      const detail = instr.payments[0];
      expect(detail.payment_id_bytes32).toMatch(/^0x[0-9a-f]{64}$/);
      expect(detail.order_ref_bytes32).toMatch(/^0x[0-9a-f]{64}$/);
      expect(detail.merchant_did_bytes32).toMatch(/^0x[0-9a-f]{64}$/);
      expect(detail.context_hash).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe("buildBatchDepositInstruction", () => {
    it("builds a valid batch deposit instruction", () => {
      const p1 = makeTestPayment({
        amount: "100000",
        amount_display: "0.10",
        merchant_did: "did:nexus:20250407:demo_flight",
      });
      const p2 = makeTestPayment({
        amount: "200000",
        amount_display: "0.20",
        merchant_did: "did:nexus:20250407:demo_hotel",
      });
      const group = makeTestGroup({
        total_amount: "300000",
        total_amount_display: "0.30",
        payment_count: 2,
        payer_wallet: "0x1234567890abcdef1234567890abcdef12345678",
      });

      const instr = buildBatchDepositInstruction(
        group,
        [p1, p2],
        [TEST_FLIGHT_MERCHANT, TEST_HOTEL_MERCHANT],
        TEST_CONFIG,
      );

      expect(instr.group_id).toBe(group.group_id);
      expect(instr.payment_method).toBe("ESCROW_CONTRACT");
      expect(instr.user_action).toBe("SIGN_AND_SEND");
      expect(instr.gas_paid_by).toBe("USER");
      expect(instr.total_amount_uint256).toBe("300000");
      expect(instr.payments).toHaveLength(2);
      expect(instr.deposit_tx.to).toBe(TEST_CONFIG.escrowContract);
    });

    it("includes precomputed bytes32 hash fields on payments", () => {
      const p1 = makeTestPayment({
        merchant_did: "did:nexus:20250407:demo_flight",
      });
      const group = makeTestGroup({ payment_count: 1 });

      const instr = buildBatchDepositInstruction(
        group,
        [p1],
        [TEST_FLIGHT_MERCHANT],
        TEST_CONFIG,
      );

      const detail = instr.payments[0];
      expect(detail.payment_id_bytes32).toMatch(/^0x[0-9a-f]{64}$/);
      expect(detail.order_ref_bytes32).toMatch(/^0x[0-9a-f]{64}$/);
      expect(detail.merchant_did_bytes32).toMatch(/^0x[0-9a-f]{64}$/);
      expect(detail.context_hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("computes context_hash from full context JSON (not summary)", () => {
      const p1 = makeTestPayment({
        merchant_did: "did:nexus:20250407:demo_flight",
      });
      const group = makeTestGroup({ payment_count: 1 });

      const instr = buildBatchDepositInstruction(
        group,
        [p1],
        [TEST_FLIGHT_MERCHANT],
        TEST_CONFIG,
      );

      // context_hash should NOT equal keccak256(toHex(summary))
      // It should equal keccak256(toHex(JSON.stringify(context)))
      const { keccak256, toHex } = require("viem");
      const summaryHash = keccak256(toHex(p1.quote_payload.context.summary));
      const contextHash = keccak256(
        toHex(JSON.stringify(p1.quote_payload.context)),
      );

      expect(instr.payments[0].context_hash).toBe(contextHash);
      expect(instr.payments[0].context_hash).not.toBe(summaryHash);
    });

    it("does not include nexus_group_sig or core_operator_address", () => {
      const p1 = makeTestPayment({
        merchant_did: "did:nexus:20250407:demo_flight",
      });
      const group = makeTestGroup({ payment_count: 1 });

      const instr = buildBatchDepositInstruction(
        group,
        [p1],
        [TEST_FLIGHT_MERCHANT],
        TEST_CONFIG,
      );

      // The unsigned instruction should not have signature fields
      expect(instr).not.toHaveProperty("nexus_group_sig");
      expect(instr).not.toHaveProperty("core_operator_address");
    });
  });
});
