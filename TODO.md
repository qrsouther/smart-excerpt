# Blueprint Standard (SmartExcerpt) - Project TODO

This file tracks ongoing tasks, future enhancements, and technical debt for the Blueprint Standard Confluence app.

---

## Current Sprint / Active Work

None currently active.

---

## Phase 2: Internal Code Gradual Rename (Future)

**Status:** Planned but not started
**Priority:** Low (cosmetic improvement)
**Estimated Effort:** Medium (several hours spread across refactoring sessions)

### Objective
Align internal code (variable names, comments, JSDoc) with the new Blueprint Standard terminology while maintaining backward compatibility with storage keys and resolver names.

### Tasks
- [ ] Rename variables and function parameters during refactoring work
  - `excerpt` → `standard` (where it refers to the concept, not storage)
  - `include` → `embed` (where it refers to the concept, not storage)
  - Examples: `selectedExcerpt` → `selectedStandard`, `includeInstance` → `embedInstance`
- [ ] Add JSDoc aliases to functions to document both old and new terminology
- [ ] Update code comments to use new terminology
- [ ] Refactor gradually during normal maintenance (don't do all at once)

### Constraints
- **Keep unchanged:** Module keys, storage keys, resolver function names
- **Reason:** Backward compatibility with existing stored data and Forge API contracts
- **Approach:** Rename internal implementation only, not public interfaces

### Notes
- This is cosmetic - no functional changes required
- Can be done incrementally during other refactoring work
- Not urgent - only improves code readability for future developers

---

## Future Enhancements

### Content Versioning and History
- Track changes to Blueprint Standards over time
- Allow rollback to previous versions
- Show diff between versions

### Export/Import Blueprint Standards
- Export standards to JSON format
- Import standards from JSON
- Useful for backup and migration between Confluence instances

### Grammar/Spell Checking Integration
- Basic grammar checking for Blueprint Standard content
- Integration with external tools (Grammarly API, etc.)
- Highlight potential issues in admin preview

---

## Technical Debt

### Migration Code Cleanup (ONE-TIME USE)
**Status:** Marked for deletion after production migration complete

Files to delete after production setup:
- `src/resolvers/migration-resolvers.js` (entire file)
- Migration-related code in `src/index.js` (lines 69-219)
- Migration UI sections in `src/admin-page.jsx`

See `src/resolvers/migration-resolvers.js:10-16` for complete deletion checklist.

---

## Completed Work

### Phase 1: Display-Only Rename ✅ (v7.13.0)
- All UI strings updated to Blueprint Standard terminology
- Manifest display titles updated
- Deployed and verified in production

### Module Keys Update ✅ (v7.13.1)
- Updated all module keys to blueprint-standard-* naming
- Requires uninstall/reinstall for deployment

### Phase 3: File Name Alignment ✅
- Renamed `include-display.jsx` → `embed-display.jsx`
- Renamed `include-poc.jsx` → `embed-poc.jsx`
- Deleted obsolete files: `include-config-simple.jsx`, `include-edit.jsx`
- Updated all references in manifest and resolvers

---

**Last Updated:** 2025-11-05
**Current Version:** v7.13.1
