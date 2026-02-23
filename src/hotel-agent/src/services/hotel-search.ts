import type { HotelOffer } from "../types.js";
import { getAccessToken, amadeusGet } from "./amadeus-client.js";

interface SearchParams {
  readonly city: string;
  readonly check_in: string;
  readonly check_out: string;
  readonly guests: number;
}

// City name -> IATA city code mapping
const CITY_CODES: Record<string, string> = {
  tokyo: "TYO",
  singapore: "SIN",
  bangkok: "BKK",
  shanghai: "SHA",
  beijing: "BJS",
  "hong kong": "HKG",
  hongkong: "HKG",
  osaka: "OSA",
  seoul: "SEL",
  taipei: "TPE",
  "kuala lumpur": "KUL",
  jakarta: "JKT",
  manila: "MNL",
  hanoi: "HAN",
  "ho chi minh": "SGN",
  london: "LON",
  paris: "PAR",
  "new york": "NYC",
  "los angeles": "LAX",
  dubai: "DXB",
  sydney: "SYD",
};

// ── Amadeus API response types ──────────────────────────────────────────────

interface AmadeusHotelListItem {
  readonly hotelId: string;
  readonly name: string;
}

interface AmadeusHotelListResponse {
  readonly data: readonly AmadeusHotelListItem[];
}

interface AmadeusHotelOffer {
  readonly hotel: {
    readonly hotelId: string;
    readonly name: string;
    readonly rating?: string;
    readonly cityCode: string;
    readonly address?: {
      readonly lines?: readonly string[];
    };
    readonly amenities?: readonly string[];
  };
  readonly offers: ReadonlyArray<{
    readonly id: string;
    readonly room: {
      readonly typeEstimated?: {
        readonly category?: string;
        readonly beds?: number;
        readonly bedType?: string;
      };
      readonly description?: {
        readonly text?: string;
      };
    };
    readonly price: {
      readonly total: string;
      readonly currency: string;
    };
  }>;
}

interface AmadeusHotelOffersResponse {
  readonly data: readonly AmadeusHotelOffer[];
}

// ── Main search function ────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function searchHotels(
  params: SearchParams,
  apiKey: string,
  apiSecret: string,
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

  if (!apiKey || !apiSecret) {
    return {
      offers: getFallbackHotels(params.city),
      nights,
      error: "No Amadeus API credentials configured, returning demo data",
    };
  }

  try {
    const offers = await searchAmadeus(params, nights, apiKey, apiSecret);
    if (offers.length === 0) {
      return {
        offers: getFallbackHotels(params.city),
        nights,
        error: `No Amadeus results for "${params.city}", returning demo data`,
      };
    }
    return { offers, nights };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Amadeus API error: ${message}`);
    return {
      offers: getFallbackHotels(params.city),
      nights,
      error: `Amadeus API failed: ${message}, returning demo data`,
    };
  }
}

// ── Amadeus integration ─────────────────────────────────────────────────────

async function searchAmadeus(
  params: SearchParams,
  nights: number,
  apiKey: string,
  apiSecret: string,
): Promise<HotelOffer[]> {
  const token = await getAccessToken(apiKey, apiSecret);

  const cityKey = params.city.toLowerCase().trim();
  const cityCode = CITY_CODES[cityKey] ?? cityKey.toUpperCase().slice(0, 3);

  // Step 1: Get hotel IDs for the city
  const hotelList = await amadeusGet<AmadeusHotelListResponse>(
    token,
    "/v1/reference-data/locations/hotels/by-city",
    { cityCode, radius: "30", radiusUnit: "KM" },
  );

  if (!hotelList.data || hotelList.data.length === 0) {
    return [];
  }

  // Take top 8 hotels to avoid rate limits
  const hotelIds = hotelList.data.slice(0, 8).map((h) => h.hotelId);

  // Step 2: Get offers for those hotels
  const offersResponse = await amadeusGet<AmadeusHotelOffersResponse>(
    token,
    "/v3/shopping/hotel-offers",
    {
      hotelIds: hotelIds.join(","),
      checkInDate: params.check_in,
      checkOutDate: params.check_out,
      adults: String(params.guests),
      currency: "USD",
    },
  );

  if (!offersResponse.data) {
    return [];
  }

  return offersResponse.data
    .filter((h) => h.offers.length > 0)
    .slice(0, 6)
    .map((h) => mapAmadeusOffer(h, nights));
}

function mapAmadeusOffer(
  hotelOffer: AmadeusHotelOffer,
  nights: number,
): HotelOffer {
  const hotel = hotelOffer.hotel;
  const offer = hotelOffer.offers[0];
  const totalPrice = parseFloat(offer.price.total);
  const pricePerNight = (totalPrice / nights).toFixed(2);

  const roomType =
    offer.room.typeEstimated?.category ??
    offer.room.description?.text?.slice(0, 40) ??
    "Standard Room";

  const rating = hotel.rating ? parseInt(hotel.rating, 10) : 3;
  const location = hotel.address?.lines?.[0] ?? hotel.cityCode;

  const amenityMap: Record<string, string> = {
    SWIMMING_POOL: "Pool",
    FITNESS_CENTER: "Gym",
    SPA: "Spa",
    RESTAURANT: "Restaurant",
    WIFI: "WiFi",
    ROOM_SERVICE: "Room Service",
    BAR_OR_LOUNGE: "Bar",
    PARKING: "Parking",
    AIR_CONDITIONING: "A/C",
    BUSINESS_CENTER: "Business Center",
  };

  const amenities = (hotel.amenities ?? [])
    .map((a) => amenityMap[a])
    .filter((a): a is string => a !== undefined)
    .slice(0, 5);

  if (amenities.length === 0) {
    amenities.push("WiFi");
  }

  return {
    offer_id: `amd_${hotel.hotelId}_${offer.id}`,
    hotel_name: hotel.name,
    star_rating: Math.min(Math.max(rating, 1), 5),
    room_type: roomType,
    location,
    city: hotel.cityCode,
    price_per_night: {
      amount: pricePerNight,
      currency: offer.price.currency,
    },
    amenities,
  };
}

// ── Fallback mock data ──────────────────────────────────────────────────────

const MOCK_HOTELS: Record<string, readonly HotelOffer[]> = {
  tokyo: [
    {
      offer_id: "htl_tokyo_001",
      hotel_name: "Hotel Gracery Shinjuku",
      star_rating: 4,
      room_type: "Superior Double",
      location: "Shinjuku, Kabukicho",
      city: "Tokyo",
      price_per_night: { amount: "185.00", currency: "USD" },
      amenities: ["WiFi", "Restaurant", "Fitness Center"],
    },
    {
      offer_id: "htl_tokyo_002",
      hotel_name: "The Peninsula Tokyo",
      star_rating: 5,
      room_type: "Deluxe Room",
      location: "Marunouchi, Chiyoda",
      city: "Tokyo",
      price_per_night: { amount: "520.00", currency: "USD" },
      amenities: ["WiFi", "Spa", "Pool", "Restaurant", "Concierge"],
    },
  ],
  singapore: [
    {
      offer_id: "htl_sg_001",
      hotel_name: "Marina Bay Sands",
      star_rating: 5,
      room_type: "Deluxe Room",
      location: "Marina Bay",
      city: "Singapore",
      price_per_night: { amount: "450.00", currency: "USD" },
      amenities: ["WiFi", "Infinity Pool", "Casino", "Restaurant", "Spa"],
    },
  ],
};

function getFallbackHotels(city: string): HotelOffer[] {
  const cityKey = city.toLowerCase().trim();
  const known = MOCK_HOTELS[cityKey];
  if (known) return [...known];

  return [
    {
      offer_id: `htl_${cityKey.replace(/\s+/g, "_")}_gen_001`,
      hotel_name: `Grand ${city} Hotel`,
      star_rating: 4,
      room_type: "Deluxe Double",
      location: `City Center, ${city}`,
      city,
      price_per_night: { amount: "150.00", currency: "USD" },
      amenities: ["WiFi", "Restaurant", "Gym"],
    },
    {
      offer_id: `htl_${cityKey.replace(/\s+/g, "_")}_gen_002`,
      hotel_name: `${city} Budget Inn`,
      star_rating: 3,
      room_type: "Standard Room",
      location: `Downtown, ${city}`,
      city,
      price_per_night: { amount: "70.00", currency: "USD" },
      amenities: ["WiFi"],
    },
  ];
}
