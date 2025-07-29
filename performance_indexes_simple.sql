-- SIMPLIFIED Performance Optimization Script for Kalk Planner
-- This version shows all results in a single output for better visibility in Supabase

-- Create a temporary table to collect results
CREATE TEMP TABLE IF NOT EXISTS index_results (
    operation text,
    table_name text,
    index_name text,
    columns text,
    status text,
    message text
);

-- Function to safely create indexes and log results
CREATE OR REPLACE FUNCTION create_index_with_logging(
    idx_name text, 
    tbl_name text, 
    col_names text
) RETURNS void AS $$
BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(%s)', idx_name, tbl_name, col_names);
    INSERT INTO index_results VALUES (
        'CREATE INDEX', 
        tbl_name, 
        idx_name, 
        col_names, 
        '✅ SUCCESS', 
        format('Created index %s on %s(%s)', idx_name, tbl_name, col_names)
    );
EXCEPTION 
    WHEN undefined_column THEN
        INSERT INTO index_results VALUES (
            'CREATE INDEX', 
            tbl_name, 
            idx_name, 
            col_names, 
            '⚠️ SKIPPED', 
            format('Column(s) %s not found in table %s', col_names, tbl_name)
        );
    WHEN undefined_table THEN
        INSERT INTO index_results VALUES (
            'CREATE INDEX', 
            tbl_name, 
            idx_name, 
            col_names, 
            '⚠️ SKIPPED', 
            format('Table %s not found', tbl_name)
        );
    WHEN duplicate_table THEN
        INSERT INTO index_results VALUES (
            'CREATE INDEX', 
            tbl_name, 
            idx_name, 
            col_names, 
            '✅ EXISTS', 
            format('Index %s already exists', idx_name)
        );
    WHEN OTHERS THEN
        INSERT INTO index_results VALUES (
            'CREATE INDEX', 
            tbl_name, 
            idx_name, 
            col_names, 
            '❌ ERROR', 
            format('Error: %s', SQLERRM)
        );
END;
$$ LANGUAGE plpgsql;

-- Core table indexes
SELECT create_index_with_logging('idx_vass_lasteplass_fylke', 'vass_lasteplass', 'fylke');
SELECT create_index_with_logging('idx_vass_lasteplass_priority', 'vass_lasteplass', 'priority');
SELECT create_index_with_logging('idx_vass_lasteplass_is_done', 'vass_lasteplass', 'is_done');
SELECT create_index_with_logging('idx_vass_lasteplass_completed_at', 'vass_lasteplass', 'completed_at');
SELECT create_index_with_logging('idx_vass_lasteplass_kode', 'vass_lasteplass', 'kode');

-- Composite indexes for landingsplasser
SELECT create_index_with_logging('idx_vass_lasteplass_fylke_priority', 'vass_lasteplass', 'fylke, priority');
SELECT create_index_with_logging('idx_vass_lasteplass_fylke_is_done', 'vass_lasteplass', 'fylke, is_done');
SELECT create_index_with_logging('idx_vass_lasteplass_priority_is_done', 'vass_lasteplass', 'priority, is_done');

-- Vass_vann indexes
SELECT create_index_with_logging('idx_vass_vann_fylke', 'vass_vann', 'fylke');
SELECT create_index_with_logging('idx_vass_vann_marker_color', 'vass_vann', 'marker_color');
SELECT create_index_with_logging('idx_vass_vann_is_done', 'vass_vann', 'is_done');
SELECT create_index_with_logging('idx_vass_vann_name', 'vass_vann', 'name');

-- Composite indexes for vass_vann
SELECT create_index_with_logging('idx_vass_vann_fylke_is_done', 'vass_vann', 'fylke, is_done');
SELECT create_index_with_logging('idx_vass_vann_fylke_marker_color', 'vass_vann', 'fylke, marker_color');

-- Vass_info indexes
SELECT create_index_with_logging('idx_vass_info_fylke', 'vass_info', 'fylke');
SELECT create_index_with_logging('idx_vass_info_kommune', 'vass_info', 'kommune');

-- Association table indexes
SELECT create_index_with_logging('idx_vass_associations_landingsplass_id', 'vass_associations', 'landingsplass_id');
SELECT create_index_with_logging('idx_vass_associations_airport_id', 'vass_associations', 'airport_id');
SELECT create_index_with_logging('idx_vass_associations_both_ids', 'vass_associations', 'landingsplass_id, airport_id');

-- Document table indexes
SELECT create_index_with_logging('idx_vass_lasteplass_documents_marker_id', 'vass_lasteplass_documents', 'marker_id');
SELECT create_index_with_logging('idx_vass_lasteplass_documents_created_at', 'vass_lasteplass_documents', 'created_at');
SELECT create_index_with_logging('idx_vass_vann_documents_marker_id', 'vass_vann_documents', 'marker_id');
SELECT create_index_with_logging('idx_vass_vann_documents_created_at', 'vass_vann_documents', 'created_at');

-- Image table indexes
SELECT create_index_with_logging('idx_vass_lasteplass_images_marker_id', 'vass_lasteplass_images', 'marker_id');
SELECT create_index_with_logging('idx_vass_lasteplass_images_created_at', 'vass_lasteplass_images', 'created_at');
SELECT create_index_with_logging('idx_vass_vann_images_marker_id', 'vass_vann_images', 'marker_id');
SELECT create_index_with_logging('idx_vass_vann_images_created_at', 'vass_vann_images', 'created_at');

-- User activity indexes
SELECT create_index_with_logging('idx_user_action_logs_user_email', 'user_action_logs', 'user_email');
SELECT create_index_with_logging('idx_user_action_logs_target_type_id', 'user_action_logs', 'target_type, target_id');
SELECT create_index_with_logging('idx_user_action_logs_action_type', 'user_action_logs', 'action_type');

-- Show comprehensive results
SELECT 
    status,
    table_name,
    index_name,
    columns,
    message
FROM index_results
ORDER BY 
    CASE 
        WHEN table_name = 'vass_lasteplass' THEN 1
        WHEN table_name = 'vass_vann' THEN 2
        WHEN table_name = 'vass_info' THEN 3
        WHEN table_name = 'vass_associations' THEN 4
        ELSE 5
    END,
    index_name;

-- Show summary statistics  
SELECT 
    '=== SUMMARY STATISTICS ===' as summary_title,
    status,
    COUNT(*)::text as count,
    'indexes' as type
FROM index_results
GROUP BY status
ORDER BY 
    CASE 
        WHEN status = '✅ SUCCESS' THEN 1
        WHEN status = '✅ EXISTS' THEN 2  
        WHEN status = '⚠️ SKIPPED' THEN 3
        ELSE 4
    END;

-- Show final totals
SELECT 
    '🚀 OPTIMIZATION COMPLETE!' as final_status,
    COUNT(*)::text as total_operations,
    COUNT(CASE WHEN status LIKE '✅%' THEN 1 END)::text as successful_indexes,
    COUNT(CASE WHEN status = '⚠️ SKIPPED' THEN 1 END)::text as skipped_indexes
FROM index_results;

-- Cleanup
DROP FUNCTION IF EXISTS create_index_with_logging(text, text, text); 