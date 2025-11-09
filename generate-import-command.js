/**
 * Generate Browser Console Import Command
 *
 * This script reads the multiexcerpt-import-data.json and generates
 * a ready-to-paste browser console command that will execute the bulk import.
 *
 * Usage:
 *   node generate-import-command.js
 *
 * Then:
 *   1. Open Blueprint Standards Admin page in Confluence
 *   2. Open browser DevTools console (F12)
 *   3. Copy and paste the generated command
 *   4. Press Enter
 */

const fs = require('fs');

const importDataPath = '/Users/quinnsouther/Downloads/multiexcerpt-import-data.json';

console.log(`\n${'='.repeat(80)}`);
console.log('BLUEPRINT STANDARDS - BULK IMPORT COMMAND GENERATOR');
console.log('='.repeat(80));
console.log(`\nReading import data from: ${importDataPath}\n`);

const importData = JSON.parse(fs.readFileSync(importDataPath, 'utf8'));

console.log(`Found ${importData.macroCount} macros to import`);
console.log(`Source: ${importData.sourcePageTitle}`);
console.log(`\nCategory breakdown:`);

const categoryCount = {};
importData.macros.forEach(m => {
  categoryCount[m.category] = (categoryCount[m.category] || 0) + 1;
});

Object.entries(categoryCount)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} macros`);
  });

// Filter out empty macros
const validMacros = importData.macros.filter(m => m.content && m.content.trim().length > 0);
console.log(`\nValid macros (with content): ${validMacros.length}`);
console.log(`Empty macros (will be skipped): ${importData.macroCount - validMacros.length}`);

// Generate the browser console command
const command = `
// ============================================================================
// BLUEPRINT STANDARDS - BULK IMPORT COMMAND
// ============================================================================
// Paste this entire block into your browser console and press Enter
// Prerequisites: Must be on Blueprint Standards Admin page in Confluence

(async () => {
  console.log('🚀 Starting bulk import of ${validMacros.length} Blueprint Standards...');
  console.log('Source: ${importData.sourcePageTitle}');
  console.log('');

  const sources = ${JSON.stringify(validMacros, null, 2)};

  try {
    // Call the bulkImportSources resolver
    const result = await window.AP.require('_dollar').invoke('bulkImportSources', {
      sources: sources,
      destinationPageId: null // Will be populated by Source macros when created
    });

    console.log('\\n========================================');
    console.log('✅ IMPORT COMPLETE');
    console.log('========================================');
    console.log('Total:', result.summary.total);
    console.log('Imported:', result.summary.imported);
    console.log('Errors:', result.summary.errors);
    console.log('========================================\\n');

    if (result.errors && result.errors.length > 0) {
      console.error('\\n❌ Errors occurred during import:');
      result.errors.forEach(err => {
        console.error(\`  - "\${err.name}": \${err.error}\`);
      });
    }

    if (result.imported && result.imported.length > 0) {
      console.log('\\n✅ Successfully imported macros:');
      result.imported.slice(0, 10).forEach(item => {
        console.log(\`  - "\${item.name}" (ID: \${item.excerptId})\`);
      });
      if (result.imported.length > 10) {
        console.log(\`  ... and \${result.imported.length - 10} more\`);
      }
    }

    console.log('\\n📊 Next steps:');
    console.log('  1. Refresh the Admin page to see imported Blueprint Standards');
    console.log('  2. Verify categories and variable detection');
    console.log('  3. Test a few macros on a test page');
    console.log('  4. Archive migration files');
    console.log('');

    return result;

  } catch (error) {
    console.error('\\n❌ FATAL ERROR during import:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
})();
`;

// Write command to file
const commandPath = '/Users/quinnsouther/Downloads/import-command.js';
fs.writeFileSync(commandPath, command);

console.log(`\n${'='.repeat(80)}`);
console.log('BROWSER CONSOLE COMMAND GENERATED');
console.log('='.repeat(80));
console.log(`\nCommand saved to: ${commandPath}`);
console.log(`\n📋 INSTRUCTIONS:`);
console.log(`\n1. Open Blueprint Standards Admin page in Confluence`);
console.log(`2. Open browser DevTools console (press F12)`);
console.log(`3. Copy the command from: ${commandPath}`);
console.log(`4. Paste into console and press Enter`);
console.log(`5. Watch the import progress in the console`);
console.log(`\n⚠️  IMPORTANT:`);
console.log(`   - Must be on Admin page (AP context required)`);
console.log(`   - Will import ${validMacros.length} macros`);
console.log(`   - Process takes ~${Math.ceil(validMacros.length * 0.1)} seconds`);
console.log(`   - DO NOT close browser during import`);

// Also output command directly to console for easy copy-paste
console.log(`\n${'='.repeat(80)}`);
console.log('QUICK COPY: Paste this directly into browser console:');
console.log('='.repeat(80));
console.log(command);
console.log('='.repeat(80));
console.log(`\n✅ Ready to import! Follow instructions above.\n`);
