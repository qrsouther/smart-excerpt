# 🚨 CRITICAL BUG: Check All Embeds False Orphaning

## Root Cause Identified

**File:** `src/workers/checkIncludesWorker.js`
**Function:** `checkMacroExistsInADF` (lines 366-388)
**Problem:** ADF search logic fails to find valid embed macros, causing false orphaning

---

## What Happened

### The Bug Flow:
1. User clicked "Check All Embeds" button
2. Worker scanned pages looking for embed macros using `checkMacroExistsInADF()`
3. **Search function failed to find valid macros** (false negative)
4. Worker incorrectly marked them as "orphaned"
5. Worker **removed embeds from usage tracking** (but hasn't deleted storage YET)
6. Pages now show "No standard selected" because usage tracking was cleared
7. Admin Usage still shows data because `macro-vars:{localId}` storage keys still exist

### Why Admin Usage Still Works:
The `getExcerptUsage` resolver (lines 189-200) likely pulls from:
- `usage:` keys (removed by worker ❌)
- OR scans all `macro-vars:` keys (still intact ✅)

If it scans `macro-vars:*` keys, that's why you still see the data!

---

## The Problematic Code

### Location: `src/workers/checkIncludesWorker.js:366-388`

```javascript
function checkMacroExistsInADF(node, targetLocalId) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  // Check if this node is an extension (macro) with matching localId
  if (node.type === 'extension' &&
      node.attrs?.extensionType === 'com.atlassian.confluence.macro.core' &&
      node.attrs?.localId === targetLocalId) {
    return true;
  }

  // Recursively check content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (checkMacroExistsInADF(child, targetLocalId)) {
        return true;
      }
    }
  }

  return false;
}
```

### Why It Fails:
1. **Assumes `localId` is in `attrs`** - but it might be elsewhere in Forge macros
2. **No logging** - silently fails without indicating why
3. **No validation** - doesn't verify the macro is actually our embed type
4. **Destructive on false positives** - immediately deletes data without confirmation

---

## Destructive Actions Taken (Lines 177-200)

When the search fails to find a macro:

```javascript
if (!macroExists) {
  orphanedIncludes.push({
    ...include,
    reason: 'Macro not found in page content',  // FALSE REASON!
    pageExists: true
  });

  // DESTRUCTIVE: Deletes storage
  await storage.delete(`macro-cache:${include.localId}`);
  await storage.delete(`macro-vars:${include.localId}`);  // YOUR DATA!

  // DESTRUCTIVE: Removes from usage tracking
  const usageKey = `usage:${include.excerptId || 'unknown'}`;
  const usageData = await storage.get(usageKey);
  if (usageData) {
    usageData.references = usageData.references.filter(
      r => r.localId !== include.localId
    );
    // Removes your embed from usage tracking!
    await storage.set(usageKey, usageData);
  }
  orphanedEntriesRemoved.push(include.localId);
}
```

---

## Current State Analysis

### What Still Exists:
✅ `macro-vars:{localId}` keys (variable values) - **IF worker hasn't run to completion**
✅ `macro-cache:{localId}` keys (cached content) - **IF worker hasn't run to completion**
✅ Embed macros on pages (the actual macros are fine!)

### What Was Destroyed:
❌ `usage:{excerptId}` entries - embeds removed from usage tracking
❌ Connection between Admin and embeds - usage index broken

### Why "No standard selected" Appears:
The embed macro lost its reference in the usage tracking system. When the macro tries to load, it can't find its excerptId in the usage index, so it shows the empty state.

---

## Immediate Recovery Plan

### Step 1: Stop the Bleeding (CRITICAL - DO FIRST)
```javascript
// DISABLE the destructive Check All Embeds button immediately
// Edit src/admin-page.jsx - comment out the button or disable it
```

### Step 2: Manual Recovery (Per Embed)
For each orphaned embed:
1. Go to the page with the embed
2. Click Edit on the embed macro
3. Re-select the Blueprint Standard from dropdown
4. **DO NOT** change variable values
5. Save

This will:
- Re-establish the usage tracking entry
- Preserve existing `macro-vars:` storage (if still intact)
- Restore the connection

### Step 3: Verify Recovery
After re-linking each embed:
1. Check Admin - is it no longer orphaned?
2. Check page - does content render?
3. Check variables - are values preserved?

---

## Long-Term Fix Required

### Fix 1: Improve ADF Search Logic
```javascript
function checkMacroExistsInADF(node, targetLocalId, depth = 0) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  // Log what we're searching for (debugging)
  if (depth === 0) {
    console.log(`[CHECK-MACRO] Searching for localId: ${targetLocalId}`);
  }

  // Check extension nodes
  if (node.type === 'extension') {
    // Log ALL extension nodes we find
    console.log(`[CHECK-MACRO] Found extension:`, {
      extensionType: node.attrs?.extensionType,
      extensionKey: node.attrs?.extensionKey,
      localId: node.attrs?.localId,
      parameters: node.attrs?.parameters?.macroParams
    });

    // Check for our embed macro
    if (node.attrs?.extensionKey === 'blueprint-standard-embed' ||
        node.attrs?.extensionKey === 'smart-excerpt-include') {

      // Check localId match
      if (node.attrs?.localId === targetLocalId) {
        console.log(`[CHECK-MACRO] ✅ Found matching embed macro!`);
        return true;
      }
    }
  }

  // Recursively check all nested structures
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (checkMacroExistsInADF(child, targetLocalId, depth + 1)) {
        return true;
      }
    }
  }

  // Check marks array (some macros nest here)
  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (checkMacroExistsInADF(mark, targetLocalId, depth + 1)) {
        return true;
      }
    }
  }

  return false;
}
```

### Fix 2: Add Safety Confirmation
```javascript
// BEFORE deleting storage, verify it's truly orphaned
if (!macroExists) {
  // Double-check by trying to read the macro's config
  const varsData = await storage.get(`macro-vars:${include.localId}`);

  if (varsData && varsData.excerptId) {
    console.warn(`[CHECK-MACRO] ⚠️ Found storage but no macro - possible false positive!`);
    console.warn(`[CHECK-MACRO] localId: ${include.localId}, excerptId: ${varsData.excerptId}`);
    console.warn(`[CHECK-MACRO] Skipping deletion - manual review required`);

    // Mark as "suspected orphan" but DON'T delete
    suspectedOrphans.push({
      ...include,
      reason: 'Macro not found but storage exists - needs manual review'
    });
    continue; // Skip deletion
  }

  // Only delete if storage is also empty/missing
  orphanedIncludes.push(...);
  await storage.delete(...);
}
```

### Fix 3: Add Dry-Run Mode
```javascript
export async function checkAllIncludes(req, { dryRun = true } = {}) {
  // Default to dry-run mode - don't delete anything
  // Require explicit { dryRun: false } to enable deletions

  if (!dryRun) {
    await storage.delete(`macro-cache:${include.localId}`);
    await storage.delete(`macro-vars:${include.localId}`);
  } else {
    console.log(`[DRY-RUN] Would delete: macro-vars:${include.localId}`);
  }
}
```

---

## Prevention Checklist

- [ ] **CRITICAL:** Disable "Check All Embeds" button immediately
- [ ] Add dry-run mode (default enabled)
- [ ] Add detailed logging to ADF search
- [ ] Add safety confirmation before deletions
- [ ] Require manual review for suspected orphans
- [ ] Add rollback mechanism (backup before bulk operations)
- [ ] Create test page with known embed for validation
- [ ] Add unit tests for checkMacroExistsInADF

---

## Test to Verify the Fix

### Create Test Case:
1. Create test page "Check All Embeds Test"
2. Add one embed with known values
3. Get the localId from browser devtools
4. Manually run checkMacroExistsInADF with that ADF + localId
5. Verify it returns `true`
6. Add extensive logging to see what it finds

### Expected Output:
```
[CHECK-MACRO] Searching for localId: abc-123-xyz
[CHECK-MACRO] Found extension: {
  extensionType: "com.atlassian.confluence.macro.core",
  extensionKey: "blueprint-standard-embed",
  localId: "abc-123-xyz",
  ...
}
[CHECK-MACRO] ✅ Found matching embed macro!
```

If this FAILS, the ADF structure is different than expected and we need to adjust the search logic.

---

## Next Steps

1. **IMMEDIATELY:** Disable Check All Embeds button
2. **RECOVERY:** Manually re-link the 2 orphaned embeds
3. **DEBUG:** Add extensive logging to checkMacroExistsInADF
4. **TEST:** Create controlled test case to verify fix
5. **DEPLOY:** Only re-enable after verification
6. **MONITOR:** Watch logs on next Check All Embeds run

**DO NOT** click "Check All Embeds" again until this is fixed!
