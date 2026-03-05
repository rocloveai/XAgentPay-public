/**
 * xNexus Core — Relayer service.
 *
 * Submits EIP-3009 deposit / release / refund transactions to the
 * NexusPayEscrow contract on behalf of users.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type PublicClient,
  type WalletClient,
  type Hex,
  type Account,
  type Chain,
  type HttpTransport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { NexusCoreConfig } from "../config.js";
import { NEXUS_PAY_ESCROW_ABI } from "../abi/nexus-pay-escrow.js";
import { RelayerError } from "../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelayerTxResult {
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly status: "success" | "reverted";
}

/** On-chain EscrowStatus enum values from NexusPayEscrow.sol */
export const OnChainEscrowStatus = {
  NONE: 0,
  DEPOSITED: 1,
  RELEASED: 2,
  REFUNDED: 3,
  DISPUTED: 4,
  RESOLVED_TO_MERCHANT: 5,
  RESOLVED_TO_PAYER: 6,
  RESOLVED_SPLIT: 7,
} as const;

export type OnChainEscrowStatusValue =
  (typeof OnChainEscrowStatus)[keyof typeof OnChainEscrowStatus];

// ---------------------------------------------------------------------------
// PlatON chain definition (shared by relayer + chain-watcher)
// ---------------------------------------------------------------------------

export function buildPlatonChain(config: NexusCoreConfig): Chain {
  return defineChain({
    id: config.chainId,
    name: config.chainName,
    nativeCurrency: { name: "LAT", symbol: "LAT", decimals: 18 },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
  });
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

/** Retry delays — exported for test override */
export const RETRY_DELAYS_MS: number[] = [1_000, 3_000, 9_000];

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Don't retry if the tx was submitted but reverted on-chain
      if (err instanceof RelayerError) throw err;
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new RelayerError(`${label}: retries exhausted — ${message}`, {
    attempts: RETRY_DELAYS_MS.length + 1,
  });
}

// ---------------------------------------------------------------------------
// NexusRelayer
// ---------------------------------------------------------------------------

export class NexusRelayer {
  private readonly publicClient: PublicClient<HttpTransport, Chain>;
  private readonly walletClient: WalletClient<HttpTransport, Chain, Account>;
  private readonly escrowAddress: Hex;

  constructor(config: NexusCoreConfig) {
    if (!config.relayerPrivateKey) {
      throw new RelayerError("RELAYER_PRIVATE_KEY is not configured");
    }

    const chain = buildPlatonChain(config);
    const transport = http(config.rpcUrl);
    const account = privateKeyToAccount(config.relayerPrivateKey as Hex);

    this.publicClient = createPublicClient({ chain, transport });
    this.walletClient = createWalletClient({ chain, transport, account });
    this.escrowAddress = config.escrowContract as Hex;
  }

  async submitRelease(paymentIdBytes32: Hex): Promise<RelayerTxResult> {
    return withRetry(async () => {
      const txHash = await this.walletClient.writeContract({
        address: this.escrowAddress,
        abi: NEXUS_PAY_ESCROW_ABI,
        functionName: "release",
        args: [paymentIdBytes32],
      });

      return this.waitForReceipt(txHash);
    }, "submitRelease");
  }

  async submitResolve(
    paymentIdBytes32: Hex,
    merchantBps: number,
  ): Promise<RelayerTxResult> {
    return withRetry(async () => {
      const txHash = await this.walletClient.writeContract({
        address: this.escrowAddress,
        abi: NEXUS_PAY_ESCROW_ABI,
        functionName: "resolve",
        args: [paymentIdBytes32, merchantBps],
      });

      return this.waitForReceipt(txHash);
    }, "submitResolve");
  }

  getAddress(): Hex {
    return this.walletClient.account.address;
  }

  async getRelayerBalance(): Promise<bigint> {
    return this.publicClient.getBalance({
      address: this.walletClient.account.address,
    });
  }

  async getEscrowStatus(
    paymentIdBytes32: Hex,
  ): Promise<OnChainEscrowStatusValue> {
    const result = await this.publicClient.readContract({
      address: this.escrowAddress,
      abi: NEXUS_PAY_ESCROW_ABI,
      functionName: "getEscrow",
      args: [paymentIdBytes32],
    });
    // getEscrow returns a tuple; status is the last element (index 8)
    const tuple = result as readonly unknown[];
    return Number(tuple[8]) as OnChainEscrowStatusValue;
  }

  async submitRefund(paymentIdBytes32: Hex): Promise<RelayerTxResult> {
    return withRetry(async () => {
      const txHash = await this.walletClient.writeContract({
        address: this.escrowAddress,
        abi: NEXUS_PAY_ESCROW_ABI,
        functionName: "refund",
        args: [paymentIdBytes32],
      });

      return this.waitForReceipt(txHash);
    }, "submitRefund");
  }

  private async waitForReceipt(txHash: Hex): Promise<RelayerTxResult> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000, // 2 minutes max
    });

    const result: RelayerTxResult = {
      txHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === "success" ? "success" : "reverted",
    };

    if (result.status === "reverted") {
      throw new RelayerError("Transaction reverted", {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
      });
    }

    return result;
  }
}
