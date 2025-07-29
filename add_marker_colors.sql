-- Add marker color support to vass_vann table
-- Run this script in your Supabase SQL editor to add color support for airport markers

-- Add color column to vass_vann table
ALTER TABLE vass_vann ADD COLUMN IF NOT EXISTS marker_color TEXT DEFAULT 'red';

-- Create index for better performance when filtering by color
CREATE INDEX IF NOT EXISTS idx_vass_vann_marker_color ON vass_vann(marker_color);

-- Optional: Update existing markers to have default colors
-- You can modify these colors based on your preferences
UPDATE vass_vann SET marker_color = 'red' WHERE marker_color IS NULL;

-- Comments about available colors for reference:
-- Available marker colors for L.AwesomeMarkers:
-- 'red', 'darkred', 'orange', 'green', 'darkgreen', 'blue', 'purple', 'darkpurple', 'cadetblue' 