export interface Config {
  readonly duffelApiToken: string;
  readonly merchantDid: string;
  readonly portalPort: number;
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
  const duffelApiToken = process.env.DUFFEL_API_TOKEN ?? "";
  const merchantDid =
    process.env.MERCHANT_DID ?? "did:nexus:210425:demo_flight";
  const portalPort = parsePort(process.env.PORTAL_PORT, 3001);

  return { duffelApiToken, merchantDid, portalPort };
}
