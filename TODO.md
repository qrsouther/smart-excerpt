# Blueprint Standard (SmartExcerpt) - Project TODO

This file tracks ongoing tasks, future enhancements, and technical debt for the Blueprint Standard Confluence app.

---

## Current Sprint / Active Work

### Enhanced Diff View with Ghost Mode Rendering
**Status:** Not Started - Implementation Plan Ready
**Priority:** High
**Estimated Effort:** Large (12-15 hours / 1.5-2 days)

**Background:**
Current diff view compares "apples to oranges" - rendered content on left vs raw source with `{{variable}}` tags on right. Users cannot meaningfully see what changed. Additionally, changes in disabled toggle blocks are invisible, causing false "nothing changed" diffs.

**Goal:**
Replace with professional diff that:
- Compares old Source vs new Source (both rendered with same variable values)
- Shows ALL content including disabled toggles (grayed out)
- Provides word-level green/red highlighting (like GitHub diffs)
- Prevents "blind updates" where changes exist only in disabled content

**Key Innovation - Ghost Mode Rendering:**
Disabled toggle content is visible in BOTH sides of diff (gray italic text) so users see changes even in content they're not currently using. Solves the "Update Available but looks identical" problem.

**Implementation Plan:**
See `ENHANCED_DIFF_VIEW_TODO.md` for comprehensive 8-phase implementation plan including:
- Phase 1: Add `syncedContent` to storage (store old Source ADF, not just hash)
- Phase 2: Install react-diff-viewer dependency
- Phase 3: Create ghost mode rendering functions (show disabled toggles in gray)
- Phase 4: Create ADF visual renderer with gray styling
- Phase 5: Create EnhancedDiffView component (text diff + visual preview)
- Phase 6: Integrate into embed-display.jsx
- Phase 7: Testing (6 scenarios including edge cases)
- Phase 8: Storage migration strategy (lazy migration)

**Dependencies:**
- `react-diff-viewer` npm package (~30KB)
- Existing ADF utils (substituteVariablesInAdf, etc.)

**Success Criteria:**
- ✅ Word-level diff with green/red highlighting
- ✅ Side-by-side visual preview
- ✅ Changes in disabled toggles ARE visible (grayed out)
- ✅ No "false identical" diffs
- ✅ Clear visual distinction enabled vs disabled content
- ✅ Performance <500ms render time

**Next Steps:**
1. Review implementation plan in ENHANCED_DIFF_VIEW_TODO.md
2. Begin Phase 1 (storage schema update)
3. Install react-diff-viewer
4. Implement ghost mode rendering functions

---

### Reincorporate Documentation Tab into Source Config Modal
**Status:** Planned for tomorrow
**Priority:** High
**Estimated Effort:** Small (feature already built, needs porting)

**Background:**
The Documentation tab was built in an experimental branch but never merged into main. Need to add it back to the Source macro's configuration modal.

**Implementation:**
- Locate Documentation tab code from experimental branch (if still available)
- Add new tab to Source config modal (source-config.jsx)
- Tab should display alongside existing Source configuration tabs
- Preserve any documentation/help text functionality that was built

**Next Steps:**
- Review experimental branch code for Documentation tab implementation
- Port to current main branch codebase
- Test in Source macro config modal

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

### Hypercritical Codebase Review (Post-Refactor)
**Status:** Planned for after embed-display.jsx refactoring
**Priority:** High (code quality audit)
**Estimated Effort:** Large (comprehensive review, multiple sessions)

**Philosophy:**
"If a crusty old software engineer with 30 years of experience can't understand your code from reading ONLY the code, comments, and README - without any conversation context - then your code is not optimized."

**Agent Role:**
A specialized "greybeard software engineering master" agent that approaches the codebase with completely fresh eyes, hypercritical standards, and zero context from development conversations.

**Constraints (What Agent Can Access):**
✅ **Allowed:**
- README.md and all documentation files
- Source code files (.js, .jsx, .yml)
- Code comments and JSDoc
- File/folder structure
- Import/export statements
- Git commit messages (for understanding evolution)

❌ **Not Allowed:**
- This conversation history
- Development decisions discussed verbally
- Intent or rationale not documented in code
- External context about "why we built it this way"

**Core Principle:**
If the agent cannot understand:
- What a function does
- Why a pattern was chosen
- How components interact
- What the data flow is
- When a function should be called

...then that is a FINDING. The code/comments are insufficient.

**Review Methodology:**

**Phase 1: Cold Start Comprehension Test**
1. Start with README.md only
2. Attempt to build mental model of system architecture
3. Document: "What I understand" vs "What is unclear"
4. Flag any architectural concepts not explained in README

**Phase 2: File-by-File Deep Dive**
For each file, answer:
- **Purpose:** Can I determine what this file does from its name, location, and opening comments?
- **Entry points:** Are the main functions clearly identified?
- **Data flow:** Can I trace data through functions without getting lost?
- **Side effects:** Are mutations, API calls, and state changes obvious?
- **Error handling:** Are failure modes handled and documented?
- **Edge cases:** Are boundary conditions handled and tested?

**Phase 3: Cross-File Analysis**
- **Dependencies:** Are import chains reasonable? Any circular dependencies?
- **Coupling:** How tightly are components/modules coupled?
- **Duplication:** Is code repeated when it should be shared?
- **Consistency:** Do similar operations use similar patterns?

**Phase 4: Pattern Recognition**
- **React patterns:** Hooks usage, component composition, prop drilling
- **State management:** React Query cache management, mutation patterns
- **ADF manipulation:** Tree traversal patterns, node transformation logic
- **Error boundaries:** How errors bubble up to users
- **Performance:** Unnecessary re-renders, expensive operations, memo opportunities

**Specific Review Targets:**

**1. Code Clarity Issues:**
- Functions >50 lines without internal comments explaining sections
- Magic numbers/strings without explanation
- Complex conditionals without explanation of business logic
- Deeply nested code (>3 levels) without structural comments
- Variable names that don't reveal intent
- Functions that do multiple things (SRP violations)

**2. Missing Documentation:**
- Exported functions without JSDoc
- Complex algorithms without explanation
- Non-obvious data structures without schema documentation
- API contracts not defined (resolver function signatures)
- Component props not documented
- Return values not explained

**3. Code Smells:**
- **Shotgun surgery:** Change requires touching many files
- **Feature envy:** Function uses another module's data more than its own
- **Data clumps:** Same 3+ parameters passed together repeatedly
- **Long parameter lists:** Functions with 5+ parameters
- **Divergent change:** File changes for multiple unrelated reasons
- **Primitive obsession:** Using primitives instead of small objects

**4. Anti-Patterns:**
- useEffect dependency arrays that lie
- Unhandled promise rejections
- Silent error swallowing (empty catch blocks)
- Mutation of props or state
- Stale closures in event handlers
- Missing loading/error states in UI
- Prop drilling >3 levels deep

**5. Architecture Issues:**
- Responsibilities not clearly separated
- Modules that know too much about others
- God objects (classes/modules doing everything)
- Hidden dependencies (globals, implicit state)
- Unclear data ownership (who owns this state?)

**6. Testing Gaps:**
- Functions that would be hard to unit test (too many dependencies)
- Business logic mixed with UI logic (untestable)
- No obvious test strategy for complex logic
- Side effects that can't be isolated

**7. Performance Concerns:**
- Expensive operations in render loops
- Missing memoization on expensive calculations
- N+1 query patterns
- Large bundle size contributors
- Inefficient algorithms (O(n²) where O(n) possible)

**8. Security/Safety:**
- User input not sanitized
- Secrets in code
- Unsafe ADF manipulation (XSS vectors)
- Missing input validation
- Error messages leaking implementation details

**Output Format:**

**Priority Ranking:**
- **Critical:** Bugs, security issues, data loss risks
- **High:** Major code smells, unclear architecture, hard-to-maintain code
- **Medium:** Minor smells, missing documentation, minor inconsistencies
- **Low:** Style issues, minor optimizations, nice-to-haves

**For Each Finding:**
```
Priority: [Critical/High/Medium/Low]
Category: [Clarity/Documentation/Smell/Anti-Pattern/Architecture/Testing/Performance/Security]
File: src/path/to/file.js:123-145
Issue: [One-sentence description]

Current Code:
[Relevant snippet]

Problem:
[Detailed explanation of what's wrong and why it matters]

Suggested Fix:
[Specific, actionable recommendation]

Rationale:
[Why this change improves the codebase]
```

**Success Criteria:**

The review is successful if it produces:
1. **Comprehensive findings:** Every file reviewed with specific feedback
2. **Actionable recommendations:** Clear "before/after" suggestions
3. **Prioritized work list:** Critical → High → Medium → Low
4. **Self-documenting score:** % of code that was immediately understandable vs required deep analysis
5. **Refactoring roadmap:** Ordered list of improvements with effort estimates

**Metrics to Track:**
- **Files reviewed:** Total count
- **Findings per file:** Distribution (which files are worst?)
- **Critical findings:** Count (should be 0 in production code)
- **Documentation gaps:** Functions without adequate comments/JSDoc
- **Cognitive complexity:** Files/functions that are "hard to understand"
- **Test coverage gaps:** Functions that would be hard to test

**Expected Duration:**
- **Phase 1-2:** 2-3 hours (architecture + initial file review)
- **Phase 3-4:** 3-4 hours (cross-cutting analysis + pattern recognition)
- **Report compilation:** 1-2 hours
- **Total:** 6-9 hours of agent work across multiple sessions

**Post-Review Action:**
Agent delivers comprehensive report. We then:
1. Triage findings (agree/disagree with each)
2. Create prioritized TODO items from findings
3. Schedule fixes based on priority
4. Re-run review after major fixes to measure improvement

**Key Insight:**
This review will be MORE VALUABLE after refactoring because:
- Cleaner baseline means real issues stand out
- Can validate refactoring decisions
- Findings more actionable on already-modular code
- Establishes quality bar for future code

**When to Run:**
After embed-display.jsx refactoring is complete and stable.

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

### Code Refactoring & Modularization (High Priority)
**Status:** Overdue - needs immediate attention
**Priority:** High
**Estimated Effort:** Large (multi-day refactoring effort)

**Background:**
Several files have grown into monoliths (>500 lines) with mixed responsibilities. We successfully modularized index.js (was 3000+ lines), and now need to apply the same treatment to other bloated files.

**Files Requiring Refactoring:**

#### 1. embed-display.jsx (2,093 → 1,343 lines) - IN PROGRESS ✅
**Status:** Phase 1 complete (35.8% reduction), Phase 2 in progress

**Phase 1 Complete (Utilities & Hooks Extraction):**
- ✅ Evaluated simple-adf-formatter library (GitHub-only, unreleased v0.1.0, not published to npm)
- ✅ Extracted 8 ADF utilities to `src/utils/adf-rendering-utils.js` (617 lines):
  - `cleanAdfForRenderer()`, `cleanupEmptyNodes()`, `filterContentByToggles()`
  - `stripToggleMarkers()`, `substituteVariablesInAdf()`, `insertCustomParagraphsInAdf()`
  - `insertInternalNotesInAdf()`, `extractParagraphsFromAdf()`
  - All functions include comprehensive JSDoc documentation
- ✅ Extracted 5 React Query hooks to `src/hooks/embed-hooks.js` (293 lines):
  - `useExcerptData()`, `useSaveVariableValues()`, `useAvailableExcerpts()`
  - `useVariableValues()`, `useCachedContent()`
  - All hooks include JSDoc documentation
- ✅ File reduced from 2,093 to 1,343 lines (750 lines removed)
- ✅ All files validated for syntax correctness

**Future Consideration - ADF Libraries:**
When building NEW ADF-related features (exports, transformations, etc.), scout these libraries first:
- `simple-adf-formatter` (https://github.com/dixahq/simple-adf-formatter) - 2kB, zero deps, callback-based
- Other Atlassian ecosystem tools
- Don't replace working code just to use a library - only adopt when solving NEW problems

**Phase 2 - UI Component Extraction (Optional):**
App component is still ~1,200 lines. Consider extracting:
- `<VariableConfigPanel />` - Variable input section (Write tab)
- `<ToggleConfigPanel />` - Toggle selection section (Alternatives tab)
- `<CustomInsertionsPanel />` - Free Write section (Custom tab)
- `<UpdateAvailableBanner />` - Update notification (view mode)
- `<DiffView />` - Side-by-side diff display (view mode)
- Move xcss styles to `src/styles/embed-styles.js`

**Target for Phase 2:** Break into 6-8 files, main file <400 lines

#### 2. admin-page.jsx (2,682 lines) - CRITICAL
**Current Issues:**
- Largest file in codebase
- Multiple admin functions in single component
- Many React Query hooks (excerpts, categories, usage, mutations)
- Multiple distinct UI sections (excerpt list, usage details, migration tools)
- Complex state management

**Refactoring Plan:**
- Extract React Query hooks to `src/hooks/admin-hooks.js`:
  - All query and mutation hooks (useExcerptsQuery, useCategoriesQuery, etc.)
- Split into feature-based components:
  - `<ExcerptListSidebar />` - Left sidebar with excerpt list
  - `<UsageDetailsPanel />` - Middle section showing usage for selected excerpt
  - `<ExcerptPreviewModal />` - Right side preview
  - `<CategoryManager />` - Category CRUD operations
  - `<MigrationTools />` - Migration section (if kept)
  - `<OrphanedItemsView />` - Orphaned sources/embeds display
- Extract business logic to `src/utils/admin-utils.js`:
  - CSV generation, filtering, sorting logic
  - Category management helpers
- Move styles to `src/styles/admin-styles.js`

**Target:** Break into 8-10 files, main file <500 lines

#### 3. verification-resolvers.js (690 lines)
**Current Issues:**
- Multiple verification functions in single file
- `checkAllIncludes` is very long (~400 lines)
- Mixed concerns: heartbeat tracking, staleness checking, async job management

**Refactoring Plan:**
- Split into focused files:
  - `src/resolvers/heartbeat-resolvers.js` - Source heartbeat tracking
  - `src/resolvers/staleness-resolvers.js` - Staleness detection logic
  - `src/resolvers/verification-queue-resolvers.js` - Async queue job triggers
- Extract common verification utilities to `src/utils/verification-utils.js`

**Target:** 3 files, each <300 lines

#### 4. simple-resolvers.js (660 lines)
**Current Issues:**
- Poorly named file (not actually "simple")
- Mix of unrelated resolver functions
- Should be split by feature domain

**Refactoring Plan:**
- Rename and split by domain:
  - `src/resolvers/content-detection-resolvers.js` - Variable/toggle detection
  - `src/resolvers/metadata-resolvers.js` - Page title, categories, etc.
  - `src/resolvers/cache-resolvers.js` - Cached content operations
- Keep only truly simple/utility resolvers in simple-resolvers.js

**Target:** 3-4 files, each <250 lines

#### 5. source-config.jsx (490 lines) - Medium Priority
**Current Status:** Close to threshold but manageable
**Watch for:** Adding more features will push it over 500 lines

**Potential Refactoring:**
- Extract detection logic to separate file if it grows
- Split variable/toggle metadata editors into separate components

**Refactoring Principles (Learned from index.js):**
1. **Single Responsibility:** Each file should have one clear purpose
2. **Feature Cohesion:** Group related functions together
3. **Size Target:** Files should be <400 lines (max 500)
4. **Clear Naming:** File names should clearly indicate their purpose
5. **Minimize Dependencies:** Reduce circular dependencies between modules
6. **Test Incrementally:** Refactor one section at a time, test thoroughly

**Execution Strategy:**
1. Start with embed-display.jsx (highest impact, most bloated)
2. Extract utilities first (safest, easiest to test)
3. Extract hooks second (contained side effects)
4. Split components last (most complex, affects UI)
5. Deploy and test after each major extraction
6. Move to admin-page.jsx once embed-display is stable
7. Tackle resolver files as time permits

**Success Metrics:**
- No file >600 lines
- Average file size <300 lines
- Improved test coverage for extracted utilities
- Faster development velocity (easier to find and modify code)
- Reduced merge conflicts (smaller, focused files)

### Migration Code Cleanup (ONE-TIME USE)
**Status:** Marked for deletion after production migration complete

Files to delete after production setup:
- `src/resolvers/migration-resolvers.js` (entire file - 1,628 lines)
- Migration-related code in `src/index.js` (lines 69-219)
- Migration UI sections in `src/admin-page.jsx`

See `src/resolvers/migration-resolvers.js:10-16` for complete deletion checklist.

**Note:** Removing migration code will reduce codebase by ~2,000 lines.

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
