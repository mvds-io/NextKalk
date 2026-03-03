-- Planning Mode Migration
-- Adds planning mode functionality for landingsplass optimization
-- Created: 2025-11-19

-- ============================================================================
-- 1. Add planning mode column to landingsplasser tables
-- ============================================================================

-- Add to current table
ALTER TABLE vass_lasteplass
ADD COLUMN IF NOT EXISTS is_active_in_planning BOOLEAN DEFAULT true;

-- Add to archived table (2026)
ALTER TABLE "2026_vass_lasteplass"
ADD COLUMN IF NOT EXISTS is_active_in_planning BOOLEAN DEFAULT true;

-- Add index for planning queries
CREATE INDEX IF NOT EXISTS idx_vass_lasteplass_planning
ON vass_lasteplass(is_active_in_planning)
WHERE is_active_in_planning = true;

CREATE INDEX IF NOT EXISTS idx_2026_vass_lasteplass_planning
ON "2026_vass_lasteplass"(is_active_in_planning)
WHERE is_active_in_planning = true;

-- ============================================================================
-- 2. Create planning scenarios table
-- ============================================================================

CREATE TABLE IF NOT EXISTS planning_scenarios (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  year TEXT NOT NULL, -- Which year/archive this scenario is for
  total_distance_km NUMERIC,
  average_distance_km NUMERIC,
  num_active_landingsplasser INTEGER,
  num_vann INTEGER,

  -- Store the configuration as JSONB
  landingsplass_states JSONB NOT NULL, -- { "lp_id": { "active": true/false, "latitude": x, "longitude": y } }
  association_changes JSONB, -- Store reassignments { "vann_id": { "old_lp": x, "new_lp": y, "distance_change": z } }
  optimization_metadata JSONB, -- Store algorithm params, suggestions, etc.

  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS to planning_scenarios
ALTER TABLE planning_scenarios ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all scenarios
CREATE POLICY "Users can view all scenarios"
ON planning_scenarios
FOR SELECT
TO authenticated
USING (true);

-- Policy: Users with can_edit_markers can create scenarios
CREATE POLICY "Editors can create scenarios"
ON planning_scenarios
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.jwt() ->> 'email'
    AND users.can_edit_markers = true
  )
);

-- Policy: Users with can_edit_markers can update scenarios
CREATE POLICY "Editors can update scenarios"
ON planning_scenarios
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.jwt() ->> 'email'
    AND users.can_edit_markers = true
  )
);

-- Policy: Users with can_edit_markers can delete scenarios
CREATE POLICY "Editors can delete scenarios"
ON planning_scenarios
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.jwt() ->> 'email'
    AND users.can_edit_markers = true
  )
);

-- Add indexes for scenario queries
CREATE INDEX IF NOT EXISTS idx_planning_scenarios_year
ON planning_scenarios(year);

CREATE INDEX IF NOT EXISTS idx_planning_scenarios_created_by
ON planning_scenarios(created_by);

CREATE INDEX IF NOT EXISTS idx_planning_scenarios_created_at
ON planning_scenarios(created_at DESC);

-- ============================================================================
-- 3. Create temporary planning associations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS planning_associations_temp (
  id BIGSERIAL PRIMARY KEY,
  scenario_id BIGINT REFERENCES planning_scenarios(id) ON DELETE CASCADE,
  airport_id BIGINT NOT NULL,
  landingsplass_id BIGINT NOT NULL,
  distance_km NUMERIC,
  is_reassigned BOOLEAN DEFAULT false, -- True if this is a new assignment due to deactivation
  previous_landingsplass_id BIGINT, -- Previous LP if reassigned
  distance_change_km NUMERIC, -- Difference from previous distance
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS
ALTER TABLE planning_associations_temp ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read temp associations
CREATE POLICY "Users can view temp associations"
ON planning_associations_temp
FOR SELECT
TO authenticated
USING (true);

-- Policy: Users with can_edit_markers can manage temp associations
CREATE POLICY "Editors can manage temp associations"
ON planning_associations_temp
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.email = auth.jwt() ->> 'email'
    AND users.can_edit_markers = true
  )
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_planning_associations_scenario
ON planning_associations_temp(scenario_id);

CREATE INDEX IF NOT EXISTS idx_planning_associations_airport
ON planning_associations_temp(airport_id);

CREATE INDEX IF NOT EXISTS idx_planning_associations_lp
ON planning_associations_temp(landingsplass_id);

-- ============================================================================
-- 4. Add comparison metadata columns to associations
-- ============================================================================

-- Add optional fields to track optimization metrics
ALTER TABLE vass_associations
ADD COLUMN IF NOT EXISTS optimization_score NUMERIC,
ADD COLUMN IF NOT EXISTS is_optimal BOOLEAN DEFAULT true;

ALTER TABLE "2026_vass_associations"
ADD COLUMN IF NOT EXISTS optimization_score NUMERIC,
ADD COLUMN IF NOT EXISTS is_optimal BOOLEAN DEFAULT true;

-- ============================================================================
-- 5. Create helper function to calculate total distances
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_total_distance_for_year(table_prefix TEXT)
RETURNS TABLE(
  total_distance_km NUMERIC,
  average_distance_km NUMERIC,
  max_distance_km NUMERIC,
  min_distance_km NUMERIC,
  num_associations BIGINT
) AS $$
DECLARE
  associations_table TEXT;
BEGIN
  -- Build table name
  IF table_prefix = '' OR table_prefix IS NULL THEN
    associations_table := 'vass_associations';
  ELSE
    associations_table := table_prefix || '_vass_associations';
  END IF;

  -- Return aggregated statistics
  RETURN QUERY EXECUTE format('
    SELECT
      COALESCE(SUM(distance_km), 0) as total_distance_km,
      COALESCE(AVG(distance_km), 0) as average_distance_km,
      COALESCE(MAX(distance_km), 0) as max_distance_km,
      COALESCE(MIN(distance_km), 0) as min_distance_km,
      COUNT(*)::BIGINT as num_associations
    FROM %I
    WHERE distance_km IS NOT NULL
  ', associations_table);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Create helper function to find closest landingsplass
-- ============================================================================

CREATE OR REPLACE FUNCTION find_closest_landingsplass(
  vann_lat DOUBLE PRECISION,
  vann_lon DOUBLE PRECISION,
  excluded_lp_ids BIGINT[],
  table_prefix TEXT DEFAULT ''
)
RETURNS TABLE(
  lp_id BIGINT,
  lp_name TEXT,
  distance_km NUMERIC
) AS $$
DECLARE
  lp_table TEXT;
BEGIN
  -- Build table name
  IF table_prefix = '' OR table_prefix IS NULL THEN
    lp_table := 'vass_lasteplass';
  ELSE
    lp_table := table_prefix || '_vass_lasteplass';
  END IF;

  -- Find closest landingsplass using Haversine formula
  RETURN QUERY EXECUTE format('
    SELECT
      id as lp_id,
      lp as lp_name,
      (
        6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )
      )::NUMERIC as distance_km
    FROM %I
    WHERE
      latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND is_active_in_planning = true
      AND NOT (id = ANY($3))
    ORDER BY distance_km ASC
    LIMIT 1
  ', lp_table)
  USING vann_lat, vann_lon, excluded_lp_ids;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Grant permissions
-- ============================================================================

GRANT SELECT ON planning_scenarios TO authenticated;
GRANT INSERT, UPDATE, DELETE ON planning_scenarios TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE planning_scenarios_id_seq TO authenticated;

GRANT SELECT ON planning_associations_temp TO authenticated;
GRANT INSERT, UPDATE, DELETE ON planning_associations_temp TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE planning_associations_temp_id_seq TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Insert a record to track this migration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'migration_history') THEN
    CREATE TABLE migration_history (
      id SERIAL PRIMARY KEY,
      migration_name TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;

  INSERT INTO migration_history (migration_name)
  VALUES ('planning_mode_migration_2025_11_19');
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Planning mode migration completed successfully!';
  RAISE NOTICE 'Added columns: is_active_in_planning';
  RAISE NOTICE 'Created tables: planning_scenarios, planning_associations_temp';
  RAISE NOTICE 'Created functions: calculate_total_distance_for_year, find_closest_landingsplass';
END $$;
