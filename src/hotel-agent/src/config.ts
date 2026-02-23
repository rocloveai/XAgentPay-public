export interface Config {
  readonly merchantDid: string;
  readonly portalPort: number;
  readonly amadeusApiKey: string;
  readonly amadeusApiSecret: string;
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
  const merchantDid = process.env.MERCHANT_DID ?? "did:nexus:210425:demo_hotel";
  const portalPort = parsePort(process.env.PORTAL_PORT, 3002);
  const amadeusApiKey = process.env.AMADEUS_API_KEY ?? "";
  const amadeusApiSecret = process.env.AMADEUS_API_SECRET ?? "";

  return { merchantDid, portalPort, amadeusApiKey, amadeusApiSecret };
}
