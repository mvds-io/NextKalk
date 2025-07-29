-- SQL commands to check and fix Row Level Security (RLS) policies for vass_associations table
-- Run these in your Supabase SQL editor to diagnose and fix access issues

-- 1. Check if RLS is enabled on the table
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'vass_associations';

-- 2. Check existing policies on the table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'vass_associations';

-- 3. Check if the table exists and has data
SELECT COUNT(*) as total_associations FROM vass_associations;

-- 4. OPTION A: Disable RLS completely (simplest solution)
-- WARNING: This makes the table publicly accessible
ALTER TABLE vass_associations DISABLE ROW LEVEL SECURITY;

-- 5. OPTION B: Create proper RLS policies (recommended)
-- First enable RLS if not already enabled
-- ALTER TABLE vass_associations ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous users (if your app uses anonymous access)
-- CREATE POLICY "Allow anonymous to read associations" ON vass_associations
--   FOR SELECT TO anon USING (true);

-- Create policy for authenticated users
-- CREATE POLICY "Allow authenticated to read associations" ON vass_associations
--   FOR SELECT TO authenticated USING (true);

-- Create policy for service role (used by your app)
-- CREATE POLICY "Allow service role full access" ON vass_associations
--   FOR ALL TO service_role USING (true);

-- 6. OPTION C: Grant direct table permissions (alternative approach)
-- GRANT SELECT ON vass_associations TO anon;
-- GRANT SELECT ON vass_associations TO authenticated;

-- 7. Test the fix by running a simple query
-- SELECT COUNT(*) FROM vass_associations LIMIT 1;

-- 8. Check your current user role
SELECT current_user, current_setting('role');

-- 9. If you want to see what roles exist
SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');

-- RECOMMENDED SOLUTION: Run this if you want simple read access for all users
-- This disables RLS and allows read access - adjust as needed for your security requirements
ALTER TABLE vass_associations DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON vass_associations TO anon;
GRANT SELECT ON vass_associations TO authenticated; 