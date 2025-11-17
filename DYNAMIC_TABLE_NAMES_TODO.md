# Dynamic Table Names Implementation - Remaining Tasks

## Context

This project has implemented a year-based table archival system that allows administrators to:
1. Archive current year data by making existing tables READ-ONLY
2. Create new empty tables with year/prefix naming (e.g., `2025_project_vass_vann`)
3. Switch the entire application to use the new year tables

The infrastructure is **90% complete**, but database queries throughout the app still use **hardcoded table names** instead of the dynamic table name resolver.

## What's Already Done ✅

1. **Database Schema**:
   - `app_config` table created to store active year configuration
   - `distance_km` column added to `vass_associations` table
   - Migration system for creating year-based tables

2. **Infrastructure**:
   - Table name resolver utility: `/src/lib/tableNames.ts`
     - `getActiveTableNames()` - Fetches active table configuration
     - `getAppConfig()` - Gets current app config
     - `updateAppConfig()` - Updates app config
     - Includes caching mechanism (1-minute cache)

3. **Admin UI**:
   - Archive/Year Management tab in admin panel (`/src/app/admin/page.tsx`)
   - Generates migration SQL for table archival
   - Displays current active year

4. **User Feedback**:
   - Active year banner on main page (`/src/app/page.tsx:609-630`)
   - Shows "Viewing Year: 2025 - project_alpha" when not on current tables

5. **API**:
   - Archive API route: `/src/app/api/archive-tables/route.ts`

## What Still Needs to Be Done 🔧

All database queries need to be updated from hardcoded table names to use the dynamic resolver.

### Files That Need Updates

The following files contain hardcoded references to these tables and need to be updated:

**Tables to replace:**
- `vass_associations`
- `vass_info`
- `vass_info_documents`
- `vass_info_images`
- `vass_lasteplass`
- `vass_lasteplass_documents`
- `vass_lasteplass_images`
- `vass_vann`
- `vass_vann_documents`
- `vass_vann_images`

**Files to update:**

1. **`src/app/page.tsx`**
   - Lines ~211-260: `loadAirports()` function
   - Lines ~280-340: `loadLandingsplasser()` function
   - Lines ~360-400: `loadKalkMarkers()` function
   - Lines ~120-145: `loadCompletionUsers()` function

2. **`src/app/admin/page.tsx`**
   - Lines ~148-157: `loadLandingsplasser()` function
   - Lines ~159-168: `loadVannMarkers()` function
   - Lines ~180-228: `handleLpSave()` function
   - Lines ~230-249: `handleLpDelete()` function
   - Lines ~274-287: `handleVannEdit()` function
   - Lines ~302-466: `handleVannSave()` function
   - Lines ~468-488: `handleVannDelete()` function

3. **`src/components/MapContainer.tsx`**
   - Search for all `.from('vass_` occurrences
   - Update association queries, vann queries, lasteplass queries

4. **`src/components/MarkerDetailPanel.tsx`**
   - Search for all `.from('vass_` occurrences
   - Update marker detail loading queries

5. **`src/app/api/search/route.ts`**
   - Lines ~65-74: vass_vann search query
   - Lines ~101-145: vass_lasteplass search queries

6. **`src/lib/pdfExport.ts`**
   - Any references to the vass tables

7. **`src/components/ProgressPlan.tsx`**
   - Any references to vass tables

8. **`src/components/UserLogsModal.tsx`**
   - Any references to vass tables

## Implementation Steps

### Step 1: Add Table Names to Component State

For each component/page that queries the database:

```typescript
import { getActiveTableNames, type TableNamesConfig } from '@/lib/tableNames';

function MyComponent() {
  const [tableNames, setTableNames] = useState<TableNamesConfig | null>(null);

  useEffect(() => {
    async function loadTableNames() {
      const names = await getActiveTableNames();
      setTableNames(names);
    }
    loadTableNames();
  }, []);

  // ... rest of component
}
```

### Step 2: Update Database Queries

Replace hardcoded table names with dynamic ones:

**BEFORE:**
```typescript
const { data, error } = await supabase
  .from('vass_vann')
  .select('*');
```

**AFTER:**
```typescript
if (!tableNames) return; // Guard clause

const { data, error } = await supabase
  .from(tableNames.vass_vann)
  .select('*');
```

### Step 3: Handle Loading States

Make sure to handle the case where `tableNames` is still loading:

```typescript
if (!tableNames) {
  return <div>Loading configuration...</div>;
}
```

### Step 4: Test Each Component

After updating queries in a file:
1. Test that the component loads correctly
2. Test that CRUD operations work
3. Verify data is being read from/written to correct tables
4. Check browser console for errors

## Testing the Complete System

### Test Scenario 1: Default Tables (Current Year)
1. Ensure `app_config` has `active_year = 'current'`
2. Load the app - should use default table names
3. Verify banner does NOT show on main page
4. Test creating/editing markers

### Test Scenario 2: Archived Year Tables
1. Go to Admin → Archive/Year Management
2. Create archive for year "2025" with prefix "test"
3. Copy the generated SQL
4. Run SQL as migration (using Supabase MCP or dashboard)
5. Reload the app
6. Verify banner shows "Viewing Year: 2025 - test"
7. Verify all data is read from/written to `2025_test_*` tables
8. Verify old tables are READ-ONLY (try to insert - should fail)

## Important Notes

### Table Name Format
- Current tables: `vass_vann`, `vass_lasteplass`, etc.
- Archived tables with prefix: `{year}_{prefix}_{table}` (e.g., `2025_project_vass_vann`)
- Archived tables without prefix: `{year}_{table}` (e.g., `2025_vass_vann`)

### Caching
The table name resolver has a 1-minute cache. If you need to force a refresh:
```typescript
import { clearTableNamesCache } from '@/lib/tableNames';
clearTableNamesCache();
```

### Error Handling
Always include error handling when loading table names:
```typescript
try {
  const names = await getActiveTableNames();
  setTableNames(names);
} catch (error) {
  console.error('Failed to load table configuration:', error);
  // Fallback to default table names
  setTableNames(getDefaultTableNames());
}
```

## Performance Considerations

- The `getActiveTableNames()` function is cached for 1 minute
- Don't call it on every render - use `useState` + `useEffect`
- Consider using a global state management solution (Context API, Zustand, etc.) to share table names across components instead of fetching separately in each component

## Future Enhancements (Optional)

1. **Table Switcher UI**: Add a dropdown to let admins switch between different year tables without running migrations
2. **Automatic Cache Invalidation**: Clear cache when app_config is updated
3. **Global Table Names Context**: Create a React Context to share table names across all components
4. **Migration History**: Track which migrations have been run for which years

## Questions?

If you encounter issues:
1. Check browser console for errors
2. Verify `app_config` table has correct data
3. Check that table name resolver is returning expected values
4. Ensure all Supabase RLS policies are applied to new year tables

## Quick Reference

**Table Name Resolver Location**: `/src/lib/tableNames.ts`
**Archive API**: `/src/app/api/archive-tables/route.ts`
**Admin Archive UI**: `/src/app/admin/page.tsx` (Archive tab)
**Main Page Banner**: `/src/app/page.tsx:609-630`

## Estimated Time

- Updating all files: **2-3 hours**
- Testing: **1 hour**
- Bug fixes: **1 hour**
- **Total: 4-5 hours**

Good luck! 🚀
