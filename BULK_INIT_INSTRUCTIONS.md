# Bulk Initialize 147 SmartExcerpts

## Quick Summary
Add ~50 lines of code to your existing Forge app, deploy, and click one button to initialize all 147 macros.

## Step 1: Add Backend Resolver

Add this resolver to `src/index.js` (anywhere after the imports, before the last line):

```javascript
// ============================================================================
// BULK INITIALIZATION (Temporary - can be removed after use)
// ============================================================================

resolver.define('bulkInitializeExcerpts', async (req) => {
  const { mappings } = req.payload;

  console.log(`Starting bulk initialization of ${mappings.length} excerpts...`);

  const results = [];

  for (const { uuid, name, category } of mappings) {
    try {
      // Get existing excerpt from storage
      const excerpt = await storage.get(`excerpt:${uuid}`);

      if (excerpt) {
        // Update only the name and category
        excerpt.name = name;
        excerpt.category = category || excerpt.category || 'General';
        excerpt.updatedAt = new Date().toISOString();

        // Save back to storage
        await storage.set(`excerpt:${uuid}`, excerpt);

        console.log(`✓ Initialized: ${name}`);
        results.push({ uuid, name, success: true });
      } else {
        console.log(`✗ Not found: ${uuid}`);
        results.push({ uuid, name, success: false, reason: 'Excerpt not found in storage' });
      }
    } catch (error) {
      console.error(`✗ Error initializing ${name}:`, error);
      results.push({ uuid, name, success: false, error: error.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`Bulk initialization complete: ${successCount}/${results.length} successful`);

  return {
    success: true,
    total: results.length,
    successful: successCount,
    failed: results.length - successCount,
    results
  };
});
```

## Step 2: Generate the Mapping Data

Run this script to generate the JavaScript mapping array:

```bash
cd "/Users/quinnsouther/Documents/Code projects/smart-excerpt"
node generate-bulk-init-data.js
```

This will create `bulk-init-mappings.js` with all 147 mappings.

## Step 3: Add Button to Admin UI

I'll create a patch file for `src/admin-page.jsx` that adds the button.

## Step 4: Deploy and Run

```bash
forge deploy
```

Then:
1. Go to Settings → Manage apps → SmartExcerpt Admin
2. Click the "🚀 Bulk Initialize All Excerpts" button at the top
3. Wait for confirmation
4. All 147 macros will be initialized!

## Step 5: Clean Up (Optional)

After successful initialization, you can remove:
- The `bulkInitializeExcerpts` resolver from `src/index.js`
- The bulk initialize button from `admin-page.jsx`
- The `bulk-init-mappings.js` file

Then redeploy to clean up the code.

---

## Alternative: Browser Console Method

If you prefer not to modify the app, I can create a script that:
1. You open the Admin page in your browser
2. Open browser console
3. Paste one large JavaScript snippet
4. It calls the Forge app's existing `saveExcerpt` resolver 147 times

This would take ~5-10 minutes to run but requires no code changes.

Would you prefer the browser console approach instead?
