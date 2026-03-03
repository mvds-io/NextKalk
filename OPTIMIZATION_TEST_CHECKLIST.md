# Optimization Features - Test Checklist

## Pre-Testing Setup

- [x] Database migration applied (`planning_mode_migration.sql`)
- [x] Dev server running on http://localhost:3001
- [ ] User logged in with `can_edit_markers` permission
- [ ] Admin panel accessible at `/admin`

---

## 1. Planning Tab - Basic Functionality

### Access & UI
- [ ] Navigate to `/admin`
- [ ] Click on "Planning & Optimization" tab
- [ ] Verify tab loads without errors
- [ ] Check that current stats display (Total Distance, Avg Distance, Active LPs, Vann Markers)

### Planning Mode Activation
- [ ] Click "Enter Planning Mode" button
- [ ] Button changes to "Planning Mode Active" with green styling
- [ ] Landingsplass activation grid appears
- [ ] All landingsplasser show as active (green background)

### LP Deactivation
- [ ] Click on one landingsplass card
- [ ] Card background turns red
- [ ] Checkbox becomes unchecked
- [ ] If vann are assigned, red badge shows count
- [ ] Impact Analysis card appears

### Impact Analysis
- [ ] Reassignments table shows affected vann
- [ ] Distance Change shows + or - km
- [ ] Percentage change displays
- [ ] Reassignments count is correct
- [ ] Table shows old LP, new LP, old/new distances

### Multiple Deactivations
- [ ] Deactivate 2-3 landingsplasser
- [ ] Verify impact analysis updates
- [ ] Check that total distance change accumulates
- [ ] Verify all affected vann are listed

### Activate All
- [ ] Click "Activate All" button
- [ ] All LPs turn green
- [ ] Impact Analysis disappears
- [ ] Stats return to baseline

---

## 2. K-Means Optimization

### Show/Hide Optimization
- [ ] Click "Show Optimization" button
- [ ] Optimization section expands
- [ ] Input field for cluster count appears
- [ ] Click "Show" again to hide

### Manual Cluster Count
- [ ] Enter number like "10" in cluster count
- [ ] Click "Run Optimization"
- [ ] Cluster results table appears
- [ ] Each cluster shows position, members, tonnage, avg distance
- [ ] Results make geographic sense

### Auto-Suggest K
- [ ] Click "Auto" button next to cluster count
- [ ] Green text appears showing "Suggested: X clusters"
- [ ] Number populates in input field
- [ ] Makes sense for your dataset (typically 10-20)

### Create Optimized LPs
- [ ] Click "Create Optimized LPs" button
- [ ] Confirm dialog appears
- [ ] Click OK
- [ ] Success message shows number of LPs created
- [ ] Navigate to "Landingsplasser" tab
- [ ] Verify new LPs exist with prefix "OPT-"
- [ ] Check coordinates are reasonable
- [ ] Verify comments describe cluster details

---

## 3. Scenario Management

### Save Scenario
- [ ] In Planning Mode, deactivate 2-3 LPs
- [ ] Click "Save Scenario" button
- [ ] Dialog appears with name/description fields
- [ ] Enter name: "Test Scenario 1"
- [ ] Enter description: "Testing deactivation of LPs 5, 12, 18"
- [ ] Click "Save Scenario"
- [ ] Success message appears
- [ ] Dialog closes
- [ ] Saved Scenarios section shows new scenario

### Scenario Display
- [ ] Saved scenario card shows correct name
- [ ] Description displays
- [ ] Stats show (Total Distance, Avg Distance, Active LPs, Year)
- [ ] "Load" button is present

### Load Scenario
- [ ] Click "Activate All" to reset
- [ ] Click "Load" on saved scenario
- [ ] Planning Mode activates automatically
- [ ] Correct LPs are deactivated
- [ ] Impact Analysis shows same results as when saved

### Multiple Scenarios
- [ ] Create 2-3 different scenarios with different configs
- [ ] Verify all appear in Saved Scenarios section
- [ ] Load each one and verify correct state

---

## 4. Year Comparison Tab

### Access & UI
- [ ] Click on "Year Comparison" tab
- [ ] Tab loads without errors
- [ ] Two dropdown menus appear (Year 1, Year 2)
- [ ] Dropdowns show available years

### Run Comparison
- [ ] Select "Current (Active)" for Year 1
- [ ] Select "2026" (or another archived year) for Year 2
- [ ] Click "Compare Years" or wait for auto-comparison
- [ ] Loading indicator shows briefly

### Comparison Results - Overview
- [ ] Overview card displays
- [ ] Shows total distance for both years side-by-side
- [ ] Difference displays with correct sign
- [ ] Percentage change shown
- [ ] Color coding: green if improved, red if worse

### Comparison Results - Additional Stats
- [ ] Average distance shown for both years
- [ ] Active LPs change shown (e.g., "18 → 15")
- [ ] Reassignments count displays

### Reassignments Table
- [ ] If any vann were reassigned, table appears
- [ ] Shows vann name, Year 1 LP, Year 2 LP
- [ ] Distance change shown and color-coded
- [ ] Sorted by magnitude of change

### Detailed Statistics
- [ ] Side-by-side stats show for both years
- [ ] Max, Min, Total, Average distances all present
- [ ] Number of associations matches

### Different Year Combinations
- [ ] Try comparing 2026 vs Current
- [ ] Try Current vs 2026 (reverse)
- [ ] Verify results are consistent (opposite signs)

---

## 5. Integration Tests

### Planning → Scenario → Comparison
1. [ ] Create optimized scenario in Planning tab
2. [ ] Save as "Optimized Config"
3. [ ] Go to Year Comparison
4. [ ] Compare current vs archived year
5. [ ] Note improvement metrics

### Create Optimized LPs → Test Impact
1. [ ] Run K-means optimization (12 clusters)
2. [ ] Create optimized LPs
3. [ ] Go to "Vann Markers" tab
4. [ ] Edit a few vann to associate with new OPT-X LPs
5. [ ] Return to Planning tab
6. [ ] Check if total distance improved

### Scenario Comparison
1. [ ] Create Scenario A (deactivate LPs 1, 5, 9)
2. [ ] Create Scenario B (deactivate LPs 2, 7, 12)
3. [ ] Load Scenario A, note distance
4. [ ] Load Scenario B, note distance
5. [ ] Determine which is better

---

## 6. Edge Cases & Error Handling

### Empty States
- [ ] Test with 0 scenarios saved
- [ ] Test with no available archived years for comparison
- [ ] Test with all LPs deactivated (should warn/prevent)

### Invalid Data
- [ ] Try to create scenario with empty name
- [ ] Verify error message appears
- [ ] Try to run K-means with 0 clusters
- [ ] Try to run K-means with more clusters than vann

### Large Datasets
- [ ] Test with full production dataset (1000+ vann)
- [ ] Verify K-means completes in reasonable time (<10 sec)
- [ ] Check that reassignments table handles large data
- [ ] Verify pagination or scrolling works

### Concurrent Users
- [ ] Open in two browser tabs
- [ ] Make changes in tab 1
- [ ] Check if tab 2 sees changes (may need refresh)

---

## 7. Performance Tests

### Load Times
- [ ] Planning tab loads in < 3 seconds
- [ ] K-means optimization completes in < 10 seconds
- [ ] Year comparison completes in < 5 seconds
- [ ] No console errors during operations

### UI Responsiveness
- [ ] LP toggle is instant
- [ ] Impact analysis updates smoothly
- [ ] No lag when clicking buttons
- [ ] Smooth scrolling in tables

---

## 8. Data Integrity

### Database Checks
- [ ] Run query: `SELECT * FROM planning_scenarios;`
- [ ] Verify saved scenarios are in database
- [ ] Check `landingsplass_states` JSON is well-formed
- [ ] Verify `is_active_in_planning` column exists

### Associations Integrity
- [ ] Deactivate LP in planning mode
- [ ] Check that actual `vass_associations` table is NOT modified
- [ ] Planning mode should be non-destructive to production data
- [ ] Only "Create Optimized LPs" should write to actual tables

### Year Isolation
- [ ] Changes in planning mode on Current year
- [ ] Should NOT affect archived year tables
- [ ] Verify `2026_vass_*` tables remain unchanged

---

## 9. User Experience

### Tooltips & Help
- [ ] Check if tooltips explain features
- [ ] Verify stat labels are clear
- [ ] Confirm button labels are descriptive

### Error Messages
- [ ] Error messages are user-friendly
- [ ] Technical errors don't crash UI
- [ ] Network errors handled gracefully

### Visual Feedback
- [ ] Loading spinners show during operations
- [ ] Success/error colors are intuitive
- [ ] Active/inactive states are obvious

---

## 10. Documentation

- [x] PLANNING_MODE_GUIDE.md is complete
- [x] Code comments explain complex logic
- [x] Database migration is documented
- [x] README updated with new features
- [ ] Screenshots added to guide (optional)

---

## Issues Found

Document any issues discovered during testing:

| Issue # | Description | Severity | Status |
|---------|-------------|----------|--------|
| 1       |             |          |        |
| 2       |             |          |        |
| 3       |             |          |        |

---

## Sign-Off

- [ ] All critical features tested
- [ ] No blocking issues found
- [ ] Performance is acceptable
- [ ] Ready for user acceptance testing
- [ ] Documentation is complete

**Tested By**: _________________
**Date**: _________________
**Build**: _________________
**Notes**:
