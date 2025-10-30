# SmartExcerpt - Confluence Forge App

A high-performance Forge app for Confluence that enables reusable content blocks with variable substitution and automatic updates.

## 🎯 Current Implementation

**Version:** 4.203.0
**Architecture:** Option 4 - Optimistic Rendering with Background Refresh

### How It Works

1. **SmartExcerpt Source Macro** - Create reusable content blocks with variables
2. **SmartExcerpt Include Macro** - Reference and display excerpts with variable substitution
3. **Performance Strategy:**
   - Cached content stored in Include config for instant display
   - Background refresh from source ensures content stays up-to-date
   - Best of both worlds: instant rendering + automatic updates

### On Page Load (Detailed Flow)

When a page with Include macros loads, here's exactly what happens:

#### 1. **Instant Display (0-100ms)**
   - Include macro reads `cachedContent` from its config
   - Immediately displays the cached content
   - **User sees content right away** - no "Loading..." message
   - Page is interactive and ready to use

#### 2. **Background Check (happens simultaneously, doesn't block display)**
   - Include calls `invoke('getExcerpt', { excerptId })` in the background
   - Fetches the latest Source excerpt from storage
   - Performs variable substitution with current variable values
   - Compares the fresh content to the cached content

#### 3. **Conditional Update (if needed)**
   - **If content unchanged:** Does nothing, keeps showing cached version
   - **If content changed:** Silently updates the display with fresh content
   - User might briefly see old content (~500ms-1s), then it smoothly updates

### Example Timeline

```
0ms:    Page loads
100ms:  Include displays cached "They are a full stack client." ← User sees this
100ms:  Background fetch starts (doesn't block anything)
500ms:  Source excerpt fetched and compared
600ms:  Content changed! Update display to "They are a full-stack agency."
```

### What Gets Cached

When you save an Include config, it stores:
```javascript
{
  excerptId: "abc-123",
  variableValues: {
    "stack-model": "full stack",
    "client": "Acme"
  },
  cachedContent: "Acme is a full stack organization."  // ← Pre-rendered result
}
```

The `cachedContent` is the fully rendered excerpt with all variables substituted, ready for instant display.

---

## 📦 Installation

### Prerequisites
- Forge CLI installed (`npm install -g @forge/cli`)
- Logged in to Forge (`forge login`)

### Deploy & Install

```bash
cd "/Users/quinnsouther/Documents/Code projects/smart-excerpt"
forge deploy
forge install --site qrsouther.atlassian.net
```

### Upgrade Existing Installation

```bash
forge install --upgrade
```

### Production Installation Configuration

When installing to a new Confluence environment (e.g., moving from development to production), you must update the Admin View link URL:

1. **Install the app** to your production Confluence site
2. **Access the Admin page** via: Settings → Manage apps → SmartExcerpt Admin
3. **Copy the full URL** from your browser's address bar
4. **Update the code** in `src/include-display.jsx` (around line 459):
   ```javascript
   // Find this line and replace with your production URL
   await router.navigate('/wiki/admin/forge?id=ari%3Acloud%3A...');
   ```
5. **Redeploy** with `forge deploy` and upgrade with `forge install --upgrade`

**Why this is needed:** The Admin page URL contains an extension ID that is unique per installation and cannot be determined programmatically. The "Admin View" button in Include macros uses this URL to provide quick access to the admin panel.

---

## 🔄 MultiExcerpt to SmartExcerpt Migration

### Migration Overview

This project includes tools to migrate existing Confluence pages from the MultiExcerpt macro plugin to SmartExcerpt. The migration was successfully completed for a test page with 147 MultiExcerpt macros.

### What the Migration Does

1. **Clones MultiExcerpt Macros** - Creates SmartExcerpt Source macros alongside existing MultiExcerpt macros
2. **Preserves Content** - Copies all content, including rich text formatting, from MultiExcerpt to SmartExcerpt
3. **Assigns UUIDs** - Generates unique identifiers for each excerpt for ID-based referencing
4. **Bulk Initialization** - Populates Forge storage with all excerpt data and metadata
5. **Enables Admin Features** - Makes all excerpts available in the Admin UI with full functionality

### Migration Scripts

The following scripts are included in the project root:

#### Core Migration Scripts
- **`clone-macros.js`** - Clones MultiExcerpt macros to SmartExcerpt Source macros on a page
- **`migrate-content.js`** - Updates page content via Confluence API (optional migration path)
- **`migrate-macros.js`** - Main migration orchestrator (combines clone + content operations)
- **`fix-excerpt-ids.js`** - Assigns unique UUIDs to cloned excerpts

#### Reference Data
- **`smartexcerpt-name-uuid-mapping.csv`** - Critical mapping file containing excerpt names, UUIDs, and categories for all 147 migrated excerpts

### Migration Process for Corporate Deployment

When ready to migrate to your corporate Confluence instance (seatgeek.atlassian.net), follow these steps:

#### Prerequisites
```bash
# Required environment variables
export CONFLUENCE_EMAIL="your.email@company.com"
export CONFLUENCE_API_TOKEN="your-api-token"
```

#### Step 1: Clone Macros to Target Page
```bash
# Clone all MultiExcerpt macros to SmartExcerpt Source macros
node clone-macros.js --page-id YOUR_CORPORATE_PAGE_ID
```

#### Step 2: Assign UUIDs
```bash
# Generate and assign unique IDs to each excerpt
node fix-excerpt-ids.js --page-id YOUR_CORPORATE_PAGE_ID
```

This will create a new CSV mapping file with your corporate page's excerpts.

#### Step 3: Bulk Initialize Excerpts in Forge Storage

1. **Add bulk initialization resolver to `src/index.js`** (if not already present)
2. **Update the UUID mapping** in the resolver with your new CSV data
3. **Update `sourcePageId`** from test page ID `80150529` to your corporate page ID
4. **Deploy to production:**
   ```bash
   forge deploy --environment production
   ```

5. **Access the Admin UI** in your corporate Confluence
6. **Click "Bulk Initialize All Excerpts"** button
7. **Verify** all 147 excerpts appear in the Admin page list

#### Step 4: Verify Migration Success

After bulk initialization:
- ✅ Admin page should list all 147 excerpts
- ✅ "View Source" buttons should navigate to corporate page
- ✅ Excerpt categories should be properly assigned
- ✅ Check All Sources should show all excerpts as active

### Important Notes for Corporate Migration

1. **Page ID Hardcoding** - The test implementation hardcodes page ID `80150529` (qrsouther.atlassian.net). You must update this to your corporate page ID in:
   - `bulkInitializeAllExcerpts` resolver in `src/index.js`
   - Any other references to sourcePageId

2. **Environment Differences** - Test instance is on `qrsouther.atlassian.net`, production will be on `seatgeek.atlassian.net`

3. **UUID Preservation** - Keep the `smartexcerpt-name-uuid-mapping.csv` file as a backup reference for all excerpt UUIDs

4. **Content Format** - Migration scripts handle Confluence Storage Format (XML) to ADF conversion automatically

5. **Bulk Init Considerations** - The bulk initialization resolver:
   - Creates individual `excerpt:{uuid}` storage entries
   - Updates the central `excerpt-index` for Admin UI listing
   - Sets `sourcePageId` for "View Source" functionality
   - Assigns categories from the mapping CSV

### Migration Script Details

#### `clone-macros.js`
- Fetches page content via Confluence REST API v2
- Parses Confluence Storage Format XML
- Finds all `multiexcerpt-macro` instances
- Creates corresponding `smart-excerpt-source` macros
- Preserves all content formatting

#### `fix-excerpt-ids.js`
- Scans page for SmartExcerpt Source macros without UUIDs
- Generates UUID v4 for each excerpt
- Extracts excerpt names from macro parameters
- Creates CSV mapping file for bulk initialization
- Updates page with assigned UUIDs

#### Bulk Initialization Resolver
Located in `src/index.js`, the `bulkInitializeAllExcerpts` resolver:
- Reads UUID mappings from embedded CSV data
- Creates storage entries for each excerpt
- Populates excerpt metadata (name, category, sourcePageId)
- Updates excerpt-index for Admin UI
- Returns success/failure counts

### Troubleshooting Migration

**If Admin page shows 0 excerpts after initialization:**
- Ensure `excerpt-index` is updated in bulk init resolver
- Check browser console for storage errors
- Verify bulk init resolver returned success count

**If "View Source" doesn't work:**
- Verify `sourcePageId` is set correctly in excerpt entries
- Check that page ID matches your corporate page

**If content preview is blank:**
- This is expected - content preview requires Confluence Storage Format to ADF conversion
- Users can still edit content on source page via "View Source"

### CSV Mapping File Format

```csv
Excerpt Name,UUID,Category
"Project Evaluation","a1b2c3d4-e5f6-7890-1234-567890abcdef","General"
"Technical Stack","f1e2d3c4-b5a6-9870-4321-fedcba098765","Technical"
...
```

Each row contains:
- **Excerpt Name** - The name from the MultiExcerpt macro
- **UUID** - Unique identifier (generated by fix-excerpt-ids.js)
- **Category** - Organization category (General, Technical, etc.)

---

## ✨ Features

### Current Features (v4.203.0)

✅ **ID-Based References** - UUID-based excerpt identification for rename-safe references

✅ **Variable Substitution** - Mad-libs style variables using `{{variable-name}}` syntax

✅ **Required Field Validation** - Mark variables as required with visual indicators (asterisk, warning icon, colored status)

✅ **Category Organization** - Group excerpts by category with customizable categories

✅ **Category Management** - Add, edit, delete, and reorder categories via Admin UI

✅ **Live Preview** - See rendered content as you configure Includes

✅ **Optimistic Rendering** - Instant page loads with background content refresh

✅ **Automatic Updates** - Includes update when Source excerpts are edited

✅ **Staleness Detection** - Visual notifications when Source content has been updated since Include last synced

✅ **Diff View** - Side-by-side comparison of current cached content vs latest Source content with all tags visible

✅ **Hyphenated Variable Names** - Full support for variable names with hyphens (e.g., `{{stack-model}}`)

✅ **Rich Text Content** - Full WYSIWYG editing for Source macros with bold, italic, tables, and more

✅ **Free Write Feature** - Insert custom paragraph content at chosen positions within Include macros

✅ **Toggle Content Blocks** - Show/hide sections using `{{toggle:name}}` syntax

✅ **Advanced Search & Filtering** - Search excerpts by name, filter by category, sort by name/usage/category

✅ **Excerpt Usage Reporting** - Detailed view of which pages use each excerpt, with variable values and toggle states

✅ **Bulk Operations** - Mass update categories, push updates to all instances or specific pages

✅ **Push-Based Updates** - Manually push Source updates to all Include instances or specific pages from Admin UI

✅ **Orphaned Source Detection** - Active checking to identify Sources deleted from their pages with remediation options

✅ **Orphaned Include Detection** - Identify Includes referencing deleted Sources with cleanup capabilities

✅ **Heading Anchor Navigation** - Direct navigation to excerpt locations within pages via heading anchors

✅ **Usage Deduplication** - Smart display of unique page usage, eliminating duplicate entries

✅ **Timestamp Tracking** - Track and display when Sources were last modified and when Includes last synced

✅ **Check All Includes** - Comprehensive verification and reporting system with real-time progress tracking and CSV export

### In Development

⏳ Content versioning and history
⏳ Export/import excerpts

---

## 🏗️ Architecture

### Performance Strategy Evolution

We evaluated three approaches to optimize Include macro rendering:

#### **Original Approach (Baseline)**
- Each Include calls backend on page load
- Fetches excerpt from storage, performs variable substitution
- Performance: ~1-2 second initial load per Include

#### **Option 1: Pre-rendered Content (Not Implemented)**
- Store fully rendered content in Include config
- Zero backend calls, instant display
- **Trade-off:** Manual refresh needed when Source changes
- **Performance:** Instant (0ms) - best possible
- **Use case:** Ideal when Sources rarely change

#### **Option 4: Optimistic Rendering (Current Implementation)** ⭐
- Store cached content in Include config
- Display cached content immediately
- Refresh from source in background
- **Trade-off:** Brief network activity after initial display
- **Performance:** Instant perceived load (~100ms) + background refresh
- **Use case:** Balance of performance and maintainability

---

## 🔮 Future Enhancement: Push-Based Updates (Not Implemented)

### Concept: Option 1 + Indexed Push Updates

We explored a hybrid approach that would combine Option 1's instant performance with automatic updates:

#### How It Would Work

1. **Normal Operation**
   - Includes display pre-rendered content (instant, zero backend calls)
   - Zero overhead during page loads

2. **When Source Excerpt Edited**
   - Backend maintains an index: `excerpt:{excerptId} → [pageIds using it]`
   - On Source save, trigger bulk update of all Include configs
   - Update stored `renderedContent` for each Include

3. **Benefits**
   - Option 1 performance (instant loads, zero network overhead)
   - Automatic updates when Sources change
   - No continuous background fetching

#### Technical Requirements

**New Permissions Needed:**
```yaml
permissions:
  scopes:
    - write:confluence-content  # To update page content
    - search:confluence          # To find pages with Includes
```

**Implementation Components:**

1. **Include Usage Index**
```javascript
// Stored in Forge storage
{
  "excerpt-usage:{excerptId}": {
    "pages": [
      { pageId: "123", macroId: "abc" },
      { pageId: "456", macroId: "def" }
    ]
  }
}
```

2. **Registration on Include Save**
```javascript
// When Include is configured
await invoke('registerIncludeUsage', {
  excerptId: selectedExcerptId,
  pageId: context.extension.content.id,
  macroId: context.extension.macro.id
});
```

3. **Bulk Update on Source Edit**
```javascript
// When Source is saved
async function updateAllIncludes({ excerptId, newContent, variables }) {
  const usage = await storage.get(`excerpt-usage:${excerptId}`);

  for (const { pageId, macroId } of usage.pages) {
    await updateMacroOnPage(pageId, macroId, newContent);
  }
}
```

#### Technical Challenges

⚠️ **Risk Level: Medium-High**

**Challenges:**
1. **XML Manipulation** - Must parse and modify Confluence storage format XML safely
2. **Macro Targeting** - Macro IDs may not be reliable for targeting specific instances
3. **Permissions** - App may not have permission to edit all pages
4. **Version Conflicts** - Pages being edited during update could cause conflicts
5. **Page History Spam** - Each update creates a page version
6. **Error Handling** - Failed updates could leave Includes out of sync
7. **Performance** - Updating 50+ pages on Source edit could be slow

**Confidence Level:** 70-75%
- Core concept is sound
- Forge API limitations create uncertainty around page modification
- Would require significant testing and error handling

#### Decision Criteria for Implementation

Consider this approach if:
- ✅ You frequently have 20+ Includes per page
- ✅ Option 4's background refresh causes noticeable lag
- ✅ Sources are edited frequently (daily)
- ✅ You have developer resources for XML parsing and error handling

Current recommendation: **Stick with Option 4** unless performance issues emerge.

---

## 📁 Project Structure

```
smart-excerpt/
├── manifest.yml              # Forge app configuration
├── package.json              # Dependencies
├── src/
│   ├── index.js             # Backend resolver (storage operations)
│   ├── source-display.jsx   # Source macro display view
│   ├── source-config.jsx    # Source macro configuration UI
│   ├── include-display.jsx  # Include macro display (optimistic rendering)
│   └── include-config.jsx   # Include macro configuration UI (with preview)
└── README.md                # This file
```

---

## 🔧 Configuration

### Available Categories
- General
- Pricing
- Technical
- Legal
- Marketing

These can be customized in `src/source-config.jsx`.

### Variable Syntax
Use double curly braces to define variables in excerpt content:
```
The {{client}} is a {{stack-model}} organization.
```

Variables are automatically detected and can be filled in when configuring Includes.

### Free Write Feature
The Free Write feature allows you to insert custom paragraph content at specific positions within an Include macro:

1. Open an Include macro in edit mode
2. Navigate to the "Free Write" tab
3. Select a paragraph position from the dropdown (shows last sentence of each paragraph)
4. Enter your custom paragraph text
5. Click "Add Custom Paragraph"
6. Your custom content will appear in the preview and be inserted at that position when rendered

**Use Cases:**
- Add client-specific context between standard paragraphs
- Insert custom disclaimers or notes
- Personalize template content without modifying the Source excerpt

**Features:**
- Add multiple custom paragraphs at different positions
- Remove custom paragraphs individually
- Auto-saves with other Include configurations
- Appears immediately in live preview

### Staleness Detection & Diff View
When viewing a published page with Include macros, the app automatically detects if the Source excerpt has been updated since the Include was last synced:

**Update Available Banner:**
- Green success banner appears when Source has been updated
- Displays prominent "Update Available" heading
- Shows descriptive text about the update
- Two action buttons: "Update" (primary) and "View Diff" (secondary)

**How It Works:**
1. Compares Source `updatedAt` timestamp with Include `lastSynced` timestamp
2. If Source is newer, displays the update notification banner
3. Click "View Diff" to see side-by-side comparison
4. Click "Update" to refresh cached content immediately

**Diff View Features:**
- **Left side (gray border):** Your current rendered version with current toggle/variable settings
- **Right side (green border):** Latest raw Source content with all `{{variable}}` and `{{toggle:name}}` tags visible
- See exactly what changed in the Source, including content in disabled toggles
- Make informed decisions about whether to accept the update

**Use Cases:**
- Identify when Source excerpts have been updated
- Review changes before accepting updates
- See raw Source syntax including all toggle tags and variable placeholders
- Understand which content sections are controlled by which toggles

---

## 🎛️ Admin UI Features

Access the Admin UI via: **Settings → Manage apps → SmartExcerpt Admin**

### Search, Filter & Sort
- **Search by Name:** Real-time search across all excerpt names
- **Filter by Category:** Dropdown to filter excerpts by category
- **Sort Options:**
  - Name (A-Z or Z-A)
  - Most/Least Used (by number of pages referencing the excerpt)
  - Category (alphabetical)

### Excerpt Usage Reporting
Click any excerpt to view detailed usage information:
- **Usage Table:** Shows all pages using the excerpt
- **Variable Values:** Display current values for each variable on each page
- **Toggle States:** Visual indicators (✓/✗) showing enabled/disabled toggles
- **Status Column:** "Up to date" or "Update Available" with timestamps
- **Heading Anchors:** Navigate directly to specific sections within pages
- **Deduplication:** Smart display shows unique pages (not duplicate macro instances)

### Bulk Operations
- **Mass Category Updates:** Change category for multiple excerpts at once
- **Push to All Pages:** Update all Include instances of an excerpt simultaneously
- **Push to Specific Page:** Update only the instances on a particular page
- **Individual Push Updates:** Per-page update buttons in usage table

### Push-Based Updates
When a Source is modified, you can manually push updates to Includes:
1. **Automatic Detection:** Admin UI shows which Includes are stale (Source newer than Include)
2. **Selective Updates:** Choose to update all instances or specific pages
3. **Timestamp Tracking:** View exact times when Source was modified and Include last synced
4. **One-Click Updates:** "Push to All Pages" updates every Include instance instantly

### Category Management
Customize excerpt categories via "Manage Categories" button:
- **Add New Categories:** Create custom categories for your organization
- **Edit Categories:** Rename existing categories
- **Delete Categories:** Remove unused categories (prevents deletion if excerpts use it)
- **Reorder Categories:** Move categories up/down to control display order
- **Persistent Storage:** Categories saved automatically across sessions

### Orphaned Item Detection

**Check All Sources:**
- Actively verifies each Source still exists on its source page
- Identifies Sources deleted from pages but still in storage
- Reports orphaned reasons (page deleted, macro removed, etc.)
- Provides remediation options:
  - View page history to restore deleted Source
  - Navigate to source page
  - Permanently delete orphaned Source from storage

**Orphaned Includes:**
- Automatically detects Includes referencing deleted Sources
- Shows affected pages and reference counts
- Suggests remediation:
  - Recreate the Source with same name
  - Update Includes to reference different Source
  - Remove Includes from affected pages

**Automatic Cleanup:**
- Removes stale Include usage entries during Source checking
- Verifies Include instances still exist on their pages
- Maintains data integrity across the system

### Check All Includes

Comprehensive verification system for all Include instances across your Confluence space:

**What It Does:**
- **Verifies Existence:** Checks that each Include macro still exists on its page
- **Validates References:** Ensures all Includes point to valid Sources
- **Detects Staleness:** Identifies Includes that need updates (Source modified after Include last synced)
- **Cleans Up Orphans:** Automatically removes storage entries for deleted Includes
- **Generates Report:** Creates comprehensive CSV export with all Include data

**Real-Time Progress Tracking:**
- Visual progress bar with percentage completion
- Current status messages (e.g., "Checking page 5/12...")
- Items processed count (e.g., "120 / 200 Includes processed")
- Estimated time to completion (ETA calculated dynamically)
- Warning to stay on page during operation

**CSV Export Contains:**
- Page URL, Title, and Heading Anchor
- Excerpt Name and Category
- Status (active/stale)
- Last Synced and Excerpt Last Modified timestamps
- All variable values for each Include
- All toggle states (Enabled/Disabled)
- Custom insertions count
- Full rendered content (variables substituted, ready for grammar checking)

**Use Cases:**
- Audit all Includes across your Confluence space
- Export data for external grammar/spell checking tools
- Identify stale Includes that need updates
- Clean up orphaned storage entries
- Generate reports for documentation or compliance

**How to Use:**
1. Click "🔍 Check All Includes" button in Admin UI
2. Stay on page while check runs (progress bar shows real-time updates)
3. Review summary when complete
4. Download CSV report when prompted

### Excerpt Management
For each excerpt, you can:
- **Preview Content:** View raw Source content with all variables and toggle tags
- **View Source Page:** Navigate directly to the page containing the Source macro
- **Push Updates:** Update all or specific Include instances
- **Permadelete:** Permanently remove excerpt from library (content remains on source page)

**Important Note:** The Admin View button URL in Include macros needs to be updated when installing to new environments (see Production Installation Configuration section).

---

## 🐛 Troubleshooting

### Includes Showing Old Content
- Re-edit the Include and save to update cached content
- Check browser console for background refresh errors

### Variables Not Substituting
- Ensure variable names match exactly (case-sensitive)
- Check console logs for camelCase conversion messages
- Hyphenated variables are supported (e.g., `{{stack-model}}`)

### Slow Page Loads
- Check Network tab for multiple concurrent `invoke` calls
- Each Include makes one background refresh call
- Consider page design: spread Includes across multiple pages

### Deployment Issues
```bash
# View detailed logs
forge logs --follow

# Force redeploy
forge deploy --verbose

# Reinstall on site
forge install --upgrade
```

---

## 📊 Performance Characteristics

### With Option 4 (Current)

| Scenario | Performance |
|----------|-------------|
| Single Include | Instant display (~100ms) + 500ms background refresh |
| 5 Includes | Instant display (~100ms) + 1-2s background refresh |
| 20 Includes | Instant display (~100ms) + 3-5s background refresh |
| 50+ Includes | Instant display (~100ms) + 5-10s background refresh |

**Note:** Background refresh happens after content is already visible, so user experience remains fast even with many Includes.

---

## 🚀 Roadmap

### Completed
- ✅ Core excerpt storage and retrieval
- ✅ Variable detection and substitution
- ✅ Category organization and management
- ✅ Live preview in config
- ✅ Optimistic rendering for performance
- ✅ Hyphenated variable name support
- ✅ Background content refresh
- ✅ Rich text editing with ADF support
- ✅ Advanced search and filter UI for excerpts
- ✅ Excerpt usage reporting (which pages use which excerpts)
- ✅ Bulk operations (mass updates, push to all)
- ✅ Push-based updates from Admin UI
- ✅ Orphaned Source and Include detection
- ✅ Staleness detection and diff view
- ✅ Free Write custom paragraph insertion
- ✅ Toggle content blocks
- ✅ Check All Includes verification and cleanup with real-time progress tracking
- ✅ CSV export of all Include instances with full metadata

### Next Features
- Content versioning and history
- Export/import excerpts
- Basic grammar/spell checking integration

---

## 📝 Development Log

**v4.300.1** - MultiExcerpt Migration: Added bulk excerpt initialization with excerpt-index support, cleaned up failed sync code (~173 lines removed), added migration reference scripts (clone-macros.js, migrate-content.js, migrate-macros.js, fix-excerpt-ids.js), created UUID mapping CSV for 147 migrated excerpts, enabled "View Source" functionality via sourcePageId, successfully migrated test page from MultiExcerpt to SmartExcerpt
**v4.208.0** - Check All Includes Feature: Comprehensive Include verification system with real-time progress tracking (visual progress bar, ETA calculation, page-by-page status updates), CSV export of all Include instances with full metadata (page URLs, variable values, toggle states, rendered content), automatic cleanup of orphaned Include entries, broken reference detection, and staleness reporting
**v4.300.0** - Comprehensive Admin UI: Added advanced search & filtering, excerpt usage reporting with variable/toggle display, bulk operations (mass category updates, push to all/specific pages), orphaned Source/Include detection with active checking and cleanup, category management UI (add/edit/delete/reorder), heading anchor navigation, usage deduplication, and timestamp tracking
**v4.203.0** - Added staleness detection and diff view: visual notifications when Source is updated, side-by-side comparison of cached vs latest content with all toggle tags visible
**v4.83.0** - Added Free Write feature: insert custom paragraphs at chosen positions in Include macros
**v4.75.0** - Added required field validation for variables with visual indicators
**v4.72.0** - Investigated TextArea multi-line support, discovered incompatibility with Forge UI Kit macros
**v3.55.0** - Added rich text editing support for Source macros using bodied macro layout
**v3.54.0** - Merged Option 4 (Optimistic Rendering) into main app
**v3.53.0** - Fixed loading state display (no more error flash)
**v3.52.0** - Fixed variable persistence when re-opening Include editor
**v3.49.0** - Fixed Source excerpt edit form not showing current values
**v3.46.0** - Fixed hyphenated variable name substitution
**v3.0.0** - Initial working version with all core features

---

## 🤝 Contributing

This is a custom internal Forge app. For questions or issues, contact the development team.

---

## 📄 License

Internal use only - SeatGeek
