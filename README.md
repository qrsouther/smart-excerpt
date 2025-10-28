# SmartExcerpt - Confluence Forge App

A high-performance Forge app for Confluence that enables reusable content blocks with variable substitution and automatic updates.

## 🎯 Current Implementation

**Version:** 4.83.0
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

## ✨ Features

### Current Features (v4.83.0)

✅ **ID-Based References** - UUID-based excerpt identification for rename-safe references
✅ **Variable Substitution** - Mad-libs style variables using `{{variable-name}}` syntax
✅ **Required Field Validation** - Mark variables as required with visual indicators (asterisk, warning icon, colored status)
✅ **Category Organization** - Group excerpts by category (General, Pricing, Technical, Legal, Marketing)
✅ **Live Preview** - See rendered content as you configure Includes
✅ **Optimistic Rendering** - Instant page loads with background content refresh
✅ **Automatic Updates** - Includes update when Source excerpts are edited
✅ **Hyphenated Variable Names** - Full support for variable names with hyphens (e.g., `{{stack-model}}`)
✅ **Rich Text Content** - Full WYSIWYG editing for Source macros with bold, italic, tables, and more
✅ **Free Write Feature** - Insert custom paragraph content at chosen positions within Include macros
✅ **Toggle Content Blocks** - Show/hide sections using `{{toggle:name}}` syntax

### In Development

⏳ Advanced search and filtering for excerpts
⏳ Bulk excerpt management tools
⏳ Content versioning and history

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
- ✅ Category organization
- ✅ Live preview in config
- ✅ Optimistic rendering for performance
- ✅ Hyphenated variable name support
- ✅ Background content refresh
- ✅ Rich text editing with ADF support

### Next Features
- Search and filter UI for excerpts
- Excerpt usage reporting (which pages use which excerpts)
- Bulk operations (update multiple excerpts)
- Content versioning
- Export/import excerpts

---

## 📝 Development Log

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
