# Database Performance Optimization Plan

## Current Performance Issues

Based on the Supabase slow query report, the following queries are consuming the most time:

### Top Time-Consuming Queries:
1. **user_action_logs queries** - 42 seconds total (112,067 calls)
   - Filtering by action_type, target_type, target_id with ORDER BY timestamp
   - Average: 0.375ms per query

2. **vass_vann full table scans** - 29 seconds total (3,424 calls)
   - Full table reads with LIMIT/OFFSET pagination
   - Average: 8.5ms per query

3. **vass_associations with joins** - 28 seconds total (4,833 calls)
   - Complex joins with vass_vann table
   - Average: 5.9ms per query

## Key Issues Identified

### 1. Missing Critical Indexes
The most time-consuming queries involve `user_action_logs` and `vass_associations` that lack proper composite indexes for their query patterns.

### 2. Duplicate and Redundant Indexes
Several tables have multiple indexes serving the same purpose:
- `vass_associations` has 6 indexes, many overlapping
- `user_action_logs` has duplicate target indexes

### 3. Stale Table Statistics
Many tables haven't been analyzed recently:
- `vass_associations`: Last analyzed 2025-07-29
- `users`: Last analyzed 2025-09-03
- Several tables never analyzed

### 4. Inefficient Query Patterns
- Complex nested queries with unnecessary aggregations
- Missing use of covering indexes
- Suboptimal JOIN patterns

## Optimization Strategy

### Phase 1: Add Missing Composite Indexes

```sql
-- Critical index for user_action_logs (will fix the 42-second query)
CREATE INDEX idx_user_action_logs_composite 
ON user_action_logs(action_type, target_type, target_id, timestamp DESC);

-- Optimize vass_vann queries with filtering
CREATE INDEX idx_vass_vann_composite 
ON vass_vann(id) 
INCLUDE (name, tonn, fylke, marker_color, is_done);

-- Improve vass_associations join performance
CREATE INDEX idx_vass_associations_optimized 
ON vass_associations(landingsplass_id, airport_id);
```

### Phase 2: Remove Redundant Indexes

```sql
-- Drop duplicate indexes on vass_associations
DROP INDEX IF EXISTS vass_associations_airport_id_idx;
DROP INDEX IF EXISTS vass_associations_landingsplass_id_idx;
DROP INDEX IF EXISTS idx_vass_associations_airport_id;
DROP INDEX IF EXISTS idx_vass_associations_landingsplass_id;

-- Drop duplicate index on user_action_logs
DROP INDEX IF EXISTS idx_user_action_logs_target_type_id;  -- Duplicate of idx_user_action_logs_target
```

### Phase 3: Update Table Statistics

```sql
-- Update statistics for all tables
VACUUM ANALYZE user_action_logs;
VACUUM ANALYZE vass_vann;
VACUUM ANALYZE vass_associations;
VACUUM ANALYZE vass_lasteplass;
VACUUM ANALYZE users;

-- Consider setting more aggressive autovacuum for frequently updated tables
ALTER TABLE user_action_logs SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE user_action_logs SET (autovacuum_analyze_scale_factor = 0.05);
```

### Phase 4: Add Partial Indexes for Common Filters

```sql
-- Partial index for non-null fylke queries
CREATE INDEX idx_vass_vann_fylke_not_null 
ON vass_vann(fylke) 
WHERE fylke IS NOT NULL AND fylke != '';

-- Partial index for incomplete items
CREATE INDEX idx_vass_lasteplass_incomplete 
ON vass_lasteplass(priority, fylke) 
WHERE is_done = false;
```

### Phase 5: Consider Materialized Views

For extremely frequent query patterns, consider materialized views:

```sql
-- Materialized view for vass_associations with full join data
CREATE MATERIALIZED VIEW mv_vass_associations_full AS
SELECT 
    va.landingsplass_id,
    va.airport_id,
    vv.id as vann_id,
    vv.name,
    vv.tonn,
    vv.fylke,
    vv.forening,
    vv.kontaktperson,
    vv.phone,
    vl.lp,
    vl.kode,
    vl.priority,
    vl.is_done
FROM vass_associations va
LEFT JOIN vass_vann vv ON vv.id = va.airport_id
LEFT JOIN vass_lasteplass vl ON vl.id = va.landingsplass_id;

-- Create indexes on the materialized view
CREATE INDEX idx_mv_vass_landingsplass ON mv_vass_associations_full(landingsplass_id);
CREATE INDEX idx_mv_vass_airport ON mv_vass_associations_full(airport_id);

-- Refresh strategy (can be automated with pg_cron)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_vass_associations_full;
```

## Expected Performance Improvements

| Query Type | Current Time | Expected Time | Improvement |
|------------|--------------|---------------|-------------|
| user_action_logs filters | 42s total | <2s total | 95% reduction |
| vass_vann full scans | 29s total | <5s total | 83% reduction |
| vass_associations joins | 28s total | <3s total | 89% reduction |
| users email lookups | 7s total | <1s total | 86% reduction |

## Implementation Order

1. **Immediate Actions** (Do First):
   - Add composite index on `user_action_logs`
   - Run VACUUM ANALYZE on all tables
   
2. **Quick Wins** (Within 24 hours):
   - Remove duplicate indexes
   - Add partial indexes for common filters
   
3. **Medium Term** (Within 1 week):
   - Implement materialized views if query patterns remain consistent
   - Set up automated refresh schedules
   
4. **Long Term Monitoring**:
   - Monitor pg_stat_statements for new slow queries
   - Adjust autovacuum settings based on usage patterns
   - Consider partitioning large tables if they grow significantly

## Monitoring Queries

Use these queries to monitor improvements:

```sql
-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Monitor slow queries
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    min_time,
    max_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_%'
ORDER BY total_time DESC
LIMIT 20;

-- Check table bloat
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup,
    n_dead_tup,
    round(n_dead_tup::numeric / NULLIF(n_live_tup, 0), 2) AS dead_ratio
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;
```

## Risk Mitigation

- **Test in staging first**: All index changes should be tested in a staging environment
- **Monitor after deployment**: Watch for any unexpected query plan changes
- **Keep backups**: Ensure you have recent backups before making schema changes
- **Use CONCURRENTLY**: When creating indexes on production, use `CREATE INDEX CONCURRENTLY` to avoid locking

## Additional Recommendations

1. **Enable pg_stat_statements** if not already enabled for better query monitoring
2. **Consider connection pooling** (PgBouncer) if connection overhead is high
3. **Review RLS policies** - they might be adding overhead to queries
4. **Implement query result caching** at the application level for frequently accessed data
5. **Consider upgrading** to latest PostgreSQL version for performance improvements

## Notes

- The `set_config` queries (44 seconds total) are RLS-related and harder to optimize directly
- Focus on the application queries first for immediate impact
- After implementing these changes, re-run the slow query report to identify next optimization targets