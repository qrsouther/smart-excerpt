/**
 * Delete orphaned Embeds by page title
 *
 * Usage: node delete-orphaned-embeds.js "Page Title 1" "Page Title 2"
 */

const pageTitles = process.argv.slice(2);

if (pageTitles.length === 0) {
  console.error('Error: Please provide at least one page title');
  console.error('Usage: node delete-orphaned-embeds.js "Page Title 1" "Page Title 2"');
  process.exit(1);
}

console.log('Deleting orphaned Embeds from pages:', pageTitles);
console.log('\nPayload:', JSON.stringify({ pageTitles }, null, 2));
console.log('\nTo execute, run:');
console.log('forge invoke deleteOrphanedEmbedsByPage --payload \'{"pageTitles":' + JSON.stringify(pageTitles) + '}\'');
