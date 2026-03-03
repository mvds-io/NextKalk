# NextKalk Planning & Optimization Guide

## Overview

The NextKalk Planning & Optimization system allows you to optimize landingsplass placement and test different configurations to minimize helicopter flight distances. This comprehensive guide covers all features including planning mode, K-means optimization, year comparisons, and scenario management.

---

## Table of Contents

1. [Features Overview](#features-overview)
2. [Getting Started](#getting-started)
3. [Planning Mode](#planning-mode)
4. [K-Means Optimization](#k-means-optimization)
5. [Year-to-Year Comparison](#year-to-year-comparison)
6. [Scenario Management](#scenario-management)
7. [Database Schema](#database-schema)
8. [API Reference](#api-reference)

---

## Features Overview

### 1. **Planning Mode**
- Temporarily deactivate landingsplasser to test configurations
- Automatically reassign vann markers to next closest active landingsplass
- Real-time impact analysis showing distance changes
- Visual feedback with color-coded changes (green = improvement, red = degradation)

### 2. **K-Means Clustering Optimization**
- AI-powered landingsplass placement suggestions
- Finds mathematically optimal positions based on vann distribution
- Automatic cluster count suggestion using elbow method
- One-click creation of optimized landingsplasser

### 3. **Year-to-Year Comparison**
- Compare different yearly configurations side-by-side
- Identify which vann markers were reassigned
- See efficiency improvements or degradations
- Detailed statistics for each year

### 4. **Scenario Management**
- Save and load different planning configurations
- Compare multiple optimization scenarios
- Track metadata (total distance, avg distance, number of reassignments)

---

## Getting Started

### Prerequisites

1. **Database Migration**: The planning mode features require new database tables. Run the migration:
   ```bash
   # The migration has been applied automatically via Supabase MCP
   # Check migration file: planning_mode_migration.sql
   ```

2. **Access Requirements**: You need `can_edit_markers` permission to access planning features

3. **Navigate to Admin Panel**: Go to `/admin` and click on the **"Planning & Optimization"** tab

---

## Planning Mode

### Activating Planning Mode

1. Click **"Enter Planning Mode"** button in the Planning tab
2. The mode indicator will turn green showing "Planning Mode Active"
3. All landingsplasser will be initially set to "active"

### Deactivating Landingsplasser

**Individual Deactivation:**
- Click on any landingsplass card to toggle its active status
- Active: Green background with checkmark
- Inactive: Red background with indicator showing affected vann count

**Bulk Operations:**
- **Activate All**: Resets all landingsplasser to active state
- **Save Scenario**: Saves current configuration for later use

### Understanding the Impact Analysis

When you deactivate landingsplasser, the system shows:

**Summary Metrics:**
- **Distance Change**: Total km difference (+ = worse, - = better)
- **Percentage Change**: Efficiency impact as percentage
- **Reassignments**: Number of vann markers that need new assignments
- **Deactivated LPs**: Count of inactive landingsplasser

**Reassignments Table:**
Shows each affected vann with:
- Old landingsplass assignment
- New closest landingsplass
- Old and new distances
- Distance change (color-coded)

### Example Workflow

1. **Baseline**: Start with all LPs active, note total distance (e.g., 1,234.5 km)
2. **Test**: Deactivate LP-7 to see if it's redundant
3. **Analyze**: System shows +45.2 km increase (3.7% worse)
4. **Decision**: Keep LP-7 active as it provides meaningful coverage
5. **Alternative**: Try deactivating LP-12 instead
6. **Result**: Shows -8.3 km decrease (0.7% better)
7. **Save**: Save this scenario as "Optimized North Region"

---

## K-Means Optimization

### What is K-Means Clustering?

K-means is a machine learning algorithm that groups similar data points together. In NextKalk, it finds optimal landingsplass positions by:
- Analyzing the geographic distribution of all vann markers
- Grouping nearby vann together into clusters
- Finding the center point (centroid) of each cluster
- Suggesting these centroids as optimal LP locations

### Running K-Means Optimization

1. **Click "Show Optimization"** in the Planning tab
2. **Choose number of clusters**:
   - **Manual**: Enter desired number (e.g., 10, 15, 20)
   - **Auto**: Click "Auto" button to use elbow method suggestion
3. **Click "Run Optimization"**
4. **Review results** in the cluster table

### Understanding Cluster Results

Each cluster shows:
- **Position**: Latitude/Longitude coordinates for optimal LP placement
- **Members**: Number of vann markers in this cluster
- **Total Tonnage**: Combined weight of all vann in cluster
- **Avg Distance**: Average distance from vann to cluster center

### Applying Optimization Suggestions

**Option 1: Create All Suggested LPs**
1. Click **"Create Optimized LPs"**
2. System creates new landingsplasser with prefix "OPT-"
3. Review new LPs in Landingsplasser tab
4. Manually reassign vann markers to these new LPs
5. Deactivate old LPs as needed

**Option 2: Manual Adjustment**
1. Review suggested positions
2. Manually create/move LPs to nearby practical locations
3. Consider real-world constraints:
   - Land ownership
   - Terrain accessibility
   - Helicopter landing permissions
   - Proximity to roads/infrastructure

### Optimal Cluster Count

The **Auto** suggestion uses the "elbow method":
- Tests different cluster counts (1-25)
- Calculates improvement for each count
- Finds point where adding more clusters has diminishing returns
- Balances efficiency vs. operational complexity

**Example:**
- 5 clusters: 1500 km total distance
- 10 clusters: 1100 km (-27%)
- 15 clusters: 950 km (-13% improvement)
- 20 clusters: 920 km (-3% improvement) ← Elbow point
- More clusters beyond this provide minimal improvement

---

## Year-to-Year Comparison

### Comparing Different Years

1. Navigate to **"Year Comparison"** tab
2. Select **Year 1** (baseline) - e.g., "2026"
3. Select **Year 2** (comparison) - e.g., "Current (Active)"
4. Click **"Compare Years"** or wait for auto-comparison

### Comparison Metrics

**Overview Stats:**
- **Total Distance**: Side-by-side comparison
- **Difference**: Shows improvement/degradation
- **Efficiency Change**: Percentage change in average distance
- **Active LPs**: Change in number of landingsplasser
- **Reassignments**: Vann with different assignments

**Detailed Breakdown:**
- Average, Max, Min distances for each year
- Complete list of reassigned vann markers
- Distance change for each reassignment

### Use Cases

**Scenario 1: Year-over-Year Improvement**
- Compare 2025 vs 2026 to see if new layout is better
- Identify which changes led to improvements
- Learn from successful optimizations

**Scenario 2: Testing New Configurations**
- Create new landingsplasser in current year
- Compare against archived "known good" configuration
- Validate improvements before committing

**Scenario 3: Seasonal Adjustments**
- Compare summer vs winter configurations
- Different LPs may be accessible in different seasons
- Optimize for seasonal constraints

---

## Scenario Management

### Saving Scenarios

1. **Make changes** in Planning Mode (deactivate LPs)
2. **Review impact** in Impact Analysis
3. **Click "Save Scenario"**
4. **Enter details**:
   - **Name**: Descriptive name (e.g., "Reduced LPs - North Region")
   - **Description**: Optional notes about the scenario
5. **Click "Save Scenario"**

### Saved Scenario Metadata

Each scenario stores:
- Configuration (which LPs are active/inactive)
- Statistics (total distance, average, # of LPs, # of vann)
- Reassignment details (which vann moved to which LP)
- Metadata (created by, created date)
- Optimization parameters (if created via K-means)

### Loading Scenarios

1. Find scenario in **"Saved Scenarios"** section
2. Click **"Load"** button
3. Planning mode activates with saved configuration
4. Review and compare against current state

### Scenario Use Cases

**Testing Multiple Options:**
```
Scenario 1: "Baseline - All LPs Active"
- Total Distance: 1,234.5 km
- Active LPs: 18

Scenario 2: "Remove North LPs"
- Total Distance: 1,287.2 km (+52.7 km, +4.3%)
- Active LPs: 15
- Verdict: Worse, keep North LPs

Scenario 3: "K-Means 12 Clusters"
- Total Distance: 1,089.3 km (-145.2 km, -11.8%)
- Active LPs: 12
- Verdict: Best option!
```

---

## Database Schema

### New Tables

#### `planning_scenarios`
Stores saved planning configurations.

```sql
CREATE TABLE planning_scenarios (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  year TEXT NOT NULL,
  total_distance_km NUMERIC,
  average_distance_km NUMERIC,
  num_active_landingsplasser INTEGER,
  num_vann INTEGER,
  landingsplass_states JSONB NOT NULL,
  association_changes JSONB,
  optimization_metadata JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `planning_associations_temp`
Temporary association storage for scenario testing.

```sql
CREATE TABLE planning_associations_temp (
  id BIGSERIAL PRIMARY KEY,
  scenario_id BIGINT REFERENCES planning_scenarios(id),
  airport_id BIGINT NOT NULL,
  landingsplass_id BIGINT NOT NULL,
  distance_km NUMERIC,
  is_reassigned BOOLEAN DEFAULT false,
  previous_landingsplass_id BIGINT,
  distance_change_km NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Modified Tables

#### `vass_lasteplass` & `2026_vass_lasteplass`
Added planning mode field:

```sql
ALTER TABLE vass_lasteplass
ADD COLUMN is_active_in_planning BOOLEAN DEFAULT true;
```

#### `vass_associations` & `2026_vass_associations`
Added optimization metadata:

```sql
ALTER TABLE vass_associations
ADD COLUMN optimization_score NUMERIC,
ADD COLUMN is_optimal BOOLEAN DEFAULT true;
```

### Database Functions

#### `calculate_total_distance_for_year(table_prefix TEXT)`
Calculates aggregated distance statistics for a specific year.

**Returns:**
- `total_distance_km`: Sum of all distances
- `average_distance_km`: Mean distance
- `max_distance_km`: Longest connection
- `min_distance_km`: Shortest connection
- `num_associations`: Total count

**Usage:**
```sql
SELECT * FROM calculate_total_distance_for_year('2026');
SELECT * FROM calculate_total_distance_for_year(''); -- Current year
```

#### `find_closest_landingsplass(lat, lon, excluded_ids, table_prefix)`
Finds the nearest active landingsplass to a given coordinate.

**Parameters:**
- `vann_lat`: Latitude of vann marker
- `vann_lon`: Longitude of vann marker
- `excluded_lp_ids`: Array of LP IDs to exclude
- `table_prefix`: Year prefix ('' for current)

**Returns:**
- `lp_id`: ID of closest LP
- `lp_name`: LP code/name
- `distance_km`: Distance in kilometers

---

## API Reference

### Optimization Utilities (`/src/lib/optimizationUtils.ts`)

#### Distance Calculations

**`calculateDistance(lat1, lon1, lat2, lon2): number`**
- Uses Haversine formula for great-circle distance
- Returns distance in kilometers
- Accounts for Earth's curvature

**`findClosestLandingsplass(vann, landingsplasser, excludeIds?): {lp, distance} | null`**
- Finds nearest LP to a vann marker
- Optionally excludes specific LPs
- Only considers active LPs

#### Reassignment Algorithms

**`reassignVannFromDeactivatedLPs(deactivatedIds, vann, landingsplasser, associations): ReassignmentResult[]`**
- Calculates new assignments for affected vann
- Returns array of reassignment details
- Includes distance changes

**`calculateOptimizationStats(associations, landingsplasser, vann): OptimizationStats`**
- Computes comprehensive statistics
- Total, average, max, min distances
- Counts of LPs, vann, associations

#### K-Means Clustering

**`kMeansClustering(vann, k, maxIterations?): ClusterResult[]`**
- Implements K-means++ initialization
- Iterates until convergence or max iterations
- Returns cluster centroids and members

**`suggestOptimalK(vann, maxK?): {k, score, allScores}`**
- Elbow method for optimal cluster count
- Tests k=1 to k=maxK
- Returns suggested count and all scores

#### Year Comparison

**`compareYears(year1Data, year2Data): YearComparison`**
- Compares two yearly configurations
- Identifies reassigned vann
- Calculates efficiency changes

---

## Best Practices

### 1. **Start with Baseline**
Always document your current configuration before making changes:
```
Baseline Scenario: "2026 Production Config"
- Total Distance: X km
- Active LPs: Y
- Date: 2026-01-15
```

### 2. **Test Incrementally**
Don't deactivate multiple LPs at once:
- Deactivate one LP at a time
- Observe impact
- Document decision
- Move to next LP

### 3. **Consider Real-World Constraints**
K-means suggestions are mathematical optima, but consider:
- Land access permissions
- Terrain (slopes, forests, water)
- Seasonal accessibility
- Safety regulations
- Infrastructure proximity

### 4. **Use Scenarios for A/B Testing**
Save multiple options and compare:
```
Option A: "Consolidated North" (-12% distance, -3 LPs)
Option B: "Distributed East" (-8% distance, +2 LPs)
Option C: "K-Means 15" (-15% distance, -1 LP) ← Best
```

### 5. **Validate with Year Comparison**
After implementing changes:
1. Archive current year
2. Make optimizations
3. Compare new vs archived
4. Verify improvements are real

### 6. **Document Decisions**
Use scenario descriptions to record:
- Why you made changes
- What alternatives you tested
- Real-world factors that influenced decision
- Expected vs actual results

---

## Troubleshooting

### Issue: "No active landingsplass found for vann X"

**Cause**: All nearby LPs are deactivated

**Solution**: Activate at least one LP in the region, or increase search radius

### Issue: K-Means creates LPs in inaccessible locations

**Cause**: Algorithm doesn't know about terrain constraints

**Solution**: Manually adjust suggested positions to nearby accessible areas

### Issue: Scenarios showing different distances than expected

**Cause**: Underlying associations may have changed

**Solution**: Refresh the page and reload data from database

### Issue: Year comparison shows no data

**Cause**: Selected years may not have data in respective tables

**Solution**: Verify both year tables exist and have associations data

---

## Future Enhancements

Potential features for future development:

1. **Constraint-Based Optimization**
   - Mark areas as "no-go zones"
   - Require certain LPs to remain active
   - Set maximum distance thresholds

2. **Multi-Objective Optimization**
   - Optimize for distance AND tonnage distribution
   - Consider fuel costs vs setup costs
   - Balance coverage vs efficiency

3. **Map Visualization**
   - Show active/inactive LPs on map
   - Visualize reassignment lines
   - Heatmap of vann density

4. **Automated Recommendations**
   - AI suggests which LPs to deactivate
   - Proactive optimization alerts
   - Seasonal configuration suggestions

5. **Historical Tracking**
   - Track optimization changes over time
   - Performance trending
   - ROI calculations

---

## Contact & Support

For questions or issues with planning features:
- Check this guide first
- Review code in `/src/lib/optimizationUtils.ts`
- Check database migration: `planning_mode_migration.sql`
- Review component code: `/src/components/admin/PlanningTab.tsx`

---

**Last Updated**: 2025-11-19
**Version**: 1.0.0
**Tested with**: NextKalk v0.1.0, Next.js 15.4.4
