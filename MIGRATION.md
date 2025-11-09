# MultiExcerpt to Blueprint Standards Migration Guide

This guide provides step-by-step instructions for migrating MultiExcerpt macros from the old app to Blueprint Standards.

## Overview

The migration process involves:
1. Fetching page data from Confluence API
2. Parsing MultiExcerpt macro content
3. Bulk importing into Blueprint Standards
4. Verification and testing

## Prerequisites

- Node.js installed
- Access to Confluence page with MultiExcerpt macros
- Admin access to Blueprint Standards app

## Step-by-Step Migration Process

### Step 1: Fetch Page Data from Confluence API

1. Navigate to your Confluence page containing MultiExcerpt macros in a web browser
2. Get the page ID from the URL (e.g., `4115071216` in `https://seatgeek.atlassian.net/wiki/spaces/cs/pages/4115071216`)
3. Open a new browser tab and navigate to:
   ```
   https://[your-domain].atlassian.net/wiki/rest/api/content/[PAGE_ID]?expand=body.storage,version
   ```
   Replace `[your-domain]` with your Atlassian domain and `[PAGE_ID]` with your page ID

4. Save the JSON response to a file:
   - The browser will display raw JSON
   - Right-click → "Save As..." or copy the entire JSON
   - Save as `/Users/[your-username]/Downloads/[PAGE_ID].json`

**Example:**
```
https://seatgeek.atlassian.net/wiki/rest/api/content/4115071216?expand=body.storage,version
→ Save as: /Users/quinnsouther/Downloads/4115071216.json
```

### Step 2: Parse MultiExcerpt Macros

Run the parser script to extract all MultiExcerpt macros from the JSON file:

```bash
node parse-multiexcerpts.js /Users/[your-username]/Downloads/[PAGE_ID].json
```

**What the parser does:**
- Extracts macro names from `<ac:parameter ac:name="name">` tags
- Extracts macro bodies from `<ac:rich-text-body>` tags
- Auto-detects variables using pattern `{{variableName}}`
- Categorizes macros by prefix: `[ALL]`, `[NFL]`, `[NBA]`, etc.
- Generates import data JSON

**Output:**
- Console log showing all extracted macros
- Generated file: `/Users/[your-username]/Downloads/multiexcerpt-import-data.json`

**Example output:**
```
[PARSER] Extraction complete!
Total macros found: 147
========================================

Category breakdown:
  - All Clients: 79 macros
  - General: 56 macros
  - NFL: 5 macros
  - NBA: 4 macros
  - Golf: 3 macros

Total variables across all macros: 85

✅ Parse complete! Next step: Run bulk import script.
```

### Step 3: Review Import Data

Before importing, review the generated import data:

```bash
cat /Users/[your-username]/Downloads/multiexcerpt-import-data.json | head -100
```

**Verify:**
- Macro names are correct
- Content bodies are present (not empty)
- Variables are detected properly
- Categories are assigned correctly

**Common issues:**
- Empty content bodies: Some MultiExcerpt macros may be placeholders (will be skipped)
- HTML entities: Parser handles `&amp;`, `&lt;`, `&gt;`, `&nbsp;`, etc.
- Nested macros: Storage format preserves all nested macro structures

### Step 4: Prepare for Bulk Import

The import data is ready to use with the existing `bulkImportSources` resolver. The JSON structure matches what the resolver expects:

```json
{
  "sourcePageId": "4115071216",
  "sourcePageTitle": "Best Practice Templates...",
  "extractedAt": "2025-01-08T...",
  "macroCount": 147,
  "macros": [
    {
      "name": "[ALL] Fundamentals - Key dates, Stack model",
      "content": "<p>{{para-fundamentals-intro}}</p><table>...",
      "variables": [
        {
          "name": "para-fundamentals-intro",
          "label": "Para Fundamentals Intro",
          "description": "Auto-detected variable: para-fundamentals-intro",
          "required": false
        }
      ],
      "category": "All Clients"
    }
  ]
}
```

### Step 5: Execute Bulk Import

#### Option A: Via Admin UI (Recommended)

1. Open Blueprint Standards Admin page in Confluence
2. Navigate to the "Migration" section (if available)
3. Click "Bulk Import from JSON"
4. Paste the contents of `multiexcerpt-import-data.json`
5. Click "Import"
6. Monitor progress and review results

#### Option B: Via Developer Console

1. Open Blueprint Standards Admin page
2. Open browser DevTools console (F12)
3. Run the following code:

```javascript
// Load the import data
const importData = await fetch('/Users/[your-username]/Downloads/multiexcerpt-import-data.json')
  .then(r => r.json());

// Call the bulkImportSources resolver
const result = await invoke('bulkImportSources', {
  sources: importData.macros,
  destinationPageId: null // Or specify a page ID
});

console.log('Import results:', result);
```

**Expected output:**
```javascript
{
  success: true,
  summary: {
    total: 147,
    imported: 115,
    errors: 0
  },
  imported: [ /* array of imported macros */ ],
  errors: []
}
```

### Step 6: Verify Import

1. Navigate to Blueprint Standards Admin page
2. Verify that all macros appear in the list
3. Check category assignments
4. Test a few macros by inserting them on a test page
5. Verify variables are properly detected

**Verification checklist:**
- [ ] All 115 macros with content are imported (32 empty skipped)
- [ ] Categories match original MultiExcerpt categories
- [ ] Variables are detected and configurable
- [ ] Content renders correctly in Embed macros
- [ ] Search/filter works in Admin UI

### Step 7: Post-Migration Cleanup

After successful migration:

1. **Test thoroughly** - Insert various Blueprint Standards on test pages
2. **Document any issues** - Note any rendering problems or missing content
3. **Update old pages** - Replace MultiExcerpt macros with Blueprint Standards Embeds
4. **Archive migration files** - Keep JSON exports for reference

## Troubleshooting

### Issue: Parser finds 0 macros

**Cause:** Incorrect regex or JSON format

**Solution:**
- Verify JSON file contains `<ac:structured-macro ac:name="multiexcerpt-macro">`
- Check that JSON was saved correctly (not truncated)
- Try re-fetching from REST API

### Issue: Import fails with "Invalid sources data"

**Cause:** JSON format doesn't match expected structure

**Solution:**
- Verify `multiexcerpt-import-data.json` has `macros` array
- Check that each macro has `name` and `content` fields
- Validate JSON syntax with `node -c parse-multiexcerpts.js`

### Issue: Macros imported but content is empty

**Cause:** MultiExcerpt macros had no body content (placeholders)

**Solution:**
- Review skipped macros in import results
- Manually populate content for placeholder macros
- Re-import specific macros after adding content

### Issue: Variables not detected

**Cause:** Variable syntax doesn't match `{{variableName}}`

**Solution:**
- Check original MultiExcerpt for variable format
- Update parser regex if different syntax is used
- Manually add variables via Admin UI after import

## Scripts Reference

### parse-multiexcerpts.js

**Purpose:** Extract MultiExcerpt macros from Confluence REST API JSON

**Usage:**
```bash
node parse-multiexcerpts.js /path/to/pageId.json
```

**Input:** Confluence REST API JSON with `body.storage.value`

**Output:**
- Console log of all extracted macros
- `/Users/[username]/Downloads/multiexcerpt-import-data.json`

**Key Features:**
- Regex-based XML parsing
- HTML entity decoding
- Variable auto-detection (`{{var}}` pattern)
- Category assignment by macro name prefix
- Skips macros with empty content

### bulk-import-multiexcerpts.js

**Purpose:** Simulate and test bulk import process

**Usage:**
```bash
node bulk-import-multiexcerpts.js
```

**Input:** `/Users/[username]/Downloads/multiexcerpt-import-data.json`

**Output:**
- Console log of import simulation
- `/Users/[username]/Downloads/multiexcerpt-import-results.json`

**Note:** This is a simulation script. Actual import uses `bulkImportSources` resolver.

## Migration Checklist

Use this checklist to track your migration progress:

- [ ] Step 1: Fetch page data from Confluence API
- [ ] Step 2: Parse MultiExcerpt macros
- [ ] Step 3: Review import data
- [ ] Step 4: Prepare for bulk import
- [ ] Step 5: Execute bulk import
- [ ] Step 6: Verify import
- [ ] Step 7: Post-migration cleanup
- [ ] Test Blueprint Standards on test pages
- [ ] Replace old MultiExcerpt macros
- [ ] Archive migration files

## Additional Resources

- **Confluence REST API Docs:** https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/
- **Storage Format Docs:** https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html
- **Blueprint Standards Admin:** `/wiki/spaces/[your-space]/pages/[admin-page-id]`

## Support

For issues or questions:
1. Review this migration guide
2. Check troubleshooting section
3. Review import results JSON
4. Contact Blueprint Standards team
