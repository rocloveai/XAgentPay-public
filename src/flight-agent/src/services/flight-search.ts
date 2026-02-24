import type { FlightOffer } from "../types.js";
import { isPoolInitialized } from "./db/pool.js";
import { findFlightsByRoute } from "./db/flight-template-repo.js";

interface SearchParams {
  readonly origin: string;
  readonly destination: string;
  readonly date: string;
  readonly passengers: number;
}

export async function searchFlights(
  params: SearchParams,
): Promise<{ offers: readonly FlightOffer[]; error?: string }> {
  // Try DB templates first
  if (isPoolInitialized()) {
    try {
      const offers = await findFlightsByRoute(
        params.origin,
        params.destination,
        params.date,
      );
      if (offers.length > 0) {
        return { offers };
      }
      // Route not in DB — fall through to hardcoded fallback
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[FlightSearch] DB query failed: ${msg}`);
    }
  }

  return {
    offers: getFallbackFlights(params),
    error: "No matching templates found, returning demo data",
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
      price: { amount: "320.00", currency: "USD" },
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
      price: { amount: "480.00", currency: "USD" },
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
      price: { amount: "520.00", currency: "USD" },
    },
  ];
}
