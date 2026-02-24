import { describe, it, expect } from "vitest";
import {
  buildDirectTransferInstruction,
  buildEscrowInstruction,
  buildGroupEscrowInstruction,
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
      expect(instr.eip3009_sign_data.message.from).toBe(
        group.payer_wallet,
      );
    });
  });
});
