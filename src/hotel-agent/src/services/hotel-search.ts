import type { HotelOffer } from "../types.js";

interface SearchParams {
  readonly city: string;
  readonly check_in: string;
  readonly check_out: string;
  readonly guests: number;
}

// Mock hotel database with realistic data for popular travel cities
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
    {
      offer_id: "htl_tokyo_003",
      hotel_name: "Dormy Inn Akihabara",
      star_rating: 3,
      room_type: "Standard Twin",
      location: "Akihabara, Taito",
      city: "Tokyo",
      price_per_night: { amount: "95.00", currency: "USD" },
      amenities: ["WiFi", "Hot Spring Bath", "Laundry"],
    },
    {
      offer_id: "htl_tokyo_004",
      hotel_name: "Aman Tokyo",
      star_rating: 5,
      room_type: "Premier Room",
      location: "Otemachi Tower, Chiyoda",
      city: "Tokyo",
      price_per_night: { amount: "890.00", currency: "USD" },
      amenities: ["WiFi", "Spa", "Pool", "Restaurant", "Bar", "Gym"],
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
    {
      offer_id: "htl_sg_002",
      hotel_name: "YOTEL Singapore",
      star_rating: 4,
      room_type: "Premium Queen Cabin",
      location: "Orchard Road",
      city: "Singapore",
      price_per_night: { amount: "160.00", currency: "USD" },
      amenities: ["WiFi", "Pool", "Gym", "Co-working"],
    },
    {
      offer_id: "htl_sg_003",
      hotel_name: "Raffles Hotel Singapore",
      star_rating: 5,
      room_type: "State Suite",
      location: "Beach Road, Downtown",
      city: "Singapore",
      price_per_night: { amount: "980.00", currency: "USD" },
      amenities: ["WiFi", "Spa", "Pool", "Butler Service", "Restaurant"],
    },
  ],
  bangkok: [
    {
      offer_id: "htl_bkk_001",
      hotel_name: "The Sukhothai Bangkok",
      star_rating: 5,
      room_type: "Deluxe Room",
      location: "Sathorn Road",
      city: "Bangkok",
      price_per_night: { amount: "210.00", currency: "USD" },
      amenities: ["WiFi", "Spa", "Pool", "Restaurant", "Gym"],
    },
    {
      offer_id: "htl_bkk_002",
      hotel_name: "ibis Bangkok Siam",
      star_rating: 3,
      room_type: "Standard Room",
      location: "Siam Square",
      city: "Bangkok",
      price_per_night: { amount: "55.00", currency: "USD" },
      amenities: ["WiFi", "Restaurant"],
    },
    {
      offer_id: "htl_bkk_003",
      hotel_name: "Mandarin Oriental Bangkok",
      star_rating: 5,
      room_type: "Superior Room",
      location: "Riverside, Charoenkrung",
      city: "Bangkok",
      price_per_night: { amount: "380.00", currency: "USD" },
      amenities: ["WiFi", "Spa", "Pool", "Restaurant", "River View"],
    },
  ],
  shanghai: [
    {
      offer_id: "htl_sha_001",
      hotel_name: "The Bund Hotel Shanghai",
      star_rating: 4,
      room_type: "River View Double",
      location: "The Bund, Huangpu",
      city: "Shanghai",
      price_per_night: { amount: "175.00", currency: "USD" },
      amenities: ["WiFi", "Restaurant", "Bar", "River View"],
    },
    {
      offer_id: "htl_sha_002",
      hotel_name: "Park Hyatt Shanghai",
      star_rating: 5,
      room_type: "Park Deluxe King",
      location: "Shanghai World Financial Center, Pudong",
      city: "Shanghai",
      price_per_night: { amount: "420.00", currency: "USD" },
      amenities: ["WiFi", "Spa", "Pool", "Restaurant", "Sky Lounge"],
    },
    {
      offer_id: "htl_sha_003",
      hotel_name: "Hanting Hotel Nanjing Road",
      star_rating: 3,
      room_type: "Standard Queen",
      location: "Nanjing East Road, Huangpu",
      city: "Shanghai",
      price_per_night: { amount: "60.00", currency: "USD" },
      amenities: ["WiFi", "Laundry"],
    },
  ],
};

// Generic fallback hotels for any city
function getGenericHotels(city: string): HotelOffer[] {
  return [
    {
      offer_id: `htl_${city.toLowerCase().replace(/\s+/g, "_")}_gen_001`,
      hotel_name: `Grand ${city} Hotel`,
      star_rating: 4,
      room_type: "Deluxe Double",
      location: `City Center, ${city}`,
      city,
      price_per_night: { amount: "150.00", currency: "USD" },
      amenities: ["WiFi", "Restaurant", "Gym"],
    },
    {
      offer_id: `htl_${city.toLowerCase().replace(/\s+/g, "_")}_gen_002`,
      hotel_name: `${city} Budget Inn`,
      star_rating: 3,
      room_type: "Standard Room",
      location: `Downtown, ${city}`,
      city,
      price_per_night: { amount: "70.00", currency: "USD" },
      amenities: ["WiFi"],
    },
    {
      offer_id: `htl_${city.toLowerCase().replace(/\s+/g, "_")}_gen_003`,
      hotel_name: `The Ritz ${city}`,
      star_rating: 5,
      room_type: "Premier Suite",
      location: `Luxury District, ${city}`,
      city,
      price_per_night: { amount: "600.00", currency: "USD" },
      amenities: ["WiFi", "Spa", "Pool", "Restaurant", "Bar", "Concierge"],
    },
  ];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function searchHotels(params: SearchParams): {
  offers: readonly HotelOffer[];
  nights: number;
  error?: string;
} {
  if (!DATE_RE.test(params.check_in) || !DATE_RE.test(params.check_out)) {
    return {
      offers: [],
      nights: 0,
      error: "Dates must be in YYYY-MM-DD format",
    };
  }

  const checkIn = new Date(params.check_in);
  const checkOut = new Date(params.check_out);

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    return { offers: [], nights: 0, error: "Invalid date values" };
  }

  if (checkOut <= checkIn) {
    return { offers: [], nights: 0, error: "check_out must be after check_in" };
  }

  const cityKey = params.city.toLowerCase().trim();
  const offers = MOCK_HOTELS[cityKey] ?? getGenericHotels(params.city);

  const nights = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { offers, nights };
}
