# MultiExcerpt Include Scanner - Chrome Extension

A Chrome extension to scan for MultiExcerpt Includes in Confluence and export them to CSV format. This tool helps with migrating from MultiExcerpt to Blueprint App by extracting all Include instances and their variable values.

## Features

- 🔍 Scans the 'cs' space in Confluence for MultiExcerpt Include macros
- 📊 Extracts variable values from each Include instance
- 💾 Exports all data to CSV format
- ⚡ Real-time progress tracking with visual feedback
- 🎯 Works directly in your browser - no server installation required

## What It Does

This extension:
1. Uses CQL search to find all pages in the 'cs' space containing MultiExcerpt Include macros
2. Parses the Confluence storage format XML for each page
3. Decodes the compressed `templateData` parameter to extract variable values
4. Generates a CSV report with:
   - Page ID, Title, and URL
   - MultiExcerpt name being referenced
   - Source page title
   - All variable values (dynamic columns for each variable found)

## Installation Instructions

### Step 1: Load the Extension

1. Open **Chrome** (or any Chromium-based browser like Edge, Brave, etc.)
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Navigate to this directory: `chrome-extension/`
6. Click **"Select Folder"**

The extension icon should now appear in your browser toolbar!

### Step 2: Pin the Extension (Optional)

1. Click the puzzle piece icon in your browser toolbar
2. Find "MultiExcerpt Include Scanner"
3. Click the pin icon to keep it visible

## Usage Instructions

### Step 1: Navigate to Confluence

1. Open your browser and go to **`seatgeek.atlassian.net`** (or any Confluence instance)
2. Make sure you're **logged in**

### Step 2: Run the Scan

1. Click the **"ME"** extension icon in your toolbar
2. The popup will open showing "Ready to scan"
3. Click **"🔍 Start Scan"**

### Step 3: Watch the Progress

The extension will:
- Show a progress bar with percentage complete
- Display which page is currently being scanned
- Show estimated time remaining
- Display total pages processed

This may take 1-3 minutes depending on how many pages contain MultiExcerpt Includes.

### Step 4: Download the CSV

1. When the scan completes, you'll see a success message
2. Click **"📥 Download CSV"**
3. The CSV file will be saved to your Downloads folder with filename:
   ```
   multiexcerpt-includes-scan-YYYY-MM-DD.csv
   ```

## CSV Format

The generated CSV contains these columns:

- **Page ID** - Confluence page ID
- **Page Title** - Title of the page containing the Include
- **Page URL** - Direct link to the page
- **MultiExcerpt Name** - Name of the MultiExcerpt being referenced
- **Source Page Title** - Title of the page where the MultiExcerpt Source lives
- **Variable: [name]** - Dynamic columns for each variable (e.g., "Variable: client", "Variable: venue")

Each row represents one MultiExcerpt Include instance.

## Troubleshooting

### "Please navigate to a Confluence page"
- Make sure you're on a page at `*.atlassian.net`
- The extension only works on Confluence Cloud instances

### "CQL search failed: 401"
- You're not logged in to Confluence
- Open a Confluence page and log in first

### "CQL search failed: 400"
- The CQL query syntax may be invalid
- Try reloading the page and running the scan again

### "Found 0 pages"
- There are no MultiExcerpt Includes in the 'cs' space
- Or the space key might be different
- To scan a different space, edit `popup.js` line 190 and change `'cs'` to your space key

### Extension not appearing
- Make sure Developer mode is enabled in `chrome://extensions/`
- Try removing and re-adding the extension
- Check the browser console for errors (F12 > Console tab)

## Technical Details

### Code Recycling

This extension reuses code from the Blueprint App Forge app:

- **`decodeTemplateData()` function** (lines 30-52) - Ported from `src/index.js:1816-1837`
  - Decodes base64-encoded, zlib-compressed JSON from MultiExcerpt's `templateData` parameter
  - Uses `pako.js` library (browser-compatible zlib implementation)

- **Scanning logic** (lines 112-290) - Ported from `src/index.js:1839-2021`
  - CQL search for pages with MultiExcerpt Include macros
  - XML parsing with regex to extract macro parameters
  - Progress tracking and error handling

- **CSV generation** (lines 81-139) - Ported from `src/admin-page.jsx:558-619`
  - Dynamic column generation for variables
  - Proper CSV escaping for commas, quotes, and newlines

### Dependencies

- **pako.js v2.1.0** - Zlib decompression library (loaded from CDN)
- Chrome Manifest V3 (modern extension format)

### Permissions

- `activeTab` - To detect which Confluence instance you're on
- `https://*.atlassian.net/*` - To make API calls to Confluence

## Customization

### Scan a Different Space

Edit `popup.js` line 190:
```javascript
const cql = encodeURIComponent('space = YOUR_SPACE_KEY AND macro = "multiexcerpt-include-macro"');
```

### Increase Search Limit

Edit `popup.js` line 191 to change `limit=100`:
```javascript
const searchUrl = `${baseUrl}/wiki/rest/api/content/search?cql=${cql}&limit=500&expand=space`;
```

## Support

For issues or questions:
1. Check the browser console (F12 > Console tab) for error messages
2. Review the troubleshooting section above
3. Contact the developer with console logs if the issue persists

## License

This extension is part of the Blueprint App project.
