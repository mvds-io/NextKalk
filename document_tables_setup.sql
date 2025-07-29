-- Document storage tables for the Kalk Planner application
-- Run this script in your Supabase SQL editor to add document upload support

-- Table for storing landingsplass documents
CREATE TABLE IF NOT EXISTS vass_lasteplass_documents (
    id BIGSERIAL PRIMARY KEY,
    marker_id BIGINT NOT NULL REFERENCES vass_lasteplass(id) ON DELETE CASCADE,
    document_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for storing airport documents (optional - if you want to add documents to airports too)
CREATE TABLE IF NOT EXISTS vass_vann_documents (
    id BIGSERIAL PRIMARY KEY,
    marker_id BIGINT NOT NULL REFERENCES vass_vann(id) ON DELETE CASCADE,
    document_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for storing kalk info documents (optional - if you want to add documents to kalk markers too)
CREATE TABLE IF NOT EXISTS vass_info_documents (
    id BIGSERIAL PRIMARY KEY,
    marker_id BIGINT NOT NULL REFERENCES vass_info(id) ON DELETE CASCADE,
    document_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_vass_lasteplass_documents_marker_id ON vass_lasteplass_documents(marker_id);
CREATE INDEX IF NOT EXISTS idx_vass_vann_documents_marker_id ON vass_vann_documents(marker_id);
CREATE INDEX IF NOT EXISTS idx_vass_info_documents_marker_id ON vass_info_documents(marker_id);

-- Add updated_at trigger function (if not already exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to automatically update the updated_at column
CREATE TRIGGER update_vass_lasteplass_documents_updated_at
    BEFORE UPDATE ON vass_lasteplass_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vass_vann_documents_updated_at
    BEFORE UPDATE ON vass_vann_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vass_info_documents_updated_at
    BEFORE UPDATE ON vass_info_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) on the new tables
ALTER TABLE vass_lasteplass_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vass_vann_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vass_info_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
-- You may need to adjust these policies based on your specific security requirements

-- Policy for landingsplass documents
CREATE POLICY "Users can view landingsplass documents" ON vass_lasteplass_documents
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert landingsplass documents" ON vass_lasteplass_documents
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update landingsplass documents" ON vass_lasteplass_documents
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete landingsplass documents" ON vass_lasteplass_documents
    FOR DELETE USING (auth.role() = 'authenticated');

-- Policy for airport documents  
CREATE POLICY "Users can view airport documents" ON vass_vann_documents
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert airport documents" ON vass_vann_documents
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update airport documents" ON vass_vann_documents
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete airport documents" ON vass_vann_documents
    FOR DELETE USING (auth.role() = 'authenticated');

-- Policy for kalk info documents
CREATE POLICY "Users can view kalk info documents" ON vass_info_documents
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert kalk info documents" ON vass_info_documents
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update kalk info documents" ON vass_info_documents
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete kalk info documents" ON vass_info_documents
    FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions to authenticated users
GRANT ALL ON vass_lasteplass_documents TO authenticated;
GRANT ALL ON vass_vann_documents TO authenticated;
GRANT ALL ON vass_info_documents TO authenticated;

-- Grant permissions on sequences
GRANT USAGE, SELECT ON SEQUENCE vass_lasteplass_documents_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE vass_vann_documents_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE vass_info_documents_id_seq TO authenticated; 