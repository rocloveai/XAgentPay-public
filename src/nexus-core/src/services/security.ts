/**
 * xNexus Core — Security module.
 *
 * - EIP-712 quote signature verification
 * - Merchant DID resolution
 * - Nonce / replay guard
 */
import {
  verifyTypedData,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { NexusQuotePayload, MerchantRecord } from "../types.js";
import type { MerchantRepository } from "../db/interfaces/merchant-repo.js";
import type { PaymentRepository } from "../db/interfaces/payment-repo.js";
import { SecurityError } from "../errors.js";

// ---------------------------------------------------------------------------
// EIP-712 Domain & Types (must match merchant quote-builder.ts)
// ---------------------------------------------------------------------------

const NEXUS_DOMAIN = {
  name: "NexusPay",
  version: "1",
  chainId: 20250407,
  verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
} as const;

const NEXUS_QUOTE_TYPES = {
  NexusQuote: [
    { name: "merchant_did", type: "string" },
    { name: "merchant_order_ref", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "currency", type: "string" },
    { name: "chain_id", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "context_hash", type: "bytes32" },
  ],
} as const;

// ---------------------------------------------------------------------------
// Quote hash (deterministic identifier)
// ---------------------------------------------------------------------------

export function computeQuoteHash(quote: NexusQuotePayload): string {
  const payload = JSON.stringify({
    merchant_did: quote.merchant_did,
    merchant_order_ref: quote.merchant_order_ref,
    amount: quote.amount,
    currency: quote.currency,
    chain_id: quote.chain_id,
    expiry: quote.expiry,
    signature: quote.signature,
  });
  return keccak256(toHex(payload));
}

// ---------------------------------------------------------------------------
// Context normalization — undo type coercion from JSON transit
// ---------------------------------------------------------------------------

/**
 * MCP clients / LLMs may coerce numeric-looking strings to numbers when
 * reconstructing JSON (e.g. `"530000"` → `530000`). The merchant signs with
 * string amounts, so we must normalize back to strings before hashing.
 */
function normalizeContext(
  ctx: NexusQuotePayload["context"],
): NexusQuotePayload["context"] {
  return {
    summary: ctx.summary,
    line_items: ctx.line_items.map((item) => ({
      name: item.name,
      qty: typeof item.qty === "string" ? Number(item.qty) : item.qty,
      amount: String(item.amount),
    })),
    original_amount:
      ctx.original_amount != null ? String(ctx.original_amount) : undefined,
    payer_wallet: ctx.payer_wallet,
  };
}

// ---------------------------------------------------------------------------
// EIP-712 Signature Verification
// ---------------------------------------------------------------------------

export async function verifyQuoteSignature(
  quote: NexusQuotePayload,
  merchant: MerchantRecord,
): Promise<void> {
  const normalizedCtx = normalizeContext(quote.context);
  const contextHash = keccak256(toHex(JSON.stringify(normalizedCtx)));

  const message = {
    merchant_did: quote.merchant_did,
    merchant_order_ref: quote.merchant_order_ref,
    amount: BigInt(quote.amount),
    currency: quote.currency,
    chain_id: BigInt(quote.chain_id),
    expiry: BigInt(quote.expiry),
    context_hash: contextHash as Hex,
  };

  const valid = await verifyTypedData({
    address: merchant.signer_address as Address,
    domain: NEXUS_DOMAIN,
    types: NEXUS_QUOTE_TYPES,
    primaryType: "NexusQuote",
    message,
    signature: quote.signature as Hex,
  });

  if (!valid) {
    // Fallback: try with the raw (un-normalized) context in case normalization
    // changed the structure. If either works, the signature is valid.
    const rawContextHash = keccak256(
      toHex(JSON.stringify(quote.context)),
    ) as Hex;
    if (rawContextHash !== contextHash) {
      const rawMessage = { ...message, context_hash: rawContextHash };
      const validRaw = await verifyTypedData({
        address: merchant.signer_address as Address,
        domain: NEXUS_DOMAIN,
        types: NEXUS_QUOTE_TYPES,
        primaryType: "NexusQuote",
        message: rawMessage,
        signature: quote.signature as Hex,
      });
      if (validRaw) return; // raw context matched
    }

    throw new SecurityError("Invalid quote signature", {
      merchant_did: quote.merchant_did,
      merchant_order_ref: quote.merchant_order_ref,
      signer_address: merchant.signer_address,
      context_hash_normalized: contextHash,
      context_hash_raw: rawContextHash,
      context_keys: Object.keys(quote.context),
      amount: quote.amount,
      amount_type: typeof quote.amount,
    });
  }
}

// ---------------------------------------------------------------------------
// DID Resolution
// ---------------------------------------------------------------------------

export async function resolveMerchantDid(
  did: string,
  merchantRepo: MerchantRepository,
): Promise<MerchantRecord> {
  const merchant = await merchantRepo.findByDid(did);
  if (!merchant) {
    throw new SecurityError(`Merchant DID not found: ${did}`, { did });
  }
  if (!merchant.is_active) {
    throw new SecurityError(`Merchant is inactive: ${did}`, { did });
  }
  return merchant;
}

// ---------------------------------------------------------------------------
// Nonce Guard (replay detection)
// ---------------------------------------------------------------------------

export async function checkNonceGuard(
  quoteHash: string,
  paymentRepo: PaymentRepository,
): Promise<void> {
  const existing = await paymentRepo.findByQuoteHash(quoteHash);
  if (existing) {
    throw new SecurityError("Quote already used (replay detected)", {
      quoteHash,
      existingPaymentId: existing.nexus_payment_id,
    });
  }
}

// ---------------------------------------------------------------------------
// Quote expiry check
// ---------------------------------------------------------------------------

export function checkQuoteExpiry(quote: NexusQuotePayload): void {
  const nowS = Math.floor(Date.now() / 1000);
  if (quote.expiry <= nowS) {
    throw new SecurityError("Quote has expired", {
      expiry: quote.expiry,
      now: nowS,
    });
  }
}
