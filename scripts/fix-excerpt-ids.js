#!/usr/bin/env node

/**
 * Fix Excerpt IDs - Generate unique IDs for each Blueprint Standard Source
 *
 * The Edit modal uses excerpt-id to look up the configuration.
 * All cloned macros currently have the same ID.
 * This script generates a unique UUID for each macro.
 *
 * Updated: 2025-11-09 for Blueprint Standard (v7.15.0+)
 */

const https = require('https');
const crypto = require('crypto');

// Parse command line arguments
const args = process.argv.slice(2);
const pageIdArg = args.find(arg => arg.startsWith('--page-id='));
const PAGE_ID = pageIdArg ? pageIdArg.split('=')[1] : '99909654';
const baseUrlArg = args.find(arg => arg.startsWith('--base-url='));
const BASE_URL = baseUrlArg ? baseUrlArg.split('=')[1] : 'https://qrsouther.atlassian.net';
const API_EMAIL = process.env.CONFLUENCE_EMAIL;
const API_TOKEN = process.env.CONFLUENCE_API_TOKEN;
const DRY_RUN = args.includes('--dry-run');

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
      message: 'Fixed excerpt IDs for Blueprint Standard Source macros'
    }
  };

  return makeRequest('PUT', `/wiki/api/v2/pages/${pageId}`, body);
}

// Update excerpt IDs
function updateExcerptIds(storageContent) {
  let updatedContent = storageContent;
  let updateCount = 0;

  // Find all Blueprint Standard Source macros and give each a unique ID
  // We need to match the entire macro and replace the excerpt-id within it
  const macroRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?blueprint-standard-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/g;

  updatedContent = updatedContent.replace(macroRegex, (macroMatch) => {
    // Extract the excerpt-name to log progress
    const nameMatch = macroMatch.match(/<ac:adf-parameter key="excerpt-name">([^<]+)<\/ac:adf-parameter>/);
    const excerptName = nameMatch ? nameMatch[1] : 'Unknown';

    // Skip Blueprint App0 (the template) - keep its ID
    if (excerptName === 'Blueprint App0') {
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
    console.log('🔧 Generating unique IDs for each Blueprint Standard Source...');
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
      console.log(`\n🎉 ${updateCount} Blueprint Standard Source macros now have unique IDs!`);
      console.log('\n⚠️  NEXT STEPS:');
      console.log('   1. Close and reopen the edit page');
      console.log('   2. Click Edit on a Blueprint Standard Source macro');
      console.log('   3. Verify it now shows the correct name');
      console.log('   4. Delete the old MultiExcerpt macros\n');
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
