/**
 * x402 Self-Hosted Facilitator
 *
 * Verifies and settles EIP-3009 transferWithAuthorization payments
 * on XLayer. Uses viem for on-chain interaction.
 *
 * Reference: x402 EIP-3009 facilitator implementation
 * https://github.com/coinbase/x402
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  getAddress,
  parseSignature,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type HttpTransport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  XLAYER_CHAIN_ID,
  XLAYER_RPC_URL,
  XLAYER_USDC,
  XLAYER_NETWORK,
} from "./config.js";
import type {
  PaymentPayload,
  PaymentRequirements,
  EIP3009PayloadData,
  VerifyResponse,
  SettleResponse,
} from "./types.js";

// ---------------------------------------------------------------------------
// EIP-3009 ABI (only what we need)
// ---------------------------------------------------------------------------

const eip3009ABI = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    name: "authorizationState",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** EIP-712 typed data for TransferWithAuthorization */
const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// ---------------------------------------------------------------------------
// XLayer chain definition
// ---------------------------------------------------------------------------

const xlayerChain = defineChain({
  id: XLAYER_CHAIN_ID,
  name: "XLayer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: [XLAYER_RPC_URL] },
  },
});

// ---------------------------------------------------------------------------
// Error constants
// ---------------------------------------------------------------------------

const Errors = {
  InvalidScheme: "Invalid payment scheme: expected 'exact'",
  NetworkMismatch: "Network mismatch between payload and requirements",
  RecipientMismatch: "Payment recipient does not match requirements",
  AmountMismatch: "Payment amount does not match requirements",
  ValidBeforeExpired: "Payment authorization has expired (validBefore in the past)",
  ValidAfterInFuture: "Payment authorization not yet valid (validAfter in the future)",
  InvalidSignature: "Invalid EIP-3009 signature",
  InsufficientBalance: "Payer has insufficient USDC balance",
  NonceAlreadyUsed: "EIP-3009 nonce has already been used",
  SimulationFailed: "Transaction simulation failed",
  TransactionFailed: "On-chain transaction failed",
  MissingEip712Domain: "Missing EIP-712 domain info (name, version) in extra",
  MissingPayloadData: "Missing authorization or signature in payload",
} as const;

// ---------------------------------------------------------------------------
// Helper: extract EIP-3009 payload from generic payload
// ---------------------------------------------------------------------------

export function extractEIP3009Payload(
  payload: Record<string, unknown>,
): EIP3009PayloadData | null {
  const authorization = payload.authorization as EIP3009PayloadData["authorization"] | undefined;
  const signature = payload.signature as `0x${string}` | undefined;

  if (!authorization || !signature) {
    return null;
  }

  return { authorization, signature };
}

// ---------------------------------------------------------------------------
// Create viem clients
// ---------------------------------------------------------------------------

function createClients(signerPrivateKey: string): {
  publicClient: PublicClient<HttpTransport, Chain>;
  walletClient: WalletClient<HttpTransport, Chain, Account>;
} {
  const transport = http(XLAYER_RPC_URL);
  const account = privateKeyToAccount(signerPrivateKey as Hex);

  const publicClient = createPublicClient({
    chain: xlayerChain,
    transport,
  });

  const walletClient = createWalletClient({
    chain: xlayerChain,
    transport,
    account,
  });

  return { publicClient, walletClient };
}

// ---------------------------------------------------------------------------
// Verify EIP-3009 Payment
// ---------------------------------------------------------------------------

/**
 * Verifies an EIP-3009 payment payload against payment requirements.
 *
 * Checks:
 * 1. Scheme is "exact"
 * 2. Network matches
 * 3. Recipient (to) matches payTo
 * 4. Amount matches
 * 5. Time window (validAfter <= now < validBefore)
 * 6. Payer has sufficient USDC balance
 * 7. Nonce hasn't been used
 * 8. Simulates the transaction
 */
export async function verifyEIP3009Payment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Extract EIP-3009 specific data
  const eip3009Data = extractEIP3009Payload(payload.payload);
  if (!eip3009Data) {
    return {
      isValid: false,
      invalidReason: Errors.MissingPayloadData,
    };
  }

  const payer = eip3009Data.authorization.from;

  // Verify scheme
  if (payload.accepted.scheme !== "exact" || requirements.scheme !== "exact") {
    return { isValid: false, invalidReason: Errors.InvalidScheme, payer };
  }

  // Verify network
  if (payload.accepted.network !== requirements.network) {
    return { isValid: false, invalidReason: Errors.NetworkMismatch, payer };
  }

  // Verify EIP-712 domain info exists
  if (!requirements.extra?.name || !requirements.extra?.version) {
    return { isValid: false, invalidReason: Errors.MissingEip712Domain, payer };
  }

  // Verify recipient matches
  if (
    getAddress(eip3009Data.authorization.to) !== getAddress(requirements.payTo)
  ) {
    return { isValid: false, invalidReason: Errors.RecipientMismatch, payer };
  }

  // Verify amount matches
  if (BigInt(eip3009Data.authorization.value) !== BigInt(requirements.amount)) {
    return { isValid: false, invalidReason: Errors.AmountMismatch, payer };
  }

  // Verify time window
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(eip3009Data.authorization.validBefore) < BigInt(now + 6)) {
    return { isValid: false, invalidReason: Errors.ValidBeforeExpired, payer };
  }
  if (BigInt(eip3009Data.authorization.validAfter) > BigInt(now)) {
    return { isValid: false, invalidReason: Errors.ValidAfterInFuture, payer };
  }

  // On-chain checks
  const { publicClient } = createClients(
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  ); // read-only, dummy key

  try {
    // Check balance
    const balance = await publicClient.readContract({
      address: XLAYER_USDC,
      abi: eip3009ABI,
      functionName: "balanceOf",
      args: [getAddress(payer)],
    });

    if ((balance as bigint) < BigInt(requirements.amount)) {
      return { isValid: false, invalidReason: Errors.InsufficientBalance, payer };
    }

    // Check nonce not used
    const nonceUsed = await publicClient.readContract({
      address: XLAYER_USDC,
      abi: eip3009ABI,
      functionName: "authorizationState",
      args: [getAddress(payer), eip3009Data.authorization.nonce],
    });

    if (nonceUsed) {
      return { isValid: false, invalidReason: Errors.NonceAlreadyUsed, payer };
    }
  } catch (err) {
    console.error("[x402 Facilitator] On-chain verification error:", err);
    return { isValid: false, invalidReason: Errors.InsufficientBalance, payer };
  }

  // Simulate the transfer
  try {
    const sig = eip3009Data.signature;
    const sigLength = sig.startsWith("0x") ? sig.length - 2 : sig.length;
    const isECDSA = sigLength === 130;

    const auth = eip3009Data.authorization;
    const baseArgs = [
      getAddress(auth.from),
      getAddress(auth.to),
      BigInt(auth.value),
      BigInt(auth.validAfter),
      BigInt(auth.validBefore),
      auth.nonce,
    ] as const;

    if (isECDSA) {
      const parsedSig = parseSignature(sig);
      await publicClient.simulateContract({
        address: XLAYER_USDC,
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [
          ...baseArgs,
          Number(parsedSig.v ?? (parsedSig.yParity ? 28 : 27)),
          parsedSig.r,
          parsedSig.s,
        ],
      });
    } else {
      await publicClient.simulateContract({
        address: XLAYER_USDC,
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [...baseArgs, sig],
      });
    }
  } catch (simErr) {
    console.error("[x402 Facilitator] Simulation failed:", simErr);
    return { isValid: false, invalidReason: Errors.SimulationFailed, payer };
  }

  return { isValid: true, payer };
}

// ---------------------------------------------------------------------------
// Settle EIP-3009 Payment
// ---------------------------------------------------------------------------

/**
 * Settles an EIP-3009 payment by calling transferWithAuthorization on-chain.
 *
 * Uses the relayer's private key to submit the transaction.
 * The relayer only pays gas — the USDC moves from payer to payTo.
 */
export async function settleEIP3009Payment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  signerPrivateKey: string,
): Promise<SettleResponse> {
  const network = XLAYER_NETWORK;

  // Extract EIP-3009 data
  const eip3009Data = extractEIP3009Payload(payload.payload);
  if (!eip3009Data) {
    return {
      success: false,
      errorReason: Errors.MissingPayloadData,
      transaction: "",
      network,
    };
  }

  const payer = eip3009Data.authorization.from;

  // DEMO_MODE: skip on-chain balance check and actual settlement
  // ⚠️  NEVER enable in production — guards below enforce this.
  if (process.env.DEMO_MODE === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: DEMO_MODE must not be enabled in production");
    }
    const fakeTx = `0xdemo${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}` as Hex;
    console.error(`[x402 Facilitator] ⚠️  DEMO_MODE: simulated settlement ${fakeTx}`);
    return { success: true, transaction: fakeTx, network, payer };
  }

  // Re-verify before settling
  const verification = await verifyEIP3009Payment(payload, requirements);
  if (!verification.isValid) {
    return {
      success: false,
      errorReason: verification.invalidReason ?? Errors.InvalidSignature,
      transaction: "",
      network,
      payer,
    };
  }

  // Create clients with the actual signer key
  const { walletClient, publicClient } = createClients(signerPrivateKey);

  try {
    const auth = eip3009Data.authorization;
    const sig = eip3009Data.signature;
    const sigLength = sig.startsWith("0x") ? sig.length - 2 : sig.length;
    const isECDSA = sigLength === 130;

    const baseArgs = [
      getAddress(auth.from),
      getAddress(auth.to),
      BigInt(auth.value),
      BigInt(auth.validAfter),
      BigInt(auth.validBefore),
      auth.nonce,
    ] as const;

    let txHash: Hex;

    if (isECDSA) {
      const parsedSig = parseSignature(sig);
      txHash = await walletClient.writeContract({
        address: XLAYER_USDC,
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [
          ...baseArgs,
          Number(parsedSig.v ?? (parsedSig.yParity ? 28 : 27)),
          parsedSig.r,
          parsedSig.s,
        ],
      });
    } else {
      txHash = await walletClient.writeContract({
        address: XLAYER_USDC,
        abi: eip3009ABI,
        functionName: "transferWithAuthorization",
        args: [...baseArgs, sig],
      });
    }

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000, // 2 minutes max
    });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.TransactionFailed,
        transaction: txHash,
        network,
        payer,
      };
    }

    console.error(
      `[x402 Facilitator] Settlement successful: ${txHash} (block ${receipt.blockNumber})`,
    );

    return {
      success: true,
      transaction: txHash,
      network,
      payer,
    };
  } catch (err) {
    console.error("[x402 Facilitator] Settlement failed:", err);
    return {
      success: false,
      errorReason: Errors.TransactionFailed,
      transaction: "",
      network,
      payer,
    };
  }
}
