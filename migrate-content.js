#!/usr/bin/env node

/**
 * Migrate MultiExcerpt Content to SmartExcerpt Macros
 *
 * This script copies the body content from each MultiExcerpt macro
 * into its corresponding SmartExcerpt macro (matched by name).
 */

const https = require('https');

const PAGE_ID = '80150529';
const BASE_URL = 'https://qrsouther.atlassian.net';
const API_EMAIL = process.env.CONFLUENCE_EMAIL;
const API_TOKEN = process.env.CONFLUENCE_API_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

// Make authenticated API request
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    if (!API_EMAIL || !API_TOKEN) {
      reject(new Error('CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN environment variables must be set'));
      return;
    }

    const auth = Buffer.from(`${API_EMAIL}:${API_TOKEN}`).toString('base64');
    const url = new URL(path, BASE_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`API returned status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Fetch page storage
async function fetchPageStorage() {
  return makeRequest('GET', `/wiki/api/v2/pages/${PAGE_ID}?body-format=storage`);
}

// Extract all MultiExcerpt macros with their content
function extractMultiExcerpts(storageContent) {
  const multiExcerpts = [];

  // Find all MultiExcerpt macros by matching the opening tag and name
  const macroStartRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[\s\S]*?<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>[\s\S]*?<ac:rich-text-body>/g;

  let startMatch;
  while ((startMatch = macroStartRegex.exec(storageContent)) !== null) {
    const name = startMatch[1];
    const bodyStart = macroStartRegex.lastIndex;

    // Find the matching closing tag for ac:rich-text-body
    // We need to count nested tags to find the correct closing tag
    let depth = 1;
    let pos = bodyStart;
    let bodyEnd = -1;

    while (pos < storageContent.length && depth > 0) {
      const nextOpen = storageContent.indexOf('<ac:rich-text-body>', pos);
      const nextClose = storageContent.indexOf('</ac:rich-text-body>', pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 19; // length of '<ac:rich-text-body>'
      } else {
        depth--;
        if (depth === 0) {
          bodyEnd = nextClose;
        }
        pos = nextClose + 20; // length of '</ac:rich-text-body>'
      }
    }

    if (bodyEnd !== -1) {
      const content = storageContent.substring(bodyStart, bodyEnd);
      multiExcerpts.push({ name, content });
    }
  }

  return multiExcerpts;
}

// Find all SmartExcerpt macros and update their content
function updateSmartExcerptContent(storageContent, multiExcerpts) {
  let updatedContent = storageContent;
  let updatedCount = 0;

  // Create a map of MultiExcerpt content by name
  const contentMap = new Map();
  multiExcerpts.forEach(me => {
    contentMap.set(me.name, me.content);
  });

  // Find each SmartExcerpt and update its content
  const smartExcerptRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?<ac:adf-parameter key="excerpt-name">([^<]+)<\/ac:adf-parameter>[\s\S]*?<ac:adf-content>([\s\S]*?)<\/ac:adf-content>[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/g;

  updatedContent = updatedContent.replace(smartExcerptRegex, (match, excerptName, currentContent) => {
    // Skip SmartExcerpt0 (the template)
    if (excerptName === 'SmartExcerpt0') {
      return match;
    }

    // Find matching MultiExcerpt content
    const newContent = contentMap.get(excerptName);

    if (newContent) {
      updatedCount++;
      console.log(`  ✓ Updating "${excerptName}"`);
      // Replace the content between <ac:adf-content> tags
      return match.replace(
        /(<ac:adf-content>)([\s\S]*?)(<\/ac:adf-content>)/,
        `$1${newContent}$3`
      );
    } else {
      console.log(`  ⚠ No matching MultiExcerpt found for "${excerptName}"`);
      return match;
    }
  });

  return { updatedContent, updatedCount };
}

// Update page content
async function updatePageContent(pageId, newStorageContent, currentVersion) {
  const body = {
    id: pageId,
    status: 'current',
    title: 'DO NOT DELETE - Blueprint Excerpts',
    body: {
      representation: 'storage',
      value: newStorageContent
    },
    version: {
      number: currentVersion + 1,
      message: 'Migrated content from MultiExcerpt to SmartExcerpt macros'
    }
  };

  return makeRequest('PUT', `/wiki/api/v2/pages/${pageId}`, body);
}

// Main function
async function main() {
  console.log('🚀 Content Migration Script Starting...\n');

  try {
    // Step 1: Fetch page storage
    console.log('📡 Fetching page storage...');
    const pageData = await fetchPageStorage();
    const storageContent = pageData.body.storage.value;
    const currentVersion = pageData.version.number;
    console.log(`✓ Page storage fetched (version ${currentVersion})\n`);

    // Step 2: Extract all MultiExcerpt macros
    console.log('🔍 Extracting MultiExcerpt macros...');
    const multiExcerpts = extractMultiExcerpts(storageContent);
    console.log(`✓ Found ${multiExcerpts.length} MultiExcerpt macros with content\n`);

    // Step 3: Update SmartExcerpt content
    console.log('📝 Updating SmartExcerpt content...');
    const { updatedContent, updatedCount } = updateSmartExcerptContent(storageContent, multiExcerpts);
    console.log(`\n✓ Updated ${updatedCount} SmartExcerpt macros\n`);

    // Step 4: Save or update
    if (DRY_RUN) {
      const fs = require('fs');
      const outputPath = './migrated-page-storage.xml';
      fs.writeFileSync(outputPath, updatedContent, 'utf8');

      console.log('✅ DRY RUN SUCCESS!');
      console.log(`\n📄 Updated storage saved to: ${outputPath}`);
      console.log('\n⚠️  NEXT STEPS:');
      console.log('   1. Review the updated storage file');
      console.log('   2. Run without --dry-run to update the page\n');
    } else {
      console.log('🚀 Updating page via API...');
      await updatePageContent(PAGE_ID, updatedContent, currentVersion);
      console.log('✓ Page updated successfully!\n');

      console.log('✅ SUCCESS!');
      console.log(`\n🎉 ${updatedCount} SmartExcerpt macros have been updated with content!`);
      console.log('\n⚠️  NEXT STEPS:');
      console.log('   1. Refresh the Confluence page in your browser');
      console.log('   2. Verify all SmartExcerpt macros show the correct content');
      console.log('   3. Delete the old MultiExcerpt macros\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

main();
