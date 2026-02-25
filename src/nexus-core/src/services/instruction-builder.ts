/**
 * NexusPay Core — Instruction builder.
 *
 * Builds payment instructions for User Agent:
 * - Direct transfer instructions
 * - Single escrow instructions
 * - Group (aggregated) escrow instructions
 */
import { randomBytes } from "node:crypto";
import type {
  Address,
  Hex,
  PaymentRecord,
  MerchantRecord,
  PaymentInstruction,
  EscrowInstruction,
  EIP3009SignData,
  GroupEscrowInstruction,
  GroupPaymentDetail,
  PaymentGroupRecord,
} from "../types.js";
import type { NexusCoreConfig } from "../config.js";
import {
  PLATON_DEVNET_USDC_ADDRESS,
  USDC_DECIMALS,
  DEFAULT_RELEASE_TIMEOUT_S,
  DEFAULT_DISPUTE_WINDOW_S,
} from "../constants.js";
import { keccak256, toHex, encodeFunctionData, parseAbi } from "viem";

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

// ---------------------------------------------------------------------------
// Direct Transfer
// ---------------------------------------------------------------------------

export function buildDirectTransferInstruction(
  payment: PaymentRecord,
  merchant: MerchantRecord,
  config: NexusCoreConfig,
): PaymentInstruction {
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [merchant.payment_address as Address, BigInt(payment.amount)],
  });

  return {
    chain_id: config.chainId,
    chain_name: config.chainName,
    payment_method: "DIRECT_TRANSFER",
    target_address: config.usdcAddress as Address,
    token_address: config.usdcAddress as Address,
    token_symbol: "USDC",
    token_decimals: 6,
    amount_uint256: payment.amount,
    amount_display: payment.amount_display,
    method: "erc20_transfer",
    tx_data: {
      to: config.usdcAddress as Address,
      data: data as Hex,
      value: "0",
      gas_limit: "100000",
    },
    nexus_payment_id: payment.nexus_payment_id,
    memo: `NexusPay: ${payment.merchant_order_ref}`,
  };
}

// ---------------------------------------------------------------------------
// Single Escrow
// ---------------------------------------------------------------------------

export function buildEscrowInstruction(
  payment: PaymentRecord,
  merchant: MerchantRecord,
  config: NexusCoreConfig,
  payerWallet: string,
): EscrowInstruction {
  const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
  const now = Math.floor(Date.now() / 1000);
  // PlatON EVM uses block.timestamp in milliseconds, so EIP-3009
  // validAfter / validBefore must be in milliseconds for on-chain checks.
  const nowMs = Date.now();

  const eip3009SignData: EIP3009SignData = {
    domain: {
      name: "USD Coin",
      version: "1",
      chainId: config.chainId,
      verifyingContract: config.usdcAddress as Address,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: payerWallet as Address,
      to: config.escrowContract as Address,
      value: payment.amount,
      validAfter: "0",
      validBefore: String(nowMs + DEFAULT_RELEASE_TIMEOUT_S * 1000),
      nonce,
    },
  };

  return {
    chain_id: config.chainId,
    chain_name: config.chainName,
    payment_method: "ESCROW_CONTRACT",
    escrow_contract: config.escrowContract as Address,
    token_address: config.usdcAddress as Address,
    token_symbol: "USDC",
    token_decimals: 6,
    amount_uint256: payment.amount,
    amount_display: payment.amount_display,
    eip3009_sign_data: eip3009SignData,
    nexus_payment_id: payment.nexus_payment_id,
    payment_id_bytes32: keccak256(toHex(payment.nexus_payment_id)) as Hex,
    merchant_address: merchant.payment_address as Address,
    order_ref_hash: keccak256(toHex(payment.merchant_order_ref)) as Hex,
    merchant_did_hash: keccak256(toHex(payment.merchant_did)) as Hex,
    context_hash: keccak256(
      toHex(JSON.stringify(payment.quote_payload.context)),
    ) as Hex,
    release_deadline: new Date(
      (now + DEFAULT_RELEASE_TIMEOUT_S) * 1000,
    ).toISOString(),
    dispute_deadline: new Date(
      (now + DEFAULT_DISPUTE_WINDOW_S) * 1000,
    ).toISOString(),
    user_action: "SIGN_EIP3009",
    gas_paid_by: "RELAYER",
  };
}

// ---------------------------------------------------------------------------
// Group Escrow (aggregated multi-merchant)
// ---------------------------------------------------------------------------

export function buildGroupEscrowInstruction(
  group: PaymentGroupRecord,
  payments: readonly PaymentRecord[],
  merchants: readonly MerchantRecord[],
  config: NexusCoreConfig,
): GroupEscrowInstruction {
  const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
  const now = Math.floor(Date.now() / 1000);
  // PlatON EVM uses block.timestamp in milliseconds
  const nowMs = Date.now();

  // Build per-payment details
  const paymentDetails: GroupPaymentDetail[] = payments.map((p, i) => ({
    nexus_payment_id: p.nexus_payment_id,
    merchant_did: p.merchant_did,
    merchant_order_ref: p.merchant_order_ref,
    merchant_address: merchants[i].payment_address as Address,
    amount_uint256: p.amount,
    amount_display: p.amount_display,
    summary: p.quote_payload.context.summary,
  }));

  const eip3009SignData: EIP3009SignData = {
    domain: {
      name: "USD Coin",
      version: "1",
      chainId: config.chainId,
      verifyingContract: config.usdcAddress as Address,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: group.payer_wallet as Address,
      to: config.escrowContract as Address,
      value: group.total_amount,
      validAfter: "0",
      validBefore: String(nowMs + DEFAULT_RELEASE_TIMEOUT_S * 1000),
      nonce,
    },
  };

  return {
    group_id: group.group_id,
    chain_id: config.chainId,
    chain_name: config.chainName,
    payment_method: "ESCROW_CONTRACT",
    escrow_contract: config.escrowContract as Address,
    token_address: config.usdcAddress as Address,
    token_symbol: "USDC",
    token_decimals: 6,
    total_amount_uint256: group.total_amount,
    total_amount_display: group.total_amount_display,
    payments: paymentDetails,
    eip3009_sign_data: eip3009SignData,
    user_action: "SIGN_EIP3009",
    gas_paid_by: "RELAYER",
  };
}
