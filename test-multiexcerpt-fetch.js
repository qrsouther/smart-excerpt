/**
 * Test Script: MultiExcerpt Page Content Fetcher
 *
 * This script tests whether the Confluence API returns the actual content body
 * of MultiExcerpt macros, or just metadata.
 *
 * Usage:
 *   node test-multiexcerpt-fetch.js <pageId>
 *
 * Example:
 *   node test-multiexcerpt-fetch.js 4115071216
 */

const https = require('https');

const PAGE_ID = process.argv[2] || '4115071216'; // Default to the Blueprint Excerpts page

// Confluence API endpoint (using Cloud REST API v2)
const options = {
  hostname: 'seatgeek.atlassian.net',
  port: 443,
  path: `/wiki/api/v2/pages/${PAGE_ID}?body-format=storage`,
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
};

console.log(`\n[TEST] Fetching page ${PAGE_ID} from Confluence API...`);
console.log(`[TEST] URL: https://${options.hostname}${options.path}\n`);

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const jsonData = JSON.parse(data);

      console.log('[TEST] Response Status:', res.statusCode);
      console.log('[TEST] Page Title:', jsonData.title);
      console.log('[TEST] Page ID:', jsonData.id);
      console.log('[TEST] Has body:', !!jsonData.body);

      if (jsonData.body && jsonData.body.storage) {
        const storageContent = jsonData.body.storage.value;
        console.log('[TEST] Storage content length:', storageContent.length);

        // Find all MultiExcerpt macros
        const multiExcerptPattern = /<ac:structured-macro[^>]*ac:name="multiexcerpt-macro"[^>]*>/g;
        const matches = storageContent.match(multiExcerptPattern);
        const macroCount = matches ? matches.length : 0;

        console.log('[TEST] MultiExcerpt macro count:', macroCount);

        if (macroCount > 0) {
          // Analyze first macro
          const firstMacroStart = storageContent.indexOf('<ac:structured-macro');
          const firstMacroWithName = storageContent.indexOf('ac:name="multiexcerpt-macro"', firstMacroStart);
          const openingTagEnd = storageContent.indexOf('>', firstMacroWithName);
          const closingTag = '</ac:structured-macro>';
          const closingTagStart = storageContent.indexOf(closingTag, openingTagEnd);

          if (closingTagStart !== -1) {
            const macroContent = storageContent.substring(firstMacroStart, closingTagStart + closingTag.length);

            // Extract macro name
            const nameMatch = macroContent.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
            const macroName = nameMatch ? nameMatch[1] : 'Unknown';

            // Check for rich-text-body
            const hasRichTextBody = macroContent.includes('<ac:rich-text-body>');
            const richTextBodyMatch = macroContent.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/);
            const bodyContent = richTextBodyMatch ? richTextBodyMatch[1] : null;

            console.log('\n[TEST] First MultiExcerpt Analysis:');
            console.log('  - Name:', macroName);
            console.log('  - Has <ac:rich-text-body>:', hasRichTextBody);
            console.log('  - Body content length:', bodyContent ? bodyContent.length : 0);

            if (bodyContent) {
              console.log('  - Body content preview (first 200 chars):');
              console.log('   ', bodyContent.substring(0, 200).trim());
            }

            console.log('\n[TEST] Full macro preview (first 500 chars):');
            console.log(macroContent.substring(0, 500));

            console.log('\n========================================');
            if (hasRichTextBody && bodyContent) {
              console.log('✅ VERDICT: API returns macro body content!');
              console.log('   Automated bulk import is POSSIBLE.');
            } else {
              console.log('❌ VERDICT: API does NOT return macro body content.');
              console.log('   Manual copy-paste will be required.');
            }
            console.log('========================================\n');
          }
        } else {
          console.log('\n⚠️  No MultiExcerpt macros found on this page.');
        }
      } else {
        console.log('\n❌ ERROR: No storage body content in API response');
      }
    } catch (error) {
      console.error('\n❌ ERROR parsing response:', error.message);
      console.log('Raw response:', data.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ ERROR making request:', error.message);
});

req.end();
