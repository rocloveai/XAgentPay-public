import { getPool } from "./pool.js";
import type { FlightOffer } from "../../types.js";

interface FlightTemplateRow {
  readonly template_id: string;
  readonly airline: string;
  readonly flight_number: string;
  readonly origin: string;
  readonly destination: string;
  readonly departure_time: string; // TIME as string "HH:MM:SS"
  readonly arrival_time: string;
  readonly duration: string;
  readonly cabin_class: string;
  readonly price_amount: string;
  readonly price_currency: string;
}

/**
 * Query flight templates by route and combine with the user's requested date.
 * departure_time/arrival_time are TIME columns; we prepend the date.
 */
export async function findFlightsByRoute(
  origin: string,
  destination: string,
  date: string,
): Promise<readonly FlightOffer[]> {
  const sql = getPool();
  const rows = await sql(
    `SELECT template_id, airline, flight_number, origin, destination,
            departure_time::text, arrival_time::text,
            duration, cabin_class, price_amount, price_currency
     FROM flight_templates
     WHERE origin = $1 AND destination = $2 AND active = TRUE
     ORDER BY departure_time`,
    [origin, destination],
  );

  return (rows as unknown as FlightTemplateRow[]).map((row) => ({
    offer_id: row.template_id,
    airline: row.airline,
    flight_number: row.flight_number,
    origin: row.origin,
    destination: row.destination,
    departure_time: `${date}T${row.departure_time}`,
    arrival_time: `${date}T${row.arrival_time}`,
    duration: row.duration,
    cabin_class: row.cabin_class,
    price: {
      amount: row.price_amount,
      currency: row.price_currency,
    },
  }));
}
