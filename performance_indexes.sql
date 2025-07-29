-- Performance Optimization Indexes for Kalk Planner (FAULT-TOLERANT VERSION)
-- Run this script in your Supabase SQL editor to improve query performance
-- This script will continue even if columns don't exist - safe for any schema!

-- Function to safely create indexes with error handling
CREATE OR REPLACE FUNCTION create_index_safe(index_name text, table_name text, column_names text)
RETURNS text AS $$
BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(%s)', index_name, table_name, column_names);
    RETURN format('✅ Created index %s on %s(%s)', index_name, table_name, column_names);
EXCEPTION 
    WHEN undefined_column THEN
        RETURN format('⚠️  Skipped index %s - column(s) %s not found in table %s', index_name, column_names, table_name);
    WHEN undefined_table THEN
        RETURN format('⚠️  Skipped index %s - table %s not found', index_name, table_name);
    WHEN OTHERS THEN
        RETURN format('❌ Error creating index %s: %s', index_name, SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- ========== CORE TABLE INDEXES ========== --

SELECT '=== CREATING INDEXES FOR VASS_LASTEPLASS ===' as status;

-- Indexes for vass_lasteplass (landingsplasser) table
SELECT create_index_safe('idx_vass_lasteplass_fylke', 'vass_lasteplass', 'fylke');
SELECT create_index_safe('idx_vass_lasteplass_priority', 'vass_lasteplass', 'priority');
SELECT create_index_safe('idx_vass_lasteplass_is_done', 'vass_lasteplass', 'is_done');
SELECT create_index_safe('idx_vass_lasteplass_completed_at', 'vass_lasteplass', 'completed_at');
SELECT create_index_safe('idx_vass_lasteplass_kode', 'vass_lasteplass', 'kode');

-- Composite indexes for common filter combinations
SELECT create_index_safe('idx_vass_lasteplass_fylke_priority', 'vass_lasteplass', 'fylke, priority');
SELECT create_index_safe('idx_vass_lasteplass_fylke_is_done', 'vass_lasteplass', 'fylke, is_done');
SELECT create_index_safe('idx_vass_lasteplass_priority_is_done', 'vass_lasteplass', 'priority, is_done');

SELECT '=== CREATING INDEXES FOR VASS_VANN ===' as status;

-- Indexes for vass_vann (airports/water bodies) table
SELECT create_index_safe('idx_vass_vann_fylke', 'vass_vann', 'fylke');
SELECT create_index_safe('idx_vass_vann_marker_color', 'vass_vann', 'marker_color');
SELECT create_index_safe('idx_vass_vann_is_done', 'vass_vann', 'is_done');
SELECT create_index_safe('idx_vass_vann_name', 'vass_vann', 'name');

-- Composite indexes for common filter combinations
SELECT create_index_safe('idx_vass_vann_fylke_is_done', 'vass_vann', 'fylke, is_done');
SELECT create_index_safe('idx_vass_vann_fylke_marker_color', 'vass_vann', 'fylke, marker_color');

SELECT '=== CREATING INDEXES FOR VASS_INFO ===' as status;

-- Indexes for vass_info (kalk markers) table
SELECT create_index_safe('idx_vass_info_fylke', 'vass_info', 'fylke');
SELECT create_index_safe('idx_vass_info_kommune', 'vass_info', 'kommune');

-- ========== ASSOCIATION TABLE INDEXES ========== --

SELECT '=== CREATING INDEXES FOR VASS_ASSOCIATIONS ===' as status;

-- Indexes for vass_associations table (critical for "Related waters" queries)
SELECT create_index_safe('idx_vass_associations_landingsplass_id', 'vass_associations', 'landingsplass_id');
SELECT create_index_safe('idx_vass_associations_airport_id', 'vass_associations', 'airport_id');

-- Composite index for join operations
SELECT create_index_safe('idx_vass_associations_both_ids', 'vass_associations', 'landingsplass_id, airport_id');

-- ========== DOCUMENT TABLE INDEXES ========== --

SELECT '=== CREATING INDEXES FOR DOCUMENT TABLES ===' as status;

-- Indexes for document tables (for faster document loading)
SELECT create_index_safe('idx_vass_lasteplass_documents_marker_id', 'vass_lasteplass_documents', 'marker_id');
SELECT create_index_safe('idx_vass_lasteplass_documents_created_at', 'vass_lasteplass_documents', 'created_at');

SELECT create_index_safe('idx_vass_vann_documents_marker_id', 'vass_vann_documents', 'marker_id');
SELECT create_index_safe('idx_vass_vann_documents_created_at', 'vass_vann_documents', 'created_at');

-- ========== IMAGE TABLE INDEXES ========== --

SELECT '=== CREATING INDEXES FOR IMAGE TABLES ===' as status;

-- Indexes for image tables (for faster image loading)
SELECT create_index_safe('idx_vass_lasteplass_images_marker_id', 'vass_lasteplass_images', 'marker_id');
SELECT create_index_safe('idx_vass_lasteplass_images_created_at', 'vass_lasteplass_images', 'created_at');

SELECT create_index_safe('idx_vass_vann_images_marker_id', 'vass_vann_images', 'marker_id');
SELECT create_index_safe('idx_vass_vann_images_created_at', 'vass_vann_images', 'created_at');

-- ========== USER ACTIVITY INDEXES ========== --

SELECT '=== CREATING INDEXES FOR USER_ACTION_LOGS ===' as status;

-- Indexes for user_action_logs table (for faster log queries)
SELECT create_index_safe('idx_user_action_logs_user_email', 'user_action_logs', 'user_email');
SELECT create_index_safe('idx_user_action_logs_target_type_id', 'user_action_logs', 'target_type, target_id');
SELECT create_index_safe('idx_user_action_logs_action_type', 'user_action_logs', 'action_type');

-- ========== PERFORMANCE STATISTICS ========== --

SELECT '=== UPDATING TABLE STATISTICS ===' as status;

-- Function to safely analyze tables
CREATE OR REPLACE FUNCTION analyze_table_safe(table_name text)
RETURNS text AS $$
BEGIN
    EXECUTE format('ANALYZE %I', table_name);
    RETURN format('✅ Analyzed table %s', table_name);
EXCEPTION 
    WHEN undefined_table THEN
        RETURN format('⚠️  Skipped analysis - table %s not found', table_name);
    WHEN OTHERS THEN
        RETURN format('❌ Error analyzing table %s: %s', table_name, SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Update table statistics to help PostgreSQL's query planner
SELECT analyze_table_safe('vass_lasteplass');
SELECT analyze_table_safe('vass_vann');
SELECT analyze_table_safe('vass_info');
SELECT analyze_table_safe('vass_associations');
SELECT analyze_table_safe('vass_lasteplass_documents');
SELECT analyze_table_safe('vass_vann_documents');
SELECT analyze_table_safe('vass_lasteplass_images');
SELECT analyze_table_safe('vass_vann_images');
SELECT analyze_table_safe('user_action_logs');

-- ========== PERFORMANCE RECOMMENDATIONS ========== --

/*
PERFORMANCE TIPS:

1. Monitor query performance:
   - Use EXPLAIN ANALYZE on slow queries
   - Check if indexes are being used properly

2. Regular maintenance:
   - Run VACUUM and ANALYZE periodically
   - Monitor index usage with pg_stat_user_indexes

3. Query optimization patterns:
   - Always filter by fylke first when using county filters
   - Use composite indexes for multi-column WHERE clauses
   - Consider partial indexes for frequently filtered subsets

4. Check index usage:
   SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   ORDER BY idx_scan DESC;

5. Monitor table sizes and growth:
   SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY pg_total_relation_size(tablename::regclass) DESC;
*/

-- ========== CLEANUP & SUMMARY ========== --

-- Clean up helper functions (optional - you can keep them for future use)
-- DROP FUNCTION IF EXISTS create_index_safe(text, text, text);
-- DROP FUNCTION IF EXISTS analyze_table_safe(text);

SELECT '=== PERFORMANCE OPTIMIZATION COMPLETE ===' as status;
SELECT '✅ All indexes and optimizations applied successfully!' as summary;
SELECT '📊 Your database queries should now be significantly faster!' as performance_note;
SELECT '🔍 Check the output above to see which indexes were created/skipped' as instructions; 