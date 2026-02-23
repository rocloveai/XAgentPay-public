import type { FlightOffer } from "../types.js";

interface SearchParams {
  readonly origin: string;
  readonly destination: string;
  readonly date: string;
  readonly passengers: number;
}

interface DuffelSlice {
  readonly duration: string;
  readonly segments: ReadonlyArray<{
    readonly operating_carrier: { readonly name: string };
    readonly operating_carrier_flight_number: string;
    readonly origin: { readonly iata_code: string };
    readonly destination: { readonly iata_code: string };
    readonly departing_at: string;
    readonly arriving_at: string;
  }>;
}

interface DuffelOffer {
  readonly id: string;
  readonly slices: readonly DuffelSlice[];
  readonly total_amount: string;
  readonly total_currency: string;
  readonly cabin_class: string;
}

interface DuffelOfferRequestResponse {
  readonly data: {
    readonly offers: readonly DuffelOffer[];
  };
}

export async function searchFlights(
  params: SearchParams,
  apiToken: string,
): Promise<{ offers: readonly FlightOffer[]; error?: string }> {
  if (!apiToken) {
    return {
      offers: getFallbackFlights(params),
      error: "No Duffel API token configured, returning demo data",
    };
  }

  try {
    const response = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          slices: [
            {
              origin: params.origin,
              destination: params.destination,
              departure_date: params.date,
            },
          ],
          passengers: Array.from({ length: params.passengers }, () => ({
            type: "adult",
          })),
          cabin_class: "economy",
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Duffel API error: ${response.status} - ${errorBody}`);
      return {
        offers: getFallbackFlights(params),
        error: `Duffel API returned ${response.status}, returning demo data`,
      };
    }

    const result = (await response.json()) as DuffelOfferRequestResponse;
    const offers = result.data.offers.slice(0, 8).map(mapDuffelOffer);

    return { offers };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Duffel API call failed: ${message}`);
    return {
      offers: getFallbackFlights(params),
      error: `API call failed: ${message}, returning demo data`,
    };
  }
}

// Approximate exchange rates to USD (updated periodically)
const USD_RATES: Record<string, number> = {
  USD: 1,
  AUD: 0.64,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.74,
  SGD: 0.75,
  JPY: 0.0067,
  CNY: 0.14,
  HKD: 0.13,
  KRW: 0.00074,
  THB: 0.029,
};

function toUsd(amount: string, currency: string): string {
  const rate = USD_RATES[currency];
  if (!rate) return amount;
  return (parseFloat(amount) * rate).toFixed(2);
}

function mapDuffelOffer(offer: DuffelOffer): FlightOffer {
  const firstSlice = offer.slices[0];
  const firstSegment = firstSlice?.segments[0];
  const isUsd = offer.total_currency === "USD";

  return {
    offer_id: offer.id,
    airline: firstSegment?.operating_carrier.name ?? "Unknown",
    flight_number: firstSegment?.operating_carrier_flight_number ?? "N/A",
    origin: firstSegment?.origin.iata_code ?? "N/A",
    destination: firstSegment?.destination.iata_code ?? "N/A",
    departure_time: firstSegment?.departing_at ?? "N/A",
    arrival_time: firstSegment?.arriving_at ?? "N/A",
    duration: firstSlice?.duration ?? "N/A",
    cabin_class: offer.cabin_class ?? "economy",
    price: {
      amount: isUsd
        ? offer.total_amount
        : toUsd(offer.total_amount, offer.total_currency),
      currency: "USD",
    },
  };
}

function getFallbackFlights(params: SearchParams): FlightOffer[] {
  const baseDate = params.date || "2026-03-15";

  return [
    {
      offer_id: `demo_${params.origin}_${params.destination}_001`,
      airline: "China Eastern Airlines",
      flight_number: "MU523",
      origin: params.origin,
      destination: params.destination,
      departure_time: `${baseDate}T08:30:00`,
      arrival_time: `${baseDate}T12:45:00`,
      duration: "PT3H15M",
      cabin_class: "economy",
      price: { amount: "1280.00", currency: "CNY" },
    },
    {
      offer_id: `demo_${params.origin}_${params.destination}_002`,
      airline: "All Nippon Airways",
      flight_number: "NH920",
      origin: params.origin,
      destination: params.destination,
      departure_time: `${baseDate}T10:15:00`,
      arrival_time: `${baseDate}T14:00:00`,
      duration: "PT2H45M",
      cabin_class: "economy",
      price: { amount: "2150.00", currency: "CNY" },
    },
    {
      offer_id: `demo_${params.origin}_${params.destination}_003`,
      airline: "Japan Airlines",
      flight_number: "JL876",
      origin: params.origin,
      destination: params.destination,
      departure_time: `${baseDate}T14:00:00`,
      arrival_time: `${baseDate}T17:30:00`,
      duration: "PT2H30M",
      cabin_class: "economy",
      price: { amount: "2380.00", currency: "CNY" },
    },
    {
      offer_id: `demo_${params.origin}_${params.destination}_004`,
      airline: "Spring Airlines",
      flight_number: "9C8515",
      origin: params.origin,
      destination: params.destination,
      departure_time: `${baseDate}T06:50:00`,
      arrival_time: `${baseDate}T10:40:00`,
      duration: "PT2H50M",
      cabin_class: "economy",
      price: { amount: "890.00", currency: "CNY" },
    },
  ];
}
