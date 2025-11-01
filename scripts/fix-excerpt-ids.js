#!/usr/bin/env node

/**
 * Fix Excerpt IDs - Generate unique IDs for each SmartExcerpt
 *
 * The Edit modal uses excerpt-id to look up the configuration.
 * All cloned macros currently have the same ID, so they all show "SmartExcerpt0".
 * This script generates a unique UUID for each macro.
 */

const https = require('https');
const crypto = require('crypto');

const PAGE_ID = '80150529';
const BASE_URL = 'https://qrsouther.atlassian.net';
const API_EMAIL = process.env.CONFLUENCE_EMAIL;
const API_TOKEN = process.env.CONFLUENCE_API_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

// Generate a UUID v4
function generateUUID() {
  return crypto.randomUUID();
}

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
      message: 'Fixed excerpt IDs for SmartExcerpt macros'
    }
  };

  return makeRequest('PUT', `/wiki/api/v2/pages/${pageId}`, body);
}

// Update excerpt IDs
function updateExcerptIds(storageContent) {
  let updatedContent = storageContent;
  let updateCount = 0;

  // Find all SmartExcerpt macros and give each a unique ID
  // We need to match the entire macro and replace the excerpt-id within it
  const macroRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?smart-excerpt-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/g;

  updatedContent = updatedContent.replace(macroRegex, (macroMatch) => {
    // Extract the excerpt-name to log progress
    const nameMatch = macroMatch.match(/<ac:adf-parameter key="excerpt-name">([^<]+)<\/ac:adf-parameter>/);
    const excerptName = nameMatch ? nameMatch[1] : 'Unknown';

    // Skip SmartExcerpt0 (the template) - keep its ID
    if (excerptName === 'SmartExcerpt0') {
      return macroMatch;
    }

    // Generate a new UUID for this macro
    const newId = generateUUID();

    // Replace the excerpt-id
    const updatedMacro = macroMatch.replace(
      /(<ac:adf-parameter key="excerpt-id">)([^<]+)(<\/ac:adf-parameter>)/,
      `$1${newId}$3`
    );

    updateCount++;
    if (updateCount % 10 === 0) {
      console.log(`  ✓ Updated ${updateCount} macros...`);
    }

    return updatedMacro;
  });

  return { updatedContent, updateCount };
}

// Main function
async function main() {
  console.log('🚀 Excerpt ID Fix Script Starting...\n');

  try {
    // Step 1: Fetch page storage
    console.log('📡 Fetching page storage...');
    const pageData = await fetchPageStorage();
    const storageContent = pageData.body.storage.value;
    const currentVersion = pageData.version.number;
    console.log(`✓ Page storage fetched (version ${currentVersion})\n`);

    // Step 2: Update excerpt IDs
    console.log('🔧 Generating unique IDs for each SmartExcerpt...');
    const { updatedContent, updateCount } = updateExcerptIds(storageContent);
    console.log(`✓ Generated ${updateCount} unique IDs\n`);

    // Step 3: Save or update
    if (DRY_RUN) {
      const fs = require('fs');
      const outputPath = './fixed-excerpt-ids.xml';
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
      console.log(`\n🎉 ${updateCount} SmartExcerpt macros now have unique IDs!`);
      console.log('\n⚠️  NEXT STEPS:');
      console.log('   1. Close and reopen the edit page');
      console.log('   2. Click Edit on a SmartExcerpt macro');
      console.log('   3. Verify it now shows the correct name\n');
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
