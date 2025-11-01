#!/usr/bin/env node

/**
 * Clone SmartExcerpt Macros Script
 *
 * This script clones an existing, initialized SmartExcerpt macro 147 times
 * and updates each clone's name to match the MultiExcerpt macros.
 *
 * Prerequisites:
 * 1. Manually create ONE SmartExcerpt macro on the page
 * 2. Initialize it with any name/category (we'll update the names)
 * 3. Save the page
 * 4. Set environment variables:
 *    export CONFLUENCE_EMAIL="your-email@example.com"
 *    export CONFLUENCE_API_TOKEN="your-api-token"
 * 5. Run this script: node clone-macros.js [--dry-run]
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

// Extract MultiExcerpt names from storage
function extractMultiExcerptNames(storageContent) {
  const nameRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>[\s\S]*?<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/g;
  const names = [];
  let match;

  while ((match = nameRegex.exec(storageContent)) !== null) {
    names.push(match[1]);
  }

  return names;
}

// Find the SmartExcerpt macro in storage
function findSmartExcerptMacro(storageContent) {
  // Look for ac:adf-extension with SmartExcerpt - it's a bodied-extension, not extension
  const smartExcerptRegex = /<ac:adf-extension><ac:adf-node type="bodied-extension">[\s\S]*?smart-excerpt-source[\s\S]*?<\/ac:adf-node><\/ac:adf-extension>/;

  const match = storageContent.match(smartExcerptRegex);

  if (!match) {
    throw new Error('No SmartExcerpt macro found! Please create one manually first.');
  }

  return match[0];
}

// Clone the SmartExcerpt macro and update its name
function cloneSmartExcerptWithName(macroXML, newName) {
  // The name is stored in guest-params as excerpt-name
  // Find: <ac:adf-parameter key="excerpt-name">SmartExcerpt0</ac:adf-parameter>
  // Replace the value between the tags

  const nameRegex = /(<ac:adf-parameter key="excerpt-name">)(.*?)(<\/ac:adf-parameter>)/;

  const updated = macroXML.replace(nameRegex, (match, before, oldName, after) => {
    return before + newName + after;
  });

  return updated;
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
      message: 'Cloned SmartExcerpt macros from script'
    }
  };

  return makeRequest('PUT', `/wiki/api/v2/pages/${pageId}`, body);
}

// Main function
async function main() {
  console.log('🚀 SmartExcerpt Macro Cloning Script Starting...\n');

  try {
    // Step 1: Fetch page storage
    console.log('📡 Fetching page storage...');
    const pageData = await fetchPageStorage();
    const storageContent = pageData.body.storage.value;
    const currentVersion = pageData.version.number;
    console.log(`✓ Page storage fetched (version ${currentVersion})\n`);

    // Step 2: Extract MultiExcerpt names
    console.log('🔍 Extracting MultiExcerpt names...');
    const multiExcerptNames = extractMultiExcerptNames(storageContent);
    console.log(`✓ Found ${multiExcerptNames.length} MultiExcerpt macros`);
    if (multiExcerptNames.length > 0) {
      console.log(`   First: "${multiExcerptNames[0]}"`);
      console.log(`   Last: "${multiExcerptNames[multiExcerptNames.length - 1]}"\n`);
    }

    // Step 3: Find the SmartExcerpt macro
    console.log('🔍 Finding SmartExcerpt macro template...');
    const smartExcerptTemplate = findSmartExcerptMacro(storageContent);
    console.log('✓ Found SmartExcerpt macro template\n');

    // Step 4: Clone and create all SmartExcerpt macros
    console.log('📝 Cloning SmartExcerpt macros...');
    const clonedMacros = multiExcerptNames.map(name => {
      return cloneSmartExcerptWithName(smartExcerptTemplate, name);
    });
    console.log(`✓ Created ${clonedMacros.length} cloned macros\n`);

    // Step 5: Insert clones into storage
    console.log('📝 Inserting clones into page storage...');

    // Find where to insert (after the original SmartExcerpt)
    const insertPosition = storageContent.indexOf(smartExcerptTemplate) + smartExcerptTemplate.length;

    const updatedStorage =
      storageContent.slice(0, insertPosition) +
      '\n' + clonedMacros.join('\n') + '\n' +
      storageContent.slice(insertPosition);

    console.log('✓ Macros inserted into storage\n');

    // Step 6: Either save to file or update the page
    if (DRY_RUN) {
      const fs = require('fs');
      const outputPath = './updated-page-storage.xml';
      fs.writeFileSync(outputPath, updatedStorage, 'utf8');

      console.log('✅ DRY RUN SUCCESS!');
      console.log(`\n📄 Updated storage saved to: ${outputPath}`);
      console.log('\n⚠️  NEXT STEPS:');
      console.log('   1. Review the updated storage file');
      console.log('   2. Run without --dry-run to update the page');
      console.log('   3. Or manually update via Confluence API\n');
    } else {
      console.log('🚀 Updating page via API...');
      await updatePageContent(PAGE_ID, updatedStorage, currentVersion);
      console.log('✓ Page updated successfully!\n');

      console.log('✅ SUCCESS!');
      console.log(`\n🎉 ${clonedMacros.length} SmartExcerpt macros have been cloned!`);
      console.log('\n⚠️  NEXT STEPS:');
      console.log('   1. Refresh the Confluence page in your browser');
      console.log('   2. Verify all SmartExcerpt macros appear correctly');
      console.log('   3. Copy content from MultiExcerpt to SmartExcerpt macros');
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
