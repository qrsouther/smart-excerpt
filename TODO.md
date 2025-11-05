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

### Redlining System (Status Management & Review Workflow)
**Status:** Requirements gathering
**Priority:** TBD
**Estimated Effort:** Large (multiple components)

**Overview:**
A review and status management tool for tracking the completeness/readiness of individual Embed instances across all Blueprint pages.

**Key Features:**
- **Granular status tracking:** Operates at the individual Embed level (not just Blueprint Standards as a whole)
- **Multiple assignment methods:** Both automatic (triggered by logic/conditions) and manual (team members marking statuses)
- **Status types:** Completeness/readiness indicators (specific statuses TBD)
- **Team collaboration:** Multiple people can review and update statuses
- **Aggregation view:** While individual Embeds are tracked, roll up to show overall Blueprint page readiness
- **Admin UI integration:** Dedicated space/view within the Admin page

**Use Cases:**
- Track which Embeds still need review (legal, technical, etc.)
- Monitor completion status of Blueprint documents
- Flag Embeds with outdated or missing variable values
- Systematic review workflow for quality assurance

**Technical Considerations:**
- Will need to query Embed instances via `macro-vars:*` storage keys
- Use existing resolvers like `getVariableValues()`, `getExcerptUsage()`
- May need new storage keys for status data per Embed instance
- UI component will live in `src/admin-page.jsx`

**Automatic Status Transitions (Content Change Detection):**

The contentHash system built for staleness detection will power automatic status transitions:

**Workflow Example:**
1. User manually marks Embed as "Complete" (approved/good-to-go)
2. System captures Embed's `approvedContentHash` at approval moment
3. User later modifies Embed (variables, toggles, custom insertions, or changes Blueprint Standard reference)
4. New `contentHash` is generated for modified Embed
5. System detects: `approvedContentHash ≠ currentContentHash`
6. **Automatic trigger:** Status changes "Complete" → "Needs Review"
7. Reviewer is alerted that previously-approved content requires re-review

**Key Technical Distinction:**
- `approvedContentHash`: Hash of FULL Embed content (variables filled in, toggles set, custom insertions, internal notes) - the complete rendered state that was approved
- `syncedContentHash`: Hash of raw Blueprint Standard Source content (used for "Update Available" detection)
- These serve different purposes: syncedContentHash tracks Source changes, approvedContentHash tracks post-approval Embed modifications

**Value:**
Automatic quality control - any change to approved content automatically requires re-approval. No manual tracking needed.

**Implementation Notes:**
- Add `approvedContentHash` to Embed storage schema (`macro-vars:{localId}`)
- Add `redlineStatus` field to same storage (values TBD: "Complete", "Needs Review", etc.)
- Add `approvedBy` and `approvedAt` fields for audit trail
- Comparison logic runs on Embed save and during Admin page queries
- Similar implementation pattern to "Update Available" detection but focused on post-approval modifications
- May need resolver function: `checkRedlineStatus(localId)` that compares hashes and returns status
- Admin UI will need to display status indicators and allow manual status updates
- Consider adding status change history/log for compliance tracking

**Next Steps:**
- Define complete list of status types and their meanings (Complete, Needs Review, Draft, etc.)
- Define other automatic trigger conditions beyond content changes
- Design UI mockup for status management view in Admin page
- Determine complete storage schema for status data
- Define user permissions/roles for status updates (who can mark Complete?)

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
