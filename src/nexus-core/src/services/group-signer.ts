/**
 * NexusPay Core — Group Signer.
 *
 * Signs a (groupId, entriesHash, totalAmount) tuple via EIP-712,
 * allowing downstream verification that Nexus Core approved the
 * payment entries (merchant addresses + amounts) in this group.
 *
 * Uses the same relayerPrivateKey as the relayer (= coreOperator).
 */
import type { Address, Hex, GroupPaymentDetail } from "../types.js";
import type { NexusCoreConfig } from "../config.js";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// EIP-712 domain & types
// ---------------------------------------------------------------------------

const EIP712_TYPES = {
  NexusGroupApproval: [
    { name: "groupId", type: "bytes32" },
    { name: "entriesHash", type: "bytes32" },
    { name: "totalAmount", type: "uint256" },
  ],
} as const;

function buildDomain(config: NexusCoreConfig) {
  return {
    name: "NexusPay",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.escrowContract as Address,
  } as const;
}

// ---------------------------------------------------------------------------
// Entries hash — deterministic hash of the full entries array
// ---------------------------------------------------------------------------

/**
 * Compute `keccak256(abi.encode(entries[]))` where each entry is
 * `(bytes32 paymentId, address merchant, uint256 amount,
 *   bytes32 orderRef, bytes32 merchantDid, bytes32 contextHash)`.
 *
 * The encoding matches the Solidity struct ordering in NexusPayEscrow.
 */
export function computeEntriesHash(
  payments: readonly GroupPaymentDetail[],
): Hex {
  const entryType = parseAbiParameters(
    "bytes32, address, uint256, bytes32, bytes32, bytes32",
  );

  const encodedEntries = payments.map((p) =>
    encodeAbiParameters(entryType, [
      p.payment_id_bytes32 as Hex,
      p.merchant_address as Address,
      BigInt(p.amount_uint256),
      p.order_ref_bytes32 as Hex,
      p.merchant_did_bytes32 as Hex,
      p.context_hash as Hex,
    ]),
  );

  // Concatenate all encoded entries, then hash
  const concatenated = `0x${encodedEntries.map((e) => e.slice(2)).join("")}` as Hex;
  return keccak256(concatenated);
}

// ---------------------------------------------------------------------------
// Sign group
// ---------------------------------------------------------------------------

export interface GroupSignatureResult {
  readonly signature: Hex;
  readonly signerAddress: Address;
}

/**
 * EIP-712 sign `NexusGroupApproval(groupId, entriesHash, totalAmount)`.
 * Returns the signature and the signer address (derived from relayerPrivateKey).
 */
export async function signGroup(
  groupId: string,
  payments: readonly GroupPaymentDetail[],
  totalAmount: string,
  config: NexusCoreConfig,
): Promise<GroupSignatureResult> {
  const account = privateKeyToAccount(config.relayerPrivateKey as Hex);

  const entriesHash = computeEntriesHash(payments);
  const groupIdBytes32 = keccak256(`0x${Buffer.from(groupId).toString("hex")}` as Hex);

  const signature = await account.signTypedData({
    domain: buildDomain(config),
    types: EIP712_TYPES,
    primaryType: "NexusGroupApproval",
    message: {
      groupId: groupIdBytes32,
      entriesHash,
      totalAmount: BigInt(totalAmount),
    },
  });

  return {
    signature: signature as Hex,
    signerAddress: account.address as Address,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Derive the core operator address from relayerPrivateKey. */
export function getCoreOperatorAddress(config: NexusCoreConfig): Address {
  const account = privateKeyToAccount(config.relayerPrivateKey as Hex);
  return account.address as Address;
}
