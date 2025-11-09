/**
 * Bulk Import Script: MultiExcerpt to Blueprint Standards
 *
 * This script reads the parsed MultiExcerpt data and creates Blueprint Standards
 * by calling the saveExcerpt resolver for each macro.
 *
 * Usage:
 *   node bulk-import-multiexcerpts.js
 *
 * Prerequisites:
 *   - Run parse-multiexcerpts.js first to generate import data
 *   - Ensure /Users/quinnsouther/Downloads/multiexcerpt-import-data.json exists
 */

const fs = require('fs');
const https = require('https');

// Read import data
const importDataPath = '/Users/quinnsouther/Downloads/multiexcerpt-import-data.json';
console.log(`\n[IMPORT] Reading import data from: ${importDataPath}\n`);

const importData = JSON.parse(fs.readFileSync(importDataPath, 'utf8'));

console.log(`[IMPORT] Found ${importData.macroCount} macros to import`);
console.log(`[IMPORT] Source page: ${importData.sourcePageTitle} (ID: ${importData.sourcePageId})`);
console.log(`[IMPORT] Extracted at: ${importData.extractedAt}\n`);

// Convert Confluence Storage Format XML to simplified ADF
// This is a simplified conversion - Storage Format is already close to what we need
function storageToAdf(storageXml) {
  // For now, we'll store the Storage Format directly
  // The Blueprint Standards Source macro will render it properly
  // TODO: If rendering issues occur, implement full XML->ADF conversion

  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: storageXml,
            marks: [{ type: 'code' }]
          }
        ]
      }
    ]
  };
}

// Import results tracking
const results = {
  success: [],
  failed: [],
  skipped: []
};

// Function to import a single macro
async function importMacro(macro, index) {
  console.log(`[${index + 1}/${importData.macroCount}] Importing: "${macro.name}"`);

  // Skip macros with empty content
  if (!macro.content || macro.content.trim().length === 0) {
    console.log(`  ⚠️  SKIPPED: No content body`);
    results.skipped.push({
      name: macro.name,
      reason: 'No content body'
    });
    return;
  }

  try {
    // Convert Storage Format to ADF
    const adfContent = storageToAdf(macro.content);

    // Prepare payload for saveExcerpt resolver
    const payload = {
      name: macro.name,
      content: adfContent,
      variables: macro.variables,
      category: macro.category,
      metadata: {
        importedFrom: 'MultiExcerpt',
        sourcePageId: importData.sourcePageId,
        sourcePageTitle: importData.sourcePageTitle,
        importedAt: new Date().toISOString()
      }
    };

    // In a real implementation, this would call the Forge resolver
    // For now, we'll simulate success and log the payload
    console.log(`  ✅ SUCCESS: Would import with ${macro.variables.length} variables`);
    console.log(`     Category: ${macro.category}`);
    console.log(`     Content length: ${macro.content.length} chars`);

    results.success.push({
      name: macro.name,
      category: macro.category,
      variableCount: macro.variables.length,
      contentLength: macro.content.length
    });

    // TODO: Replace simulation with actual Forge resolver call
    // This will require:
    // 1. Forge authentication context
    // 2. Direct resolver invocation OR
    // 3. HTTP request to Forge app endpoint

  } catch (error) {
    console.log(`  ❌ FAILED: ${error.message}`);
    results.failed.push({
      name: macro.name,
      error: error.message
    });
  }
}

// Main import process
async function runImport() {
  console.log(`========================================`);
  console.log(`Starting bulk import...`);
  console.log(`========================================\n`);

  // Process macros sequentially to avoid overwhelming the system
  for (let i = 0; i < importData.macros.length; i++) {
    await importMacro(importData.macros[i], i);

    // Add small delay between imports
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Print final summary
  console.log(`\n========================================`);
  console.log(`IMPORT COMPLETE`);
  console.log(`========================================`);
  console.log(`✅ Successful: ${results.success.length}`);
  console.log(`⚠️  Skipped (empty): ${results.skipped.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`========================================\n`);

  if (results.skipped.length > 0) {
    console.log(`Skipped macros (empty content):`);
    results.skipped.forEach(s => {
      console.log(`  - "${s.name}"`);
    });
    console.log();
  }

  if (results.failed.length > 0) {
    console.log(`Failed macros:`);
    results.failed.forEach(f => {
      console.log(`  - "${f.name}": ${f.error}`);
    });
    console.log();
  }

  // Category breakdown
  const categoryCount = {};
  results.success.forEach(s => {
    categoryCount[s.category] = (categoryCount[s.category] || 0) + 1;
  });

  console.log(`Successfully imported by category:`);
  Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  - ${cat}: ${count} macros`);
    });

  // Save results to file
  const resultsPath = '/Users/quinnsouther/Downloads/multiexcerpt-import-results.json';
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n[IMPORT] Results saved to: ${resultsPath}`);

  console.log(`\n📊 Next Steps:`);
  console.log(`   1. Review skipped/failed macros above`);
  console.log(`   2. Update this script to call actual saveExcerpt resolver`);
  console.log(`   3. Test with a small batch first (e.g., 5 macros)`);
  console.log(`   4. Run full import after testing`);
  console.log();
}

// Run the import
runImport().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});
