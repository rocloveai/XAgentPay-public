/**
 * NexusPay Core — environment configuration.
 */

export interface NexusCoreConfig {
  readonly databaseUrl: string;
  readonly escrowContract: string;
  readonly chainId: number;
  readonly chainName: string;
  readonly usdcAddress: string;
  readonly usdcDecimals: number;
  readonly protocolFeeBps: number;
  readonly releaseTimeoutS: number;
  readonly disputeWindowS: number;
  readonly port: number;
  readonly rpcUrl: string;
  readonly relayerPrivateKey: string;
  readonly watcherIntervalMs: number;
  readonly timeoutSweepIntervalMs: number;
  readonly webhookRetryIntervalMs: number;
}

export function loadNexusCoreConfig(): NexusCoreConfig {
  return {
    databaseUrl: process.env.DATABASE_URL ?? "",
    escrowContract:
      process.env.ESCROW_CONTRACT ??
      "0x0000000000000000000000000000000000000000",
    chainId: Number(process.env.CHAIN_ID ?? "20250407"),
    chainName: process.env.CHAIN_NAME ?? "PlatON Devnet",
    usdcAddress:
      process.env.USDC_ADDRESS ?? "0xFF8dEe9983768D0399673014cf77826896F97e4d",
    usdcDecimals: 6,
    protocolFeeBps: Number(process.env.PROTOCOL_FEE_BPS ?? "30"),
    releaseTimeoutS: Number(process.env.RELEASE_TIMEOUT_S ?? "86400"),
    disputeWindowS: Number(process.env.DISPUTE_WINDOW_S ?? "259200"),
    port: Number(process.env.PORT ?? "4000"),
    rpcUrl: process.env.RPC_URL ?? "https://devnet3openapi.platon.network/rpc",
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY ?? "",
    watcherIntervalMs: Number(process.env.WATCHER_INTERVAL_MS ?? "15000"),
    timeoutSweepIntervalMs: Number(
      process.env.TIMEOUT_SWEEP_INTERVAL_MS ?? "60000",
    ),
    webhookRetryIntervalMs: Number(
      process.env.WEBHOOK_RETRY_INTERVAL_MS ?? "30000",
    ),
  };
}
