export interface Config {
  readonly portalPort: number;
  readonly paymentAddress: string;
  readonly relayerPrivateKey: string;
  readonly portalBaseUrl: string;
  /** x402 price per query in USDC atomic units (6 decimals). Default: 10000 = 0.01 USDC */
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
  const portalPort = parsePort(process.env.PORTAL_PORT, 3004);
  const paymentAddress =
    process.env.MERCHANT_PAYMENT_ADDRESS ||
    "0xac9d5239b597f8903da93b9b8d92e6cff564e989";
  const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY ?? "";
  const portalBaseUrl =
    process.env.PORTAL_BASE_URL || "https://xagenpay.com/destination";
  const x402PriceAtomic =
    process.env.X402_PRICE_ATOMIC || "10000"; // 0.01 USDC

  return {
    portalPort,
    paymentAddress,
    relayerPrivateKey,
    portalBaseUrl,
    x402PriceAtomic,
  };
}
