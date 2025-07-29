-- SQL to create the vass_associations table
-- This table links landingsplasser (landing places) with vass_vann (water bodies/airports)
-- Run this in your Supabase SQL editor to enable association functionality

CREATE TABLE IF NOT EXISTS vass_associations (
  id BIGSERIAL PRIMARY KEY,
  landingsplass_id BIGINT NOT NULL,
  airport_id BIGINT NOT NULL,
  content TEXT, -- Optional content/notes about the association
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints (optional - depends on your existing table structure)
  -- FOREIGN KEY (landingsplass_id) REFERENCES vass_lasteplass(id) ON DELETE CASCADE,
  -- FOREIGN KEY (airport_id) REFERENCES vass_vann(id) ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicate associations
  UNIQUE(landingsplass_id, airport_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vass_associations_landingsplass_id ON vass_associations(landingsplass_id);
CREATE INDEX IF NOT EXISTS idx_vass_associations_airport_id ON vass_associations(airport_id);

-- Enable Row Level Security (RLS) if needed
-- ALTER TABLE vass_associations ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for authenticated users (adjust as needed)
-- CREATE POLICY "Allow authenticated users to read associations" ON vass_associations
--   FOR SELECT TO authenticated USING (true);

-- CREATE POLICY "Allow authenticated users to insert associations" ON vass_associations
--   FOR INSERT TO authenticated WITH CHECK (true);

-- CREATE POLICY "Allow authenticated users to update associations" ON vass_associations
--   FOR UPDATE TO authenticated USING (true);

-- CREATE POLICY "Allow authenticated users to delete associations" ON vass_associations
--   FOR DELETE TO authenticated USING (true);

-- Example data to test the associations (adjust IDs to match your actual data)
-- INSERT INTO vass_associations (landingsplass_id, airport_id, content) VALUES
-- (1, 10, 'Test association between LP 1 and airport 10'),
-- (1, 15, 'Test association between LP 1 and airport 15'),
-- (2, 20, 'Test association between LP 2 and airport 20');

COMMENT ON TABLE vass_associations IS 'Links between landingsplasser and airports/water bodies';
COMMENT ON COLUMN vass_associations.landingsplass_id IS 'References vass_lasteplass.id';
COMMENT ON COLUMN vass_associations.airport_id IS 'References vass_vann.id';
COMMENT ON COLUMN vass_associations.content IS 'Optional notes about this association'; 