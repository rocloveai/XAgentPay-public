-- seed-flights.sql
-- Hot routes: PVG-NRT, SIN-PVG, PVG-HKG, SIN-NRT, SIN-BKK (+ reverse)

INSERT INTO flight_templates (template_id, airline, flight_number, origin, destination, departure_time, arrival_time, duration, cabin_class, price_amount)
VALUES
  -- PVG <-> NRT (Shanghai - Tokyo)
  ('flt_pvg_nrt_01', 'China Eastern Airlines', 'MU523',  'PVG', 'NRT', '08:30', '12:45', 'PT3H15M', 'economy', '320.00'),
  ('flt_pvg_nrt_02', 'All Nippon Airways',     'NH920',  'PVG', 'NRT', '10:15', '14:00', 'PT2H45M', 'economy', '480.00'),
  ('flt_pvg_nrt_03', 'Japan Airlines',          'JL876',  'PVG', 'NRT', '14:00', '17:30', 'PT2H30M', 'economy', '520.00'),
  ('flt_pvg_nrt_04', 'Spring Airlines',         '9C8515', 'PVG', 'NRT', '06:50', '10:40', 'PT2H50M', 'economy', '185.00'),

  ('flt_nrt_pvg_01', 'China Eastern Airlines', 'MU524',  'NRT', 'PVG', '13:30', '16:00', 'PT3H30M', 'economy', '310.00'),
  ('flt_nrt_pvg_02', 'All Nippon Airways',     'NH921',  'NRT', 'PVG', '15:00', '17:30', 'PT3H30M', 'economy', '470.00'),
  ('flt_nrt_pvg_03', 'Japan Airlines',          'JL875',  'NRT', 'PVG', '18:30', '21:00', 'PT3H30M', 'economy', '510.00'),
  ('flt_nrt_pvg_04', 'Peach Aviation',          'MM897',  'NRT', 'PVG', '09:20', '12:10', 'PT3H50M', 'economy', '165.00'),

  -- SIN <-> PVG (Singapore - Shanghai)
  ('flt_sin_pvg_01', 'Singapore Airlines', 'SQ830',  'SIN', 'PVG', '08:00', '13:30', 'PT5H30M', 'economy', '380.00'),
  ('flt_sin_pvg_02', 'China Eastern Airlines', 'MU546', 'SIN', 'PVG', '14:15', '19:45', 'PT5H30M', 'economy', '290.00'),
  ('flt_sin_pvg_03', 'Scoot',              'TR100',  'SIN', 'PVG', '01:30', '07:00', 'PT5H30M', 'economy', '195.00'),
  ('flt_sin_pvg_04', 'Juneyao Airlines',   'HO1606', 'SIN', 'PVG', '10:40', '16:10', 'PT5H30M', 'economy', '245.00'),

  ('flt_pvg_sin_01', 'Singapore Airlines', 'SQ831',  'PVG', 'SIN', '15:00', '20:30', 'PT5H30M', 'economy', '390.00'),
  ('flt_pvg_sin_02', 'China Eastern Airlines', 'MU545', 'PVG', 'SIN', '09:30', '15:00', 'PT5H30M', 'economy', '280.00'),
  ('flt_pvg_sin_03', 'Scoot',              'TR101',  'PVG', 'SIN', '08:00', '13:30', 'PT5H30M', 'economy', '190.00'),
  ('flt_pvg_sin_04', 'Juneyao Airlines',   'HO1605', 'PVG', 'SIN', '18:00', '23:30', 'PT5H30M', 'economy', '240.00'),

  -- PVG <-> HKG (Shanghai - Hong Kong)
  ('flt_pvg_hkg_01', 'Cathay Pacific',     'CX365',  'PVG', 'HKG', '09:00', '11:30', 'PT2H30M', 'economy', '250.00'),
  ('flt_pvg_hkg_02', 'China Eastern Airlines', 'MU725', 'PVG', 'HKG', '13:00', '15:30', 'PT2H30M', 'economy', '195.00'),
  ('flt_pvg_hkg_03', 'HK Express',         'UO803',  'PVG', 'HKG', '17:30', '20:00', 'PT2H30M', 'economy', '140.00'),

  ('flt_hkg_pvg_01', 'Cathay Pacific',     'CX366',  'HKG', 'PVG', '12:00', '14:30', 'PT2H30M', 'economy', '260.00'),
  ('flt_hkg_pvg_02', 'China Eastern Airlines', 'MU726', 'HKG', 'PVG', '16:00', '18:30', 'PT2H30M', 'economy', '200.00'),
  ('flt_hkg_pvg_03', 'HK Express',         'UO804',  'HKG', 'PVG', '21:00', '23:30', 'PT2H30M', 'economy', '135.00'),

  -- SIN <-> NRT (Singapore - Tokyo)
  ('flt_sin_nrt_01', 'Singapore Airlines', 'SQ12',   'SIN', 'NRT', '08:30', '16:30', 'PT7H00M', 'economy', '450.00'),
  ('flt_sin_nrt_02', 'Japan Airlines',     'JL710',  'SIN', 'NRT', '10:00', '18:00', 'PT7H00M', 'economy', '420.00'),
  ('flt_sin_nrt_03', 'Scoot',              'TR808',  'SIN', 'NRT', '23:30', '07:30', 'PT7H00M', 'economy', '280.00'),

  ('flt_nrt_sin_01', 'Singapore Airlines', 'SQ11',   'NRT', 'SIN', '18:00', '00:30', 'PT7H30M', 'economy', '460.00'),
  ('flt_nrt_sin_02', 'Japan Airlines',     'JL711',  'NRT', 'SIN', '11:00', '17:30', 'PT7H30M', 'economy', '430.00'),
  ('flt_nrt_sin_03', 'Scoot',              'TR809',  'NRT', 'SIN', '09:00', '15:30', 'PT7H30M', 'economy', '275.00'),

  -- SIN <-> BKK (Singapore - Bangkok)
  ('flt_sin_bkk_01', 'Singapore Airlines', 'SQ972',  'SIN', 'BKK', '07:30', '09:00', 'PT2H30M', 'economy', '180.00'),
  ('flt_sin_bkk_02', 'Thai Airways',       'TG404',  'SIN', 'BKK', '12:00', '13:30', 'PT2H30M', 'economy', '210.00'),
  ('flt_sin_bkk_03', 'AirAsia',            'AK702',  'SIN', 'BKK', '06:00', '07:30', 'PT2H30M', 'economy', '95.00'),

  ('flt_bkk_sin_01', 'Singapore Airlines', 'SQ973',  'BKK', 'SIN', '10:00', '13:30', 'PT2H30M', 'economy', '175.00'),
  ('flt_bkk_sin_02', 'Thai Airways',       'TG405',  'BKK', 'SIN', '14:30', '18:00', 'PT2H30M', 'economy', '205.00'),
  ('flt_bkk_sin_03', 'AirAsia',            'AK703',  'BKK', 'SIN', '08:30', '12:00', 'PT2H30M', 'economy', '90.00')

ON CONFLICT (template_id) DO NOTHING;
