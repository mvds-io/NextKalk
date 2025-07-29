-- Schema Discovery Script for Kalk Planner Database
-- Run this in Supabase SQL editor to see your actual table structures
-- This helps understand what columns exist before running performance_indexes.sql

SELECT '=== DISCOVERING YOUR DATABASE SCHEMA ===' as info;

-- Function to safely describe table structure
CREATE OR REPLACE FUNCTION describe_table_safe(table_name text)
RETURNS TABLE(
    column_name text,
    data_type text,
    is_nullable text,
    column_default text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.column_name::text,
        c.data_type::text,
        c.is_nullable::text,
        c.column_default::text
    FROM information_schema.columns c
    WHERE c.table_name = describe_table_safe.table_name
      AND c.table_schema = 'public'
    ORDER BY c.ordinal_position;
EXCEPTION 
    WHEN OTHERS THEN
        -- Return empty result if table doesn't exist
        RETURN;
END;
$$ LANGUAGE plpgsql;

-- Discover all tables in public schema
SELECT '=== ALL TABLES IN YOUR DATABASE ===' as section;
SELECT 
    tablename as table_name,
    schemaname as schema_name
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check specific tables we're interested in
SELECT '=== VASS_LASTEPLASS TABLE STRUCTURE ===' as section;
SELECT * FROM describe_table_safe('vass_lasteplass');

SELECT '=== VASS_VANN TABLE STRUCTURE ===' as section;
SELECT * FROM describe_table_safe('vass_vann');

SELECT '=== VASS_INFO TABLE STRUCTURE ===' as section;
SELECT * FROM describe_table_safe('vass_info');

SELECT '=== VASS_ASSOCIATIONS TABLE STRUCTURE ===' as section;
SELECT * FROM describe_table_safe('vass_associations');

-- Check document tables
SELECT '=== DOCUMENT TABLES ===' as section;
SELECT * FROM describe_table_safe('vass_lasteplass_documents');
SELECT * FROM describe_table_safe('vass_vann_documents');

-- Check image tables  
SELECT '=== IMAGE TABLES ===' as section;
SELECT * FROM describe_table_safe('vass_lasteplass_images');
SELECT * FROM describe_table_safe('vass_vann_images');

-- Check user logs table
SELECT '=== USER_ACTION_LOGS TABLE STRUCTURE ===' as section;
SELECT * FROM describe_table_safe('user_action_logs');

-- Show existing indexes
SELECT '=== EXISTING INDEXES ===' as section;
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND tablename IN ('vass_lasteplass', 'vass_vann', 'vass_info', 'vass_associations')
ORDER BY tablename, indexname;

-- Cleanup
DROP FUNCTION IF EXISTS describe_table_safe(text);

SELECT '=== SCHEMA DISCOVERY COMPLETE ===' as final_message;
SELECT '📋 Use this information to understand your database structure' as instruction;
SELECT '🚀 Now you can run the performance_indexes.sql script safely!' as next_step; 