# Index.js Refactoring Analysis

**Date:** 2025-10-30
**File Size:** 3,487 lines (108KB)
**Total Resolvers:** 37

## Executive Summary

The `src/index.js` file has grown to an unmaintainable size. This document catalogs all resolvers, helper functions, and their dependencies to enable safe refactoring.

---

## 1. Active Resolvers (30 - KEEP ALL)

These resolvers are actively called by frontend components and MUST be preserved:

### Content Management (7)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `detectVariablesFromContent` | 146-162 | source-config.jsx | Parse `{{variable}}` syntax from content |
| `detectTogglesFromContent` | 165-181 | source-config.jsx | Parse `{{toggle:name}}` syntax from content |
| `saveExcerpt` | 184-255 | source-config.jsx | Create/update Source excerpts with metadata |
| `getExcerpts` | 258-274 | include-config*.jsx | Get lightweight excerpt list (index) |
| `getExcerpt` | 277-311 | All components | Get single excerpt by ID with full data |
| `updateExcerptContent` | 314-376 | source-display.jsx | Auto-update content when Source body changes |
| `getAllExcerpts` | 747-771 | admin-page.jsx | Get all excerpts with full details for admin UI |

### Variable & Cache Management (5)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `saveVariableValues` | 380-462 | include-display.jsx | Store Include variable values, toggle states, custom insertions |
| `getVariableValues` | 719-744 | include-display.jsx | Retrieve variable values for Include macro |
| `saveCachedContent` | 465-490 | include-display.jsx | Store rendered content for optimistic rendering |
| `getCachedContent` | 493-515 | include-display.jsx | Retrieve cached content for Include display |
| `getPageTitle` | 694-717 | include-display.jsx | Fetch Confluence page title via API |

### Push Updates (2)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `pushUpdatesToAll` | 550-620 | admin-page.jsx | Update all Include instances of an excerpt |
| `pushUpdatesToPage` | 623-690 | admin-page.jsx | Update Includes on specific page only |

### Usage Tracking (3)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `trackExcerptUsage` | 868-962 | include-config-simple.jsx | Register Include usage of Source with page/heading data |
| `removeExcerptUsage` | 965-993 | include-config-simple.jsx | Unregister usage when Include deleted |
| `getExcerptUsage` | 997-1027 | admin-page.jsx | Get all pages using an excerpt with lastSynced data |

### Source Health Checks (2)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `checkAllSources` | 1053-1226 | admin-page.jsx | Active check: verify all Sources still exist on pages |
| `getOrphanedUsage` | 1229-1273 | admin-page.jsx | Find usage data for deleted excerpts |

### Include Verification (2)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `checkAllIncludes` | 1276-1628 | admin-page.jsx | Comprehensive Include verification with progress tracking |
| `getCheckProgress` | 1631-1654 | admin-page.jsx | Real-time progress for checkAllIncludes operation |

### Category Management (2)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `saveCategories` | 1768-1791 | admin-page.jsx | Save custom categories to storage |
| `getCategories` | 1794-1814 | admin-page.jsx | Retrieve categories list (default or custom) |

### Bulk Operations (2)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `deleteExcerpt` | 774-797 | admin-page.jsx | Permanently remove excerpt from storage |
| `bulkInitializeAllExcerpts` | 2676-3482 | admin-page.jsx | Initialize 147 migrated excerpts in bulk |

### Migration & Import (5)
| Resolver | Lines | Called By | Purpose |
|----------|-------|-----------|---------|
| `scanMultiExcerptIncludes` | 1840-2020 | admin-page.jsx | Scan for MultiExcerpt Include macros with progress |
| `getMultiExcerptScanProgress` | 2023-2046 | admin-page.jsx | Real-time progress for scan operation |
| `bulkImportSources` | 2119-2216 | admin-page.jsx | Bulk import MultiExcerpt Sources from JSON |
| `createSourceMacrosOnPage` | 2219-2436 | admin-page.jsx | Create Source macros on Confluence page |
| `convertMultiExcerptsOnPage` | 2439-2671 | admin-page.jsx | Convert MultiExcerpt macros to SmartExcerpt on page |

---

## 2. Unused Resolvers (7 - SAFE TO REMOVE)

These resolvers are defined but **never called** by any frontend component:

| Resolver | Lines | Reason | Safe to Remove? |
|----------|-------|--------|-----------------|
| `checkVersionStaleness` | 518-547 | Timestamp comparison done inline in frontend | ⚠️ REVIEW - May be future feature |
| `updateExcerptMetadata` | 800-835 | Never implemented in UI | ✅ YES - Dead code |
| `massUpdateExcerpts` | 838-865 | Bulk category update implemented differently | ✅ YES - Superseded |
| `sourceHeartbeat` | 1030-1049 | Passive heartbeat abandoned for active checking | ✅ YES - Replaced by checkAllSources |
| `importFromMultiExcerpt` | 1657-1703 | Single-item import not used (bulk import used instead) | ✅ YES - Not needed |
| `trackMigration` | 1706-1746 | Migration tracking not implemented in UI | ✅ YES - Dead code |
| `getMigrationStatus` | 1749-1765 | Migration status UI not implemented | ✅ YES - Dead code |

**Recommendation:** Remove all 7 unused resolvers (~330 lines saved)

---

## 3. Helper Functions (8)

### ADF & Content Parsing (2)
| Function | Lines | Used By | Purpose |
|----------|-------|---------|---------|
| `extractTextFromAdf` | 9-27 | detectVariables, detectToggles, checkAllIncludes | Recursively extract plain text from ADF nodes |
| `findHeadingBeforeMacro` | 30-61 | saveVariableValues, trackExcerptUsage | Find heading text above a macro by localId |

### Detection Utilities (2)
| Function | Lines | Used By | Purpose |
|----------|-------|---------|---------|
| `detectVariables` | 66-96 | saveExcerpt, updateExcerptContent, importFromMultiExcerpt | Regex-based detection of `{{variable}}` syntax |
| `detectToggles` | 99-125 | saveExcerpt, updateExcerptContent, importFromMultiExcerpt | Regex-based detection of `{{toggle:name}}` syntax |

### Storage Management (1)
| Function | Lines | Used By | Purpose |
|----------|-------|---------|---------|
| `updateExcerptIndex` | 128-143 | saveExcerpt, updateExcerptContent, deleteExcerpt, bulkImportSources, etc. | Maintain excerpt-index for fast listing |

### Migration Utilities (3)
| Function | Lines | Used By | Purpose |
|----------|-------|---------|---------|
| `decodeTemplateData` | 1817-1837 | scanMultiExcerptIncludes | Decode base64+zlib compressed MultiExcerpt data |
| `storageToPlainText` | 2049-2068 | bulkImportSources | Convert Confluence Storage XML to plain text |
| `cleanMultiExcerptMacros` | 2071-2116 | createSourceMacrosOnPage | Remove MultiExcerpt macros from storage content |

### External Utilities (1)
| Function | Source | Used By | Purpose |
|----------|--------|---------|---------|
| `generateUUID` | ./utils.js | 20+ resolvers | Generate UUID v4 for excerpts, progress, etc. |

---

## 4. Storage Keys Used

### Core Data
- `excerpt:{uuid}` - Individual excerpt data with content, variables, toggles
- `excerpt-index` - Lightweight list of all excerpts for fast retrieval
- `usage:{excerptId}` - Reverse index of which pages use which excerpts
- `macro-vars:{localId}` - Variable values, toggle states, lastSynced for each Include instance
- `macro-cache:{localId}` - Cached rendered content for optimistic rendering

### Configuration
- `categories` - Custom category list (or default)

### Progress Tracking
- `progress:{progressId}` - Real-time progress data for long-running operations

### Migration (Legacy - May be unused)
- `migration-tracker` - MultiExcerpt migration status (UNUSED - can be removed with unused resolvers)

---

## 5. Dependency Analysis

### Core Dependencies
- `@forge/resolver` - Resolver class
- `@forge/api` - storage, startsWith, api, route for Confluence API calls
- `./utils` - generateUUID function
- `zlib` (Node built-in) - Used in decodeTemplateData for migration

### Resolver Dependency Chains

**High-Level Resolvers** (called by frontend, orchestrate multiple operations):
- `saveExcerpt` → detectVariables, detectToggles, updateExcerptIndex
- `updateExcerptContent` → detectVariables, detectToggles, updateExcerptIndex
- `trackExcerptUsage` → findHeadingBeforeMacro, Confluence API
- `saveVariableValues` → findHeadingBeforeMacro, Confluence API
- `checkAllSources` → Confluence API (pages, storage content)
- `checkAllIncludes` → extractTextFromAdf, Confluence API, progress tracking
- `bulkImportSources` → storageToPlainText, updateExcerptIndex
- `createSourceMacrosOnPage` → cleanMultiExcerptMacros, Confluence API
- `convertMultiExcerptsOnPage` → Confluence API
- `scanMultiExcerptIncludes` → decodeTemplateData, Confluence API

**Low-Level Resolvers** (simple getters/setters):
- `getExcerpt`, `getExcerpts`, `getAllExcerpts` → Direct storage reads
- `getVariableValues`, `getCachedContent` → Direct storage reads
- `saveCachedContent` → Direct storage write
- `getCategories`, `saveCategories` → Direct storage read/write
- `getPageTitle` → Confluence API only

---

## 6. Proposed Refactoring Structure

```
src/
├── index.js                      # Main entry point (~100 lines)
│   - Import all resolver modules
│   - Register all resolvers with Resolver instance
│   - Export handler
│
├── resolvers/
│   ├── content-resolvers.js      # ~400 lines
│   │   - saveExcerpt, getExcerpt, getExcerpts, getAllExcerpts
│   │   - updateExcerptContent, deleteExcerpt
│   │
│   ├── variable-resolvers.js     # ~150 lines
│   │   - detectVariablesFromContent
│   │   - saveVariableValues, getVariableValues
│   │
│   ├── toggle-resolvers.js       # ~50 lines
│   │   - detectTogglesFromContent
│   │
│   ├── cache-resolvers.js        # ~100 lines
│   │   - saveCachedContent, getCachedContent
│   │
│   ├── usage-resolvers.js        # ~200 lines
│   │   - trackExcerptUsage, getExcerptUsage, removeExcerptUsage
│   │
│   ├── push-resolvers.js         # ~150 lines
│   │   - pushUpdatesToAll, pushUpdatesToPage
│   │
│   ├── health-resolvers.js       # ~350 lines
│   │   - sourceHeartbeat, checkAllSources, getOrphanedUsage
│   │   - checkAllIncludes, getCheckProgress
│   │
│   ├── category-resolvers.js     # ~50 lines
│   │   - saveCategories, getCategories
│   │
│   ├── bulk-resolvers.js         # ~850 lines (includes 147-item mapping)
│   │   - bulkInitializeAllExcerpts
│   │
│   └── migration-resolvers.js    # ~750 lines
│       - scanMultiExcerptIncludes, getMultiExcerptScanProgress
│       - bulkImportSources, createSourceMacrosOnPage, convertMultiExcerptsOnPage
│
├── utils/
│   ├── adf-utils.js              # ~60 lines
│   │   - extractTextFromAdf
│   │   - findHeadingBeforeMacro
│   │
│   ├── detection-utils.js        # ~70 lines
│   │   - detectVariables
│   │   - detectToggles
│   │
│   ├── storage-utils.js          # ~30 lines
│   │   - updateExcerptIndex
│   │
│   ├── confluence-api.js         # ~50 lines (if we want to wrap common API patterns)
│   │   - fetchPageData
│   │   - fetchPageTitle
│   │   - updatePageContent
│   │
│   └── migration-utils.js        # ~150 lines
│       - decodeTemplateData
│       - storageToPlainText
│       - cleanMultiExcerptMacros
│
└── constants.js                  # ~20 lines
    - Storage key patterns
    - Default categories
    - Regex patterns (if helpful)
```

---

## 7. Refactoring Execution Plan

### Phase 1: Extract Utilities (Low Risk)
**Files to create:** `utils/adf-utils.js`, `utils/detection-utils.js`, `utils/storage-utils.js`, `utils/migration-utils.js`
**Lines moved:** ~310 lines
**Risk:** VERY LOW - Pure functions with no side effects
**Testing:** Unit tests for each utility function

### Phase 2: Extract Simple Resolvers (Medium-Low Risk)
**Files to create:** `resolvers/category-resolvers.js`, `resolvers/cache-resolvers.js`, `resolvers/toggle-resolvers.js`
**Lines moved:** ~200 lines
**Risk:** LOW - Simple getters/setters with minimal dependencies
**Testing:** Integration tests via actual invokes

### Phase 3: Extract Core Content Resolvers (Medium Risk)
**Files to create:** `resolvers/content-resolvers.js`, `resolvers/variable-resolvers.js`
**Lines moved:** ~600 lines
**Risk:** MEDIUM - Core functionality, many dependencies
**Testing:** Full end-to-end testing of Source/Include workflow

### Phase 4: Extract Complex Resolvers (Medium-High Risk)
**Files to create:** `resolvers/usage-resolvers.js`, `resolvers/push-resolvers.js`, `resolvers/health-resolvers.js`
**Lines moved:** ~700 lines
**Risk:** MEDIUM-HIGH - Complex logic, Confluence API calls
**Testing:** Test usage tracking, push updates, health checks in admin UI

### Phase 5: Extract Migration Code (Low Risk - Rarely Used)
**Files to create:** `resolvers/migration-resolvers.js`, `resolvers/bulk-resolvers.js`
**Lines moved:** ~1600 lines
**Risk:** LOW - Only used during migration, not core functionality
**Testing:** Test bulk init and migration in test environment

### Phase 6: Clean Up & Remove Dead Code
**Remove:** 7 unused resolvers (~330 lines)
**Risk:** LOW - Not called anywhere
**Testing:** Verify app still works after removal

### Phase 7: Update Main Index
**File:** `src/index.js`
**Final size:** ~100 lines (import statements + resolver registration + export handler)
**Risk:** LOW - Simple orchestration
**Testing:** Deploy and verify all functionality

---

## 8. Migration Checklist

### Before Starting
- [ ] Create feature branch: `refactor/modularize-index-js`
- [ ] Run full test suite (if exists) and document baseline
- [ ] Document current deployment state
- [ ] Back up current `index.js` to `index.js.backup`

### Phase 1: Extract Utilities
- [ ] Create `src/utils/adf-utils.js` with extractTextFromAdf, findHeadingBeforeMacro
- [ ] Create `src/utils/detection-utils.js` with detectVariables, detectToggles
- [ ] Create `src/utils/storage-utils.js` with updateExcerptIndex
- [ ] Create `src/utils/migration-utils.js` with decodeTemplateData, storageToPlainText, cleanMultiExcerptMacros
- [ ] Update imports in index.js to reference new utils
- [ ] Test: `forge deploy` and verify basic functionality

### Phase 2: Extract Simple Resolvers
- [ ] Create `src/resolvers/category-resolvers.js`
- [ ] Create `src/resolvers/cache-resolvers.js`
- [ ] Create `src/resolvers/toggle-resolvers.js`
- [ ] Update index.js to import and register these resolvers
- [ ] Test: Verify categories work in admin, cache works in Include display

### Phase 3: Extract Core Content Resolvers
- [ ] Create `src/resolvers/content-resolvers.js`
- [ ] Create `src/resolvers/variable-resolvers.js`
- [ ] Update index.js to import and register these resolvers
- [ ] Test: Create Source, create Include, verify content displays

### Phase 4: Extract Complex Resolvers
- [ ] Create `src/resolvers/usage-resolvers.js`
- [ ] Create `src/resolvers/push-resolvers.js`
- [ ] Create `src/resolvers/health-resolvers.js`
- [ ] Update index.js to import and register these resolvers
- [ ] Test: Verify usage tracking, push updates, health checks in admin

### Phase 5: Extract Migration Code
- [ ] Create `src/resolvers/migration-resolvers.js`
- [ ] Create `src/resolvers/bulk-resolvers.js`
- [ ] Update index.js to import and register these resolvers
- [ ] Test: Verify bulk init still works (if needed)

### Phase 6: Remove Dead Code
- [ ] Remove checkVersionStaleness (after confirming not needed)
- [ ] Remove updateExcerptMetadata
- [ ] Remove massUpdateExcerpts
- [ ] Remove sourceHeartbeat
- [ ] Remove importFromMultiExcerpt
- [ ] Remove trackMigration
- [ ] Remove getMigrationStatus
- [ ] Test: Full app functionality still works

### Phase 7: Final Cleanup
- [ ] Finalize index.js (should be ~100 lines)
- [ ] Add JSDoc comments to all new modules
- [ ] Update README if necessary
- [ ] Run full test suite
- [ ] Deploy to test environment
- [ ] Verify all features work
- [ ] Deploy to production

### After Completion
- [ ] Delete index.js.backup
- [ ] Document new structure in README
- [ ] Create PR with detailed explanation
- [ ] Merge to main

---

## 9. Risks & Mitigation

### High Risk Areas
1. **Resolver Registration** - If resolvers aren't registered correctly, frontend calls will fail
   - **Mitigation:** Test each phase incrementally, verify invokes work before moving on

2. **Import Paths** - Incorrect relative paths could break everything
   - **Mitigation:** Use absolute imports where possible, test after each file creation

3. **Circular Dependencies** - Resolvers depending on each other could create import cycles
   - **Mitigation:** Keep utilities pure, avoid resolver-to-resolver dependencies

4. **Confluence API Calls** - Complex API logic in health checks and migration
   - **Mitigation:** Test heavily in test environment before production

### Medium Risk Areas
1. **Usage Tracking** - Complex logic with page fetching and heading anchors
   - **Mitigation:** Test usage tracking with real pages

2. **Push Updates** - Updates multiple Include instances, must not lose data
   - **Mitigation:** Test with small dataset first, verify updates work

### Low Risk Areas
1. **Simple Getters/Setters** - Category management, cache management
2. **Migration Code** - Rarely used, mostly standalone
3. **Utility Functions** - Pure functions, easy to test

---

## 10. Success Criteria

### Functional Requirements
- ✅ All 30 active resolvers work identically to before
- ✅ No breaking changes to frontend
- ✅ All storage operations work correctly
- ✅ Admin UI fully functional
- ✅ Source/Include macros work as expected

### Code Quality Requirements
- ✅ No file exceeds 850 lines
- ✅ Main index.js is ~100 lines
- ✅ All modules have clear, single responsibilities
- ✅ All functions have JSDoc comments
- ✅ No dead code remains

### Performance Requirements
- ✅ No performance degradation
- ✅ Resolver invocations take same time as before
- ✅ Memory usage unchanged

---

## Appendix: Unused Resolver Details

### checkVersionStaleness (Lines 518-547)
**Why unused:** Frontend does timestamp comparison inline
**Code pattern:**
```javascript
const excerptLastModified = new Date(excerpt.updatedAt);
const includeLastSynced = macroVars?.lastSynced ? new Date(macroVars.lastSynced) : new Date(0);
const isStale = excerptLastModified > includeLastSynced;
```
**Decision:** ⚠️ Keep for now - might be useful for future features

### updateExcerptMetadata (Lines 800-835)
**Why unused:** UI never implemented name/category editing via this resolver
**Decision:** ✅ REMOVE - Dead code

### massUpdateExcerpts (Lines 838-865)
**Why unused:** Bulk category updates not implemented in UI
**Decision:** ✅ REMOVE - Not needed

### sourceHeartbeat (Lines 1030-1049)
**Why unused:** Passive heartbeat strategy abandoned in favor of active checking
**Decision:** ✅ REMOVE - Replaced by checkAllSources

### importFromMultiExcerpt (Lines 1657-1703)
**Why unused:** Single-item import never used, only bulk import used
**Decision:** ✅ REMOVE - Not needed

### trackMigration (Lines 1706-1746)
**Why unused:** Migration tracking UI never implemented
**Decision:** ✅ REMOVE - Dead code

### getMigrationStatus (Lines 1749-1765)
**Why unused:** Migration status UI never implemented
**Decision:** ✅ REMOVE - Dead code
