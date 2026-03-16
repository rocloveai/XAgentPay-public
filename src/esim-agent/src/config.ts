export interface Config {
  readonly merchantDid: string;
  readonly portalPort: number;
  readonly databaseUrl: string;
  readonly webhookSecret: string;
  readonly paymentAddress: string;
  readonly signerPrivateKey: string;
  readonly nexusCoreUrl: string;
  readonly portalBaseUrl: string;
  /** Private key for x402 facilitator/relayer (pays gas for EIP-3009 settlements) */
  readonly relayerPrivateKey: string;
  /** Fixed demo price in USDC atomic units (6 decimals). Default: 100000 = 0.10 USDC */
  readonly x402PriceAtomic: string;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? String(fallback), 10);
  if (isNaN(n) || n < 1 || n > 65535) {
    console.error(`[Config] Invalid port "${raw}", using ${fallback}`);
    return fallback;
  }
  return n;
}

export function loadConfig(): Config {
  const merchantDid =
    process.env.MERCHANT_DID ?? "did:nexus:196:demo_esim";
  const portalPort = parsePort(process.env.PORTAL_PORT, 3003);
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const webhookSecret =
    process.env.NEXUS_WEBHOOK_SECRET ?? "REDACTED_WEBHOOK_SECRET";
  const paymentAddress =
    process.env.MERCHANT_PAYMENT_ADDRESS ||
    "0xC4a3E2b5c6D7f8A9b0E1d2C3B4a5F6e7D8c9A0b1";
  const signerPrivateKey =
    process.env.MERCHANT_SIGNER_PRIVATE_KEY ||
    "0x__REDACTED_ESIM_SIGNER_KEY__";
  const nexusCoreUrl =
    process.env.NEXUS_CORE_URL || "https://api.xagenpay.com";
  const portalBaseUrl =
    process.env.PORTAL_BASE_URL || "https://xagenpay.com/esim";
  const relayerPrivateKey =
    process.env.RELAYER_PRIVATE_KEY ||
    "0x__REDACTED_RELAYER_PRIVATE_KEY__";
  const x402PriceAtomic =
    process.env.X402_PRICE_ATOMIC || "100000"; // 0.10 USDC

  return {
    merchantDid,
    portalPort,
    databaseUrl,
    webhookSecret,
    paymentAddress,
    signerPrivateKey,
    nexusCoreUrl,
    portalBaseUrl,
    relayerPrivateKey,
    x402PriceAtomic,
  };
}
