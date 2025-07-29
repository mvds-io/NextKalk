-- Create marker_images table for storing uploaded images
-- Run this in your Supabase SQL editor to enable image upload functionality

CREATE TABLE IF NOT EXISTS marker_images (
  id BIGSERIAL PRIMARY KEY,
  marker_id BIGINT NOT NULL,
  marker_type TEXT NOT NULL, -- 'airport', 'landingsplass', 'kalk'
  image_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by TEXT, -- User email who uploaded the image
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_marker_images_marker_id ON marker_images(marker_id);
CREATE INDEX IF NOT EXISTS idx_marker_images_marker_type ON marker_images(marker_type);
CREATE INDEX IF NOT EXISTS idx_marker_images_created_at ON marker_images(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE marker_images ENABLE ROW LEVEL SECURITY;

-- Create policies for marker_images
CREATE POLICY "Enable read access for all authenticated users" ON marker_images
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users" ON marker_images
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for users who uploaded the image" ON marker_images
  FOR UPDATE TO authenticated USING (uploaded_by = (SELECT auth.jwt() ->> 'email'));

CREATE POLICY "Enable delete for admins and managers" ON marker_images
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.email = (SELECT auth.jwt() ->> 'email')
      AND users.role IN ('admin', 'manager')
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON marker_images TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE marker_images_id_seq TO authenticated;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_marker_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_marker_images_updated_at
    BEFORE UPDATE ON marker_images
    FOR EACH ROW
    EXECUTE FUNCTION update_marker_images_updated_at();

COMMENT ON TABLE marker_images IS 'Stores uploaded images for markers (airports, landingsplasser, kalk info)';
COMMENT ON COLUMN marker_images.marker_id IS 'ID of the marker this image belongs to';
COMMENT ON COLUMN marker_images.marker_type IS 'Type of marker: airport, landingsplass, or kalk';
COMMENT ON COLUMN marker_images.uploaded_by IS 'Email of the user who uploaded this image'; 