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
      process.env.USDC_ADDRESS ??
      "0xFF8dEe9983768D0399673014cf77826896F97e4d",
    usdcDecimals: 6,
    protocolFeeBps: Number(process.env.PROTOCOL_FEE_BPS ?? "30"),
    releaseTimeoutS: Number(process.env.RELEASE_TIMEOUT_S ?? "86400"),
    disputeWindowS: Number(process.env.DISPUTE_WINDOW_S ?? "259200"),
    port: Number(process.env.PORT ?? "4000"),
  };
}
