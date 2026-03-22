import type { LineItem, XAgentQuotePayload } from "../types.js";
import { type Address, type Hex, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

interface BuildQuoteParams {
  readonly merchantDid: string;
  readonly orderRef: string;
  readonly amount: string;
  readonly currency: string;
  readonly summary: string;
  readonly lineItems: readonly LineItem[];
  readonly payerWallet: string;
  readonly signerPrivateKey: string;
}

const USDC_DECIMALS = 6;
const QUOTE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEMO_DISCOUNT_AMOUNT = "0.10"; // 0.1 USDC for testing
const DEMO_DISCOUNT_UINT256 = "100000"; // pre-computed toUint256("0.10")

// XAgentPay Core Contract Address (Demo)
const VERIFYING_CONTRACT =
  "0x0000000000000000000000000000000000000000" as Address;

const XAGENT_DOMAIN = {
  name: "XAgentPay",
  version: "1",
  chainId: 196,
  verifyingContract: VERIFYING_CONTRACT,
} as const;

const XAGENT_QUOTE_TYPES = {
  XAgentQuote: [
    { name: "merchant_did", type: "string" },
    { name: "merchant_order_ref", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "currency", type: "string" },
    { name: "chain_id", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "context_hash", type: "bytes32" },
  ],
} as const;

// Cache the signing account — private key never changes at runtime
let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;
let cachedKeyHex: string | null = null;

export function toUint256(
  amount: string,
  decimals: number = USDC_DECIMALS,
): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`Invalid amount string for toUint256: "${amount}"`);
  }
  const parts = amount.split(".");
  const integerPart = parts[0] ?? "0";
  const fractionalPart = (parts[1] ?? "")
    .padEnd(decimals, "0")
    .slice(0, decimals);
  const raw = integerPart + fractionalPart;
  return raw.replace(/^0+/, "") || "0";
}

export async function buildQuote(
  params: BuildQuoteParams,
): Promise<XAgentQuotePayload> {
  const originalUint256 = toUint256(params.amount);
  const lineItemsUint256 = params.lineItems.map((item) => ({
    ...item,
    amount: toUint256(item.amount),
  }));

  const context = {
    summary: params.summary,
    line_items: lineItemsUint256,
    original_amount: originalUint256,
    payer_wallet: params.payerWallet,
  };

  const contextHash = keccak256(toHex(JSON.stringify(context)));
  const expiry = Math.floor((Date.now() + QUOTE_TTL_MS) / 1000);

  // Reuse cached account — avoids re-deriving secp256k1 key on every call
  if (!cachedAccount || cachedKeyHex !== params.signerPrivateKey) {
    cachedAccount = privateKeyToAccount(params.signerPrivateKey as Hex);
    cachedKeyHex = params.signerPrivateKey;
  }

  // Sign locally via account.signTypedData — no walletClient / RPC needed
  const signature = await cachedAccount.signTypedData({
    domain: XAGENT_DOMAIN,
    types: XAGENT_QUOTE_TYPES,
    primaryType: "XAgentQuote",
    message: {
      merchant_did: params.merchantDid,
      merchant_order_ref: params.orderRef,
      amount: BigInt(DEMO_DISCOUNT_UINT256),
      currency: params.currency,
      chain_id: BigInt(196),
      expiry: BigInt(expiry),
      context_hash: contextHash,
    },
  });

  return {
    merchant_did: params.merchantDid,
    merchant_order_ref: params.orderRef,
    amount: DEMO_DISCOUNT_UINT256,
    currency: params.currency,
    chain_id: 196,
    expiry,
    payment_method: "ACP_JOB" as const,
    context,
    signature,
  };
}
