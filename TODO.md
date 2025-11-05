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

**Redline Statuses:**

The following statuses will be supported:
1. **Reviewable** - Ready for initial review
2. **Content Complete** - Content is finalized but not yet fully approved
3. **Needs Revision** - Requires changes/corrections
4. **Complete** - Fully approved and good-to-go

(Additional statuses may be added later)

**Queue-Based Review Interface:**

A dedicated review UI that presents Embeds as a sequential stack for systematic review:

**Core UI Features:**
- **Stack/Queue view:** Display final rendered Previews of each Embed (leveraging existing modal preview functionality from Admin UI)
- **Sequential navigation:** Step through Embeds one at a time in queue fashion
- **Status actions:** Buttons/controls to update Redline Status for current Embed
- **Preview display:** Show full rendered Embed content exactly as it appears on the page

**Filtering:**
- Filter queue by Redline Status (show only "Needs Revision", etc.)
- Multiple status selection (show "Reviewable" + "Needs Revision")
- "Show all" option

**Sorting/Grouping Options:**

1. **By Redline Status:**
   - Group all Embeds by their current status
   - Review all "Needs Revision" items together, then move to "Reviewable", etc.
   - Natural workflow: tackle problems first, then review new content

2. **By Page:**
   - Review all Embeds within a specific Blueprint page in sequence
   - Useful for page-level quality assurance
   - Context: see how Embeds work together on the same page
   - Identifies page-level inconsistencies or gaps

3. **By Source (Blueprint Standard):**
   - Review ALL Embeds that reference the same Blueprint Standard Source
   - Ensure consistency of quality across different usage contexts
   - Uncover patterns: recurring mistakes, common misconfigurations
   - Identify if Source content itself needs improvement (if many Embeds using it have issues)

**Technical Implementation Notes:**
- Queue data structure: Array of Embed instances with metadata (localId, pageId, excerptId, status, preview content)
- Leverage existing `getExcerptUsage()` resolver to gather all Embeds
- Leverage existing `getVariableValues()` to get full Embed config for rendering
- May need new resolver: `getRedlineQueue(filters, groupBy)` that returns sorted/filtered Embed list
- Preview rendering can reuse existing ADF rendering logic from Admin page modals
- Consider pagination/lazy loading for large queues (100+ Embeds)
- Keyboard shortcuts for navigation (Next, Previous, Mark Complete, etc.)

**User Workflow Example:**
1. Admin opens Redlining Queue UI
2. Filters to show only "Needs Revision" status
3. Groups by Page to review one Blueprint at a time
4. Steps through each Embed, reading preview
5. Makes corrections (opens Embed in new tab to edit)
6. Returns to queue, marks as "Content Complete"
7. Moves to next Embed in queue

**Next Steps:**
- Define other automatic trigger conditions beyond content changes (initial status assignment rules)
- Design detailed UI mockup for queue interface (wireframe)
- Determine complete storage schema for status data
- Define user permissions/roles for status updates (who can mark Complete?)
- Consider status change notifications/alerts

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

### Expandable Debug View Component
**Status:** Planning
**Priority:** Medium (developer productivity)
**Estimated Effort:** Small (reusable component)

**Overview:**
Add an expandable debug panel to various UI contexts that reveals detailed technical information for troubleshooting and development.

**Implementation Locations:**

1. **Embed Macro Configuration Panel (top panel in edit mode):**
   - Show Embed's `contentHash` (current full rendered state)
   - Show Embed's `syncedContentHash` (Blueprint Standard Source hash)
   - Show full `macro-vars:{localId}` storage JSON blob
   - Copy buttons for contentHash and JSON blob

2. **Admin UI (when viewing Embed usage):**
   - Same information as Embed config panel
   - Useful for debugging from centralized admin view

3. **Source Macro Configuration Modal:**
   - Show Source's `contentHash` (raw content hash)
   - Show full `excerpt:{id}` storage JSON blob
   - Show detected variables and toggles
   - Copy buttons for contentHash and JSON blob

**UI Design:**
- Collapsible/expandable component (closed by default)
- Label: "🔧 Debug Info" or "Developer Tools"
- Monospace font for JSON display
- Syntax highlighting for JSON (optional, nice-to-have)
- Individual copy buttons for each data field
- "Copy All" button for full JSON

**Technical Notes:**
- Leverage existing `debugExcerpt` resolver (already returns full JSON)
- May need new resolver: `debugEmbed(localId)` for Embed-specific debug info
- Use `@atlaskit/code` component for formatted code display
- Use `@atlaskit/button` with copy icon
- Collapsible section: `@atlaskit/section-message` or custom accordion

**Use Cases:**
- Quick inspection of contentHash values during staleness debugging
- Verify variable values are stored correctly
- Inspect full storage structure without checking Forge logs
- Copy exact JSON for bug reports or support requests
- Compare hashes between Source and Embed to diagnose sync issues

**Next Steps:**
- Design expandable component UI mockup
- Implement `debugEmbed` resolver if needed
- Add debug panel to Embed config (embed-display.jsx)
- Add debug panel to Source config (source-config.jsx)
- Add debug panel to Admin UI usage view (admin-page.jsx)

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
