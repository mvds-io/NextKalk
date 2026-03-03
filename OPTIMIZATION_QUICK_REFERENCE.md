# Optimization Features - Quick Reference Card

## 🎯 Access
**URL**: http://localhost:3001/admin
**Tabs**: "Planning & Optimization" | "Year Comparison"
**Permission**: Requires `can_edit_markers`

---

## 📊 Planning Mode

### Start Planning
1. Click **"Planning & Optimization"** tab
2. Click **"Enter Planning Mode"**
3. Current stats display at top

### Test Configuration
1. **Click** landingsplass card to toggle active/inactive
2. **Green** = Active, **Red** = Inactive
3. **Impact Analysis** shows automatically

### Save Your Work
1. Click **"Save Scenario"**
2. Enter name and description
3. **"Saved Scenarios"** section shows all

### Load Saved Config
1. Find scenario in list
2. Click **"Load"**
3. Planning mode activates with saved state

---

## 🤖 K-Means Optimization

### Run Optimization
1. Click **"Show Optimization"**
2. **Auto**: Click for suggested cluster count
3. **Manual**: Enter desired number
4. Click **"Run Optimization"**

### Apply Suggestions
1. Review cluster results table
2. Click **"Create Optimized LPs"**
3. New LPs created with prefix "OPT-"
4. Find in **"Landingsplasser"** tab

---

## 📈 Year Comparison

### Compare Two Years
1. Click **"Year Comparison"** tab
2. Select **Year 1** (baseline)
3. Select **Year 2** (comparison)
4. Results show automatically

### Interpret Results
- **Green** numbers = Improvement
- **Red** numbers = Degradation
- **Reassignments** table shows changes
- **Detailed Stats** at bottom

---

## 📋 Key Metrics Explained

| Metric | Meaning | Good/Bad |
|--------|---------|----------|
| **Total Distance** | Sum of all LP→Vann distances | Lower is better |
| **Average Distance** | Mean distance per vann | Lower is better |
| **Distance Change** | Difference from baseline | Negative (green) is good |
| **Efficiency Change** | Percentage improvement | Negative % is good |
| **Reassignments** | Vann with new LP assignments | Informational |
| **Active LPs** | Count of active landingsplasser | Fewer can be better |

---

## ⚡ Quick Workflows

### "Is this LP necessary?"
1. Enter Planning Mode
2. Deactivate the LP
3. Check Distance Change
4. If +km is small, LP may be redundant
5. If +km is large, LP is important

### "Find best LP layout"
1. K-Means Optimization
2. Click "Auto" for cluster count
3. Run Optimization
4. Create Optimized LPs
5. Save as scenario "K-Means Optimal"

### "Did we improve from last year?"
1. Year Comparison tab
2. Year 1 = Last year (e.g., "2026")
3. Year 2 = Current
4. Check if Distance Change is negative (good!)

### "Test multiple options"
1. Create Scenario A (deactivate LPs 1,5,9)
2. Note total distance
3. Activate All
4. Create Scenario B (deactivate LPs 2,7,12)
5. Compare which has lower distance

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Tab won't load | Check console (F12), refresh page |
| Can't save scenario | Enter a name in the dialog |
| No reassignments shown | All LPs still active, deactivate some |
| K-Means taking long | Normal for 1000+ vann, wait 5-10 sec |
| Year comparison empty | Check if both years have data |

---

## 💡 Pro Tips

1. **Always save baseline** - Before optimizing, save current config as "Baseline 2025"
2. **Test one change at a time** - Deactivate one LP, observe, then try another
3. **Use Auto K** - Usually gives good cluster count suggestion
4. **Document why** - Use scenario descriptions to explain your decisions
5. **Compare before applying** - Use Year Comparison to validate improvements

---

## 🎨 Color Coding

| Color | Meaning | Context |
|-------|---------|---------|
| 🟢 Green | Active / Improvement | LP cards, Distance decreases |
| 🔴 Red | Inactive / Degradation | Deactivated LPs, Distance increases |
| 🔵 Blue | Information | Stats, Metrics |
| 🟠 Orange | Warning / Attention | Reassigned vann count |
| ⚫ Gray | Neutral | Unchanged items |

---

## 📱 Keyboard Shortcuts

Currently no shortcuts implemented, but recommended additions:
- `Ctrl+S` - Save scenario
- `Ctrl+Z` - Activate All (reset)
- `Esc` - Close dialogs
- `Space` - Toggle selected LP

---

## 🚀 Next Actions

**After Testing:**
1. Review findings
2. Decide which scenarios to apply
3. Update production associations if desired
4. Commit to GitHub when ready

**Documentation:**
- Full Guide: `PLANNING_MODE_GUIDE.md`
- Test Checklist: `OPTIMIZATION_TEST_CHECKLIST.md`
- Implementation: `OPTIMIZATION_IMPLEMENTATION_SUMMARY.md`

---

**Version**: 1.0.0 | **Updated**: 2025-11-19 | **Status**: ✅ Ready
