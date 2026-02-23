const BASE_URL = "https://test.api.amadeus.com";

interface TokenState {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let tokenState: TokenState | null = null;

export async function getAccessToken(
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  if (tokenState && Date.now() < tokenState.expiresAt) {
    return tokenState.accessToken;
  }

  const response = await fetch(`${BASE_URL}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiKey,
      client_secret: apiSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Amadeus auth failed: ${response.status} - ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenState = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return tokenState.accessToken;
}

export async function amadeusGet<T>(
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Amadeus API ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}
