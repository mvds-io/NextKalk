-- Create users table for permission management
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'viewer',
    can_edit_priority BOOLEAN DEFAULT FALSE,
    can_edit_markers BOOLEAN DEFAULT FALSE,
    display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on email for faster lookups
CREATE INDEX idx_users_email ON users(email);

-- Create an index on role for role-based queries
CREATE INDEX idx_users_role ON users(role);

-- Add Row Level Security (RLS) - optional but recommended
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to read their own record
CREATE POLICY "Users can read own record" ON users 
    FOR SELECT USING (auth.email() = email);

-- Create a policy for admins to manage all users (you'll need to define admin role)
-- CREATE POLICY "Admins can manage all users" ON users 
--     FOR ALL USING (
--         EXISTS (
--             SELECT 1 FROM users 
--             WHERE email = auth.email() 
--             AND role = 'admin'
--         )
--     );

-- Insert some example users (replace with your actual users)
INSERT INTO users (email, role, can_edit_priority, can_edit_markers, display_name) VALUES
    ('admin@example.com', 'admin', true, true, 'Administrator'),
    ('manager@example.com', 'manager', true, false, 'Project Manager'),
    ('viewer@example.com', 'viewer', false, false, 'Viewer User');

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- User action logging table
CREATE TABLE user_action_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT NOT NULL,
  action_type TEXT NOT NULL, -- e.g., 'toggle_done', 'add_comment', 'upload_image', etc.
  target_type TEXT NOT NULL, -- e.g., 'airport', 'landingsplass', 'kalkinfo'
  target_id BIGINT NOT NULL,
  target_name TEXT, -- human-readable name of the target
  action_details JSONB, -- additional details about the action
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Create index for efficient querying
CREATE INDEX idx_user_action_logs_timestamp ON user_action_logs(timestamp DESC);
CREATE INDEX idx_user_action_logs_user_email ON user_action_logs(user_email);
CREATE INDEX idx_user_action_logs_action_type ON user_action_logs(action_type);
CREATE INDEX idx_user_action_logs_target ON user_action_logs(target_type, target_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_action_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for user_action_logs
CREATE POLICY "Enable insert for authenticated users only" ON user_action_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read for users with can_edit_priority permission" ON user_action_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.email = (SELECT auth.jwt() ->> 'email')
      AND users.can_edit_priority = true
    )
  );

-- Grant permissions
GRANT INSERT ON user_action_logs TO authenticated;
GRANT SELECT ON user_action_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE user_action_logs_id_seq TO authenticated;

-- ========== ASSOCIATION TABLE PERMISSIONS ========== --
-- Ensure all authenticated users can read associations (needed for connection lines)
-- but only users with special permissions can create/delete associations

-- Enable read access for all authenticated users on associations table
GRANT SELECT ON vass_associations TO authenticated;

-- If RLS is enabled on vass_associations, add a policy for all authenticated users to read
-- CREATE POLICY "Enable read access for all authenticated users" ON vass_associations
--   FOR SELECT USING (auth.role() = 'authenticated');

-- Only allow users with can_edit_markers permission to insert/update/delete associations
-- CREATE POLICY "Enable write access for users with can_edit_markers permission" ON vass_associations
--   FOR ALL USING (
--     EXISTS (
--       SELECT 1 FROM users 
--       WHERE users.email = (SELECT auth.jwt() ->> 'email')
--       AND users.can_edit_markers = true
--     )
--   );

-- Grant basic read permissions to all core tables for authenticated users
GRANT SELECT ON vass_vann TO authenticated;
GRANT SELECT ON vass_lasteplass TO authenticated;
GRANT SELECT ON vass_info TO authenticated;

-- Note: Uncomment the RLS policies above if you want to enable Row Level Security
-- on the associations table for more granular control 