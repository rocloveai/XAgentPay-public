-- seed-hotels.sql
-- Cities: tokyo, singapore, shanghai, bangkok, hong_kong

INSERT INTO hotel_templates (template_id, hotel_name, star_rating, room_type, location, city, city_display, price_per_night_amount, amenities)
VALUES
  -- Tokyo (3 hotels)
  ('htl_tokyo_01', 'Hotel Gracery Shinjuku',   4, 'Superior Double',   'Shinjuku, Kabukicho',    'tokyo', 'Tokyo', '185.00', ARRAY['WiFi','Restaurant','Gym']),
  ('htl_tokyo_02', 'The Peninsula Tokyo',       5, 'Deluxe Room',       'Marunouchi, Chiyoda',    'tokyo', 'Tokyo', '520.00', ARRAY['WiFi','Spa','Pool','Restaurant','Concierge']),
  ('htl_tokyo_03', 'Tokyu Stay Shinjuku',       3, 'Standard Twin',     'Shinjuku Sanchome',      'tokyo', 'Tokyo', '95.00',  ARRAY['WiFi','Laundry','Kitchenette']),

  -- Singapore (3 hotels)
  ('htl_sg_01', 'Marina Bay Sands',             5, 'Deluxe Room',       'Marina Bay',             'singapore', 'Singapore', '450.00', ARRAY['WiFi','Infinity Pool','Casino','Restaurant','Spa']),
  ('htl_sg_02', 'Parkroyal Collection Pickering',4, 'Superior Room',    'Chinatown',              'singapore', 'Singapore', '220.00', ARRAY['WiFi','Pool','Gym','Restaurant']),
  ('htl_sg_03', 'ibis budget Singapore',        2, 'Standard Room',     'Bugis, Bencoolen St',    'singapore', 'Singapore', '75.00',  ARRAY['WiFi','24h Reception']),

  -- Shanghai (3 hotels)
  ('htl_sha_01', 'The Bund Hotel Shanghai',     5, 'Premier River View','The Bund, Huangpu',      'shanghai', 'Shanghai', '380.00', ARRAY['WiFi','Spa','Pool','Restaurant','Bar']),
  ('htl_sha_02', 'Jin Jiang Tower',             4, 'Superior King',     'Luwan, Huaihai Rd',      'shanghai', 'Shanghai', '160.00', ARRAY['WiFi','Restaurant','Gym','Business Center']),
  ('htl_sha_03', 'Home Inn Pudong Airport',     2, 'Standard Double',   'Pudong, Near PVG',       'shanghai', 'Shanghai', '55.00',  ARRAY['WiFi','Shuttle']),

  -- Bangkok (3 hotels)
  ('htl_bkk_01', 'Mandarin Oriental Bangkok',   5, 'Premier Room',      'Riverside, Charoen Krung','bangkok', 'Bangkok', '350.00', ARRAY['WiFi','Spa','Pool','Restaurant','Butler']),
  ('htl_bkk_02', 'Ibis Styles Bangkok Sukhumvit',3,'Standard Room',     'Sukhumvit Soi 4',        'bangkok', 'Bangkok', '65.00',  ARRAY['WiFi','Pool','Restaurant']),
  ('htl_bkk_03', 'Centara Grand at Central World',5,'Deluxe World Room','Ratchadamri, Pathum Wan', 'bangkok', 'Bangkok', '210.00', ARRAY['WiFi','Pool','Spa','Gym','Restaurant']),

  -- Hong Kong (2 hotels)
  ('htl_hk_01', 'The Ritz-Carlton Hong Kong',   5, 'Deluxe Room',       'West Kowloon, ICC',      'hong_kong', 'Hong Kong', '480.00', ARRAY['WiFi','Spa','Pool','Restaurant','Bar']),
  ('htl_hk_02', 'Butterfly on Prat',            3, 'Superior Room',     'Tsim Sha Tsui',          'hong_kong', 'Hong Kong', '120.00', ARRAY['WiFi','Laundry'])

ON CONFLICT (template_id) DO NOTHING;
