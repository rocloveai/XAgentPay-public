-- 001_initial_schema.sql
-- Shared schema for flight-agent and hotel-agent mock data + order persistence

-- flight_templates: departure/arrival stored as TIME only; search combines with user date
CREATE TABLE IF NOT EXISTS flight_templates (
  template_id    TEXT PRIMARY KEY,
  airline        TEXT NOT NULL,
  flight_number  TEXT NOT NULL,
  origin         TEXT NOT NULL,
  destination    TEXT NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time   TIME NOT NULL,
  duration       TEXT NOT NULL,
  cabin_class    TEXT NOT NULL DEFAULT 'economy',
  price_amount   TEXT NOT NULL,
  price_currency TEXT NOT NULL DEFAULT 'USD',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_route ON flight_templates (origin, destination) WHERE active = TRUE;

-- hotel_templates: nightly rate templates
CREATE TABLE IF NOT EXISTS hotel_templates (
  template_id              TEXT PRIMARY KEY,
  hotel_name               TEXT NOT NULL,
  star_rating              SMALLINT NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  room_type                TEXT NOT NULL,
  location                 TEXT NOT NULL,
  city                     TEXT NOT NULL,
  city_display             TEXT NOT NULL,
  price_per_night_amount   TEXT NOT NULL,
  price_per_night_currency TEXT NOT NULL DEFAULT 'USD',
  amenities                TEXT[] NOT NULL DEFAULT '{}',
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_city ON hotel_templates (city) WHERE active = TRUE;

-- orders: shared by both agents, distinguished by agent_type
CREATE TABLE IF NOT EXISTS orders (
  order_ref     TEXT PRIMARY KEY,
  agent_type    TEXT NOT NULL CHECK (agent_type IN ('flight', 'hotel')),
  status        TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID', 'EXPIRED')),
  quote_payload JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders (agent_type);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
