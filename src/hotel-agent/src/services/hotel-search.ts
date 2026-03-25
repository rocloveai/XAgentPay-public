import type { HotelOffer } from "../types.js";
import { isPoolInitialized } from "./db/pool.js";
import { findHotelsByCity } from "./db/hotel-template-repo.js";

interface SearchParams {
  readonly city: string;
  readonly check_in: string;
  readonly check_out: string;
  readonly guests: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// City name -> lowercase key for DB lookup
const CITY_KEYS: Record<string, string> = {
  tokyo: "tokyo",
  singapore: "singapore",
  bangkok: "bangkok",
  shanghai: "shanghai",
  "hong kong": "hong_kong",
  hongkong: "hong_kong",
  "hong_kong": "hong_kong",
};

export async function searchHotels(
  params: SearchParams,
): Promise<{
  offers: readonly HotelOffer[];
  nights: number;
  error?: string;
}> {
  if (!DATE_RE.test(params.check_in) || !DATE_RE.test(params.check_out)) {
    return { offers: [], nights: 0, error: "Dates must be in YYYY-MM-DD format" };
  }

  const checkIn = new Date(params.check_in);
  const checkOut = new Date(params.check_out);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return { offers: [], nights: 0, error: "Invalid date values" };
  }

  if (checkOut <= checkIn) {
    return { offers: [], nights: 0, error: "check_out must be after check_in" };
  }

  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
  );

  const cityKey = CITY_KEYS[params.city.toLowerCase().trim()]
    ?? params.city.toLowerCase().trim().replace(/\s+/g, "_");

  // Try DB templates first
  if (isPoolInitialized()) {
    try {
      const offers = await findHotelsByCity(cityKey);
      if (offers.length > 0) {
        return { offers, nights };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[HotelSearch] DB query failed: ${msg}`);
    }
  }

  return {
    offers: getFallbackHotels(params.city),
    nights,
    error: "No matching templates found, returning demo data",
  };
}

function getFallbackHotels(city: string): HotelOffer[] {
  return [
    {
      offer_id: `htl_${city.toLowerCase().replace(/\s+/g, "_")}_gen_001`,
      hotel_name: `Grand ${city} Hotel`,
      star_rating: 4,
      room_type: "Deluxe Double",
      location: `City Center, ${city}`,
      city,
      price_per_night: { amount: "0.10", currency: "USD" },
      amenities: ["WiFi", "Restaurant", "Gym"],
    },
    {
      offer_id: `htl_${city.toLowerCase().replace(/\s+/g, "_")}_gen_002`,
      hotel_name: `${city} Budget Inn`,
      star_rating: 3,
      room_type: "Standard Room",
      location: `Downtown, ${city}`,
      city,
      price_per_night: { amount: "0.10", currency: "USD" },
      amenities: ["WiFi"],
    },
  ];
}
