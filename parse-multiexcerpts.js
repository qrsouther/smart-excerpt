/**
 * MultiExcerpt Parser
 *
 * Parses the Confluence REST API JSON response to extract all MultiExcerpt
 * macro names and bodies, then generates import data for Blueprint Standards.
 *
 * Usage:
 *   node parse-multiexcerpts.js /path/to/4115071216.json
 */

const fs = require('fs');

const jsonPath = process.argv[2] || '/Users/quinnsouther/Downloads/4115071216.json';

console.log(`\n[PARSER] Reading JSON from: ${jsonPath}\n`);

const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const storageXml = jsonData.body.storage.value;

console.log(`[PARSER] Storage XML length: ${storageXml.length} characters`);
console.log(`[PARSER] Searching for MultiExcerpt macros...\n`);

// Extract all MultiExcerpt macros (NO escaping needed - it's plain XML)
const macros = [];
const regex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g;

let match;
let count = 0;

while ((match = regex.exec(storageXml)) !== null) {
  count++;
  const macroXml = match[1];

  // Extract macro name
  const nameMatch = macroXml.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
  const macroName = nameMatch ? nameMatch[1] : `Unnamed Macro ${count}`;

  // Extract rich-text-body content
  const bodyMatch = macroXml.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';

  // Unescape HTML entities in body
  let cleanedBody = bodyContent
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"');

  // Detect variables {{variableName}}
  const variableMatches = cleanedBody.match(/\{\{([^}]+)\}\}/g) || [];
  const variables = [...new Set(variableMatches)].map(v => v.replace(/[{}]/g, ''));

  macros.push({
    name: macroName,
    bodyXml: cleanedBody,
    bodyLength: cleanedBody.length,
    variables: variables,
    variableCount: variables.length
  });

  console.log(`[${count}] "${macroName}"`);
  console.log(`    Body length: ${cleanedBody.length} chars`);
  console.log(`    Variables (${variables.length}): ${variables.join(', ') || 'none'}`);
  console.log();
}

console.log(`\n========================================`);
console.log(`[PARSER] Extraction complete!`);
console.log(`Total macros found: ${macros.length}`);
console.log(`========================================\n`);

// Generate import data JSON (format expected by bulkImportSources resolver)
const importData = {
  sourcePageId: jsonData.id,
  sourcePageTitle: jsonData.title,
  extractedAt: new Date().toISOString(),
  sourceCount: macros.length, // Changed from macroCount to sourceCount
  sources: macros.map(m => ({ // Changed from macros to sources
    name: m.name,
    content: m.bodyXml,
    variables: m.variables.map(v => ({
      name: v,
      label: v.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: `Auto-detected variable: ${v}`,
      required: false
    })),
    category: m.name.startsWith('[ALL]') ? 'All Clients' :
             m.name.startsWith('[MLB]') ? 'MLB' :
             m.name.startsWith('[NBA]') ? 'NBA' :
             m.name.startsWith('[NFL]') ? 'NFL' :
             m.name.startsWith('[NHL]') ? 'NHL' :
             m.name.startsWith('[SOCCER]') ? 'Soccer' :
             m.name.startsWith('[GOLF]') ? 'Golf' :
             'General'
  }))
};

// Save to file
const outputPath = '/Users/quinnsouther/Downloads/multiexcerpt-import-data.json';
fs.writeFileSync(outputPath, JSON.stringify(importData, null, 2));

console.log(`[PARSER] Import data saved to: ${outputPath}`);
console.log(`[PARSER] Ready to import ${macros.length} Blueprint Standards!\n`);

// Print summary statistics
const categoryCount = {};
importData.sources.forEach(m => {
  categoryCount[m.category] = (categoryCount[m.category] || 0) + 1;
});

console.log(`Category breakdown:`);
Object.entries(categoryCount).forEach(([cat, count]) => {
  console.log(`  - ${cat}: ${count} sources`);
});

console.log(`\nTotal variables across all sources: ${importData.sources.reduce((sum, m) => sum + m.variables.length, 0)}`);
console.log(`\n✅ Parse complete! Next step: Run bulk import script.\n`);
