import { getPool } from "./pool.js";
import type { HotelOffer } from "../../types.js";

interface HotelTemplateRow {
  readonly template_id: string;
  readonly hotel_name: string;
  readonly star_rating: number;
  readonly room_type: string;
  readonly location: string;
  readonly city: string;
  readonly city_display: string;
  readonly price_per_night_amount: string;
  readonly price_per_night_currency: string;
  readonly amenities: readonly string[];
}

/**
 * Query hotel templates by city key (lowercase, e.g. "tokyo").
 */
export async function findHotelsByCity(
  city: string,
): Promise<readonly HotelOffer[]> {
  const sql = getPool();
  const rows = await sql(
    `SELECT template_id, hotel_name, star_rating, room_type,
            location, city, city_display,
            price_per_night_amount, price_per_night_currency, amenities
     FROM hotel_templates
     WHERE city = $1 AND active = TRUE
     ORDER BY price_per_night_amount::numeric`,
    [city],
  );

  return (rows as unknown as HotelTemplateRow[]).map((row) => ({
    offer_id: row.template_id,
    hotel_name: row.hotel_name,
    star_rating: row.star_rating,
    room_type: row.room_type,
    location: row.location,
    city: row.city_display,
    price_per_night: {
      amount: row.price_per_night_amount,
      currency: row.price_per_night_currency,
    },
    amenities: [...row.amenities],
  }));
}
