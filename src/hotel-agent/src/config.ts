export interface Config {
  readonly merchantDid: string;
  readonly portalPort: number;
  readonly amadeusApiKey: string;
  readonly amadeusApiSecret: string;
  readonly databaseUrl: string;
  readonly webhookSecret: string;
  readonly paymentAddress: string;
  readonly signerPrivateKey: string;
  readonly xagentCoreUrl: string;
  readonly portalBaseUrl: string;
  readonly relayerPrivateKey: string;
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
    process.env.MERCHANT_DID ?? "did:xagent:196:demo_hotel";
  const portalPort = parsePort(process.env.PORTAL_PORT, 3002);
  const amadeusApiKey = process.env.AMADEUS_API_KEY ?? "";
  const amadeusApiSecret = process.env.AMADEUS_API_SECRET ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const webhookSecret =
    process.env.XAGENT_WEBHOOK_SECRET ?? "REDACTED_WEBHOOK_SECRET";
  const paymentAddress =
    process.env.MERCHANT_PAYMENT_ADDRESS ||
    "0xac9d5239b597f8903da93b9b8d92e6cff564e989";
  const signerPrivateKey = process.env.MERCHANT_SIGNER_PRIVATE_KEY ?? "";
  const xagentCoreUrl =
    process.env.XAGENT_CORE_URL || "https://api.xagenpay.com";
  const portalBaseUrl =
    process.env.PORTAL_BASE_URL || "https://xagenpay.com/hotel";
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY ?? "";
  const x402PriceAtomic =
    process.env.X402_PRICE_ATOMIC || "100000"; // 0.10 USDC

  return {
    merchantDid,
    portalPort,
    amadeusApiKey,
    amadeusApiSecret,
    databaseUrl,
    webhookSecret,
    paymentAddress,
    signerPrivateKey,
    xagentCoreUrl,
    portalBaseUrl,
    relayerPrivateKey,
    x402PriceAtomic,
  };
}
