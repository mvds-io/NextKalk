-- Hazards (Farer) — global table for flight hazards (powerlines, wires, no-fly zones)
-- Pilots draw a circle (lat/lng + radius) or polyline (array of lat/lng points)
-- on the map and attach a short description. Visible to all authenticated users;
-- only users with can_edit_markers=true may insert/update/delete.
--
-- Geometry stored as JSONB:
--   circle:   { "lat": <num>, "lng": <num>, "radius_m": <num> }
--   polyline: { "points": [{ "lat": <num>, "lng": <num> }, ...] }

CREATE TABLE IF NOT EXISTS hazards (
  id BIGSERIAL PRIMARY KEY,
  geometry_type TEXT NOT NULL CHECK (geometry_type IN ('circle','polyline')),
  geometry JSONB NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hazards_created_at ON hazards(created_at DESC);

ALTER TABLE hazards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all hazards" ON hazards
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Editors can insert hazards" ON hazards
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.jwt() ->> 'email'
      AND users.can_edit_markers = true
    )
  );

CREATE POLICY "Editors can update hazards" ON hazards
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.jwt() ->> 'email'
      AND users.can_edit_markers = true
    )
  );

CREATE POLICY "Editors can delete hazards" ON hazards
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.email = auth.jwt() ->> 'email'
      AND users.can_edit_markers = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON hazards TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hazards_id_seq TO authenticated;
