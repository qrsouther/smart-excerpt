# Blueprint App - Terminology Reference

**Purpose:** This document maps user-facing terminology (new branding) to internal code terminology (legacy naming) to ensure clear communication during development.

**Status:** Display names rebranded, internal code uses legacy names (intentional backward compatibility)

---

## Core Concept Mapping

| User-Facing Term | Internal Code Term | Description |
|------------------|-------------------|-------------|
| **Blueprint App** | excerpt/include (internal code) | Overall product/app name |
| **Blueprint Standard** | Excerpt | A reusable content block with variables/toggles |
| **Embed** | Include | An instance that displays a Blueprint Standard on a page |
| **Source** | Source | The macro where Blueprint Standards are created/edited |
| **Blueprint App Admin** | admin-page | Admin interface for managing Blueprint Standards |

---

## Macro Names

### User-Facing (Display Titles)
- **Blueprint Standard - Source** - Create/edit Blueprint Standards
- **Blueprint Standard - Embed** - Embed a Blueprint Standard on any page
- **Blueprint Standards Admin** - Admin interface

### Internal (Module Keys - DO NOT CHANGE)
- `blueprint-standard-source` - Module key for Source macro
- `blueprint-standard-embed` - Module key for Embed macro
- `blueprint-standards-admin` - Module key for Admin page

**IMPORTANT:** Module keys must remain unchanged for backward compatibility with existing page content.

---

## File Mapping

### When you say... I'll look in...

| User Request | File Location | Notes |
|--------------|---------------|-------|
| "Update the Embed macro display" | `src/include-display.jsx` | Display/rendering component for Embeds |
| "Modify Embed configuration UI" | `src/include-config.jsx` | Configuration dialog for Embeds |
| "Change Source macro display" | `src/source-display.jsx` | Display component for Sources |
| "Update Source configuration" | `src/source-config.jsx` | Configuration dialog for Sources |
| "Modify Admin page" | `src/admin-page.jsx` | Admin interface |
| "Update Blueprint Standard resolvers" | `src/resolvers/excerpt-resolvers.js` | Backend CRUD operations |
| "Modify Embed storage" | `src/resolvers/include-resolvers.js` | Backend config storage |

---

## Resolver Functions (Backend API)

### Blueprint Standard Operations (Excerpt Resolvers)

| User-Facing Action | Resolver Function | Purpose |
|-------------------|-------------------|---------|
| Create/Edit Blueprint Standard | `saveExcerpt(req)` | Create or update a Blueprint Standard |
| Update Blueprint Standard content | `updateExcerptContent(req)` | Auto-update content when Source edited |
| Get Blueprint Standard | `getExcerpt(req)` | Fetch Blueprint Standard data |
| List all Blueprint Standards | `getAllExcerpts(req)` | Get complete list with metadata |
| Delete Blueprint Standard | `deleteExcerpt(req)` | Remove Blueprint Standard |
| Update Blueprint Standard metadata | `updateExcerptMetadata(req)` | Edit name/category |
| Bulk update Blueprint Standards | `massUpdateExcerpts(req)` | Mass category changes |

### Embed Operations (Include Resolvers)

| User-Facing Action | Resolver Function | Purpose |
|-------------------|-------------------|---------|
| Save Embed configuration | `saveVariableValues(req)` | Save variable values, toggle states, custom insertions |
| Get Embed configuration | `getVariableValues(req)` | Retrieve Embed instance config |

### Usage Tracking

| User-Facing Action | Resolver Function | Purpose |
|-------------------|-------------------|---------|
| Track where Blueprint Standard is used | `trackExcerptUsage(req)` | Register Embed instance usage |
| Remove usage tracking | `removeExcerptUsage(req)` | Cleanup when Embed deleted |
| Get usage report | `getExcerptUsage(req)` | List all pages using a Blueprint Standard |
| Push updates to all Embeds | `pushUpdatesToAll(req)` | Force-refresh all instances |
| Push updates to specific page | `pushUpdatesToPage(req)` | Force-refresh page's instances |

---

## Storage Keys

### Blueprint Standard Data

| What It Stores | Storage Key Pattern | Example |
|----------------|---------------------|---------|
| Blueprint Standard content | `excerpt:{id}` | `excerpt:5e7f419c-e862-478a-a368-8ac9a78e4640` |
| Blueprint Standard index | `excerpt-index` | Single key with array of all IDs |
| Usage tracking | `excerpt-usage:{id}` | `excerpt-usage:5e7f419c-e862-478a-a368-8ac9a78e4640` |

### Embed Configuration Data

| What It Stores | Storage Key Pattern | Example |
|----------------|---------------------|---------|
| Embed instance config | `macro-vars:{localId}` | `macro-vars:abc-123-def` |

**Storage Schema - Blueprint Standard (excerpt:{id}):**
```javascript
{
  id: "5e7f419c-e862-478a-a368-8ac9a78e4640",
  name: "Client Profile",
  category: "General",
  content: { /* ADF document */ },
  contentHash: "139115ae78ee9ba42ce6b49c591991c15e6469afaee27ae732be47ffa92d6ff8",
  variables: [
    { name: "client", description: "Client name", example: "Acme Corp", multiline: false }
  ],
  toggles: [
    { name: "premium-features", description: "Show premium tier info" }
  ],
  sourcePageId: "80150529",
  sourceSpaceKey: "DEV",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-05T12:30:00.000Z"
}
```

**Storage Schema - Embed Config (macro-vars:{localId}):**
```javascript
{
  excerptId: "5e7f419c-e862-478a-a368-8ac9a78e4640",
  variableValues: {
    "client": "Acme Corp"
  },
  toggleStates: {
    "premium-features": true
  },
  customInsertions: [
    { position: 2, content: "Custom paragraph text" }
  ],
  internalNotes: [
    { position: 1, content: "Internal note for staff only" }
  ],
  cachedContent: { /* Rendered ADF */ },
  syncedContentHash: "139115ae78ee9ba42ce6b49c591991c15e6469afaee27ae732be47ffa92d6ff8",
  lastSynced: "2025-01-05T12:30:00.000Z",
  updatedAt: "2025-01-05T12:30:00.000Z"
}
```

---

## Key Concepts

### Content Hash System
**Purpose:** Detect actual content changes (not just page views/republishing)

**How it works:**
1. When Blueprint Standard is saved → `contentHash` calculated via SHA256
2. When Embed syncs → stores `syncedContentHash` matching current Blueprint Standard
3. When checking staleness → compare `contentHash` vs `syncedContentHash`
4. Hash includes: content, name, category, variables, toggles
5. Hash excludes: id, timestamps, source metadata

**Files involved:**
- `src/utils/hash-utils.js` - Core hashing utilities
- `src/resolvers/excerpt-resolvers.js:145-148` - Skip save if hash unchanged
- `src/resolvers/include-resolvers.js:33` - Store syncedContentHash
- `src/include-display.jsx:1147-1205` - Hash-based staleness detection

---

## Variable System

**Syntax:** `{{variable-name}}` in Blueprint Standard content

**How it works:**
1. Blueprint Standard content includes variables like `{{client}}`
2. Embed configuration provides values: `client: "Acme Corp"`
3. Rendered content substitutes: "Acme Corp is a valued customer"

**Variable metadata:**
- `name` - Variable identifier
- `description` - User-facing help text
- `example` - Sample value
- `multiline` - Boolean for textarea vs text input

---

## Toggle System

**Syntax:** `{{toggle:name}}` surrounding content in Blueprint Standard

**How it works:**
1. Blueprint Standard includes toggleable sections
2. Embed configuration enables/disables toggles
3. Disabled toggle content is hidden in rendered output
4. Toggle state stored per-Embed instance

**Toggle metadata:**
- `name` - Toggle identifier
- `description` - User-facing help text

---

## Free Write / Custom Insertions

**Purpose:** Add custom paragraph content at specific positions in Embeds

**How it works:**
1. User selects paragraph position from dropdown
2. Adds custom paragraph text
3. Custom content inserted at that position during rendering
4. Stored in Embed config's `customInsertions` array

---

## Internal Notes

**Purpose:** Add staff-only annotations that are hidden from external clients

**How it works:**
1. Superscript markers (¹, ², ³) appear inline
2. Collapsible panel at bottom shows all notes
3. External content filtering removes notes for client-facing displays
4. Stored in Embed config's `internalNotes` array

---

## Communication Examples

### Scenario 1: Adding a Feature to Embeds
**User says:** "Add a 'Copy to Clipboard' button to the Embed macro"

**I understand:**
- Target file: `src/include-display.jsx` (Embed = Include)
- Add button to Embed display component
- Implement copy functionality

### Scenario 2: Modifying Blueprint Standard Behavior
**User says:** "When saving a Blueprint Standard, also log the contentHash"

**I understand:**
- Target file: `src/resolvers/excerpt-resolvers.js`
- Modify: `saveExcerpt()` function
- Add console.log for `contentHash` field

### Scenario 3: Admin Page Enhancement
**User says:** "Add a Redlining UI to the Blueprint Standards Admin page"

**I understand:**
- Target file: `src/admin-page.jsx`
- Create new UI component for redlining workflow
- Will need to query Embed instances via `macro-vars:*` storage keys
- Use existing resolvers like `getVariableValues()`

---

## Future Phases

### Phase 1: Display-Only Rename ✅ (v7.13.0 - In Progress)
- Update manifest.yml display titles
- Update all UI strings in components
- Update README documentation
- **Keep unchanged:** module keys, storage keys, resolver names

### Phase 2: Internal Code Gradual Rename (Future)
- Rename variables and comments during refactoring work
- Add JSDoc aliases to functions
- **Keep unchanged:** module keys, storage keys (backward compatibility)

### Phase 3: File Name Alignment (Optional Future)
- Rename `include-display.jsx` → `embed-display.jsx`
- Rename `excerpt-resolvers.js` → `standard-resolvers.js`
- Only after all other work is stable

---

## Quick Reference Card

```
USER SAYS              →  CODE TERM         →  FILE/FUNCTION
─────────────────────────────────────────────────────────────
"Blueprint Standard"   →  excerpt           →  excerpt-resolvers.js
"Embed"                →  include           →  include-display.jsx
"Source macro"         →  source            →  source-display.jsx
"Admin page"           →  admin             →  admin-page.jsx
"Save Embed config"    →  saveVariableValues  →  include-resolvers.js
"Get Blueprint data"   →  getExcerpt        →  excerpt-resolvers.js
"Check if stale"       →  hash comparison   →  include-display.jsx:1170
```

---

**Last Updated:** 2025-11-04
**Version:** 7.12.0 (pre-rename) → 7.13.0 (post-rename)
