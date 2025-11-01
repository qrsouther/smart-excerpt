#!/usr/bin/env node

/**
 * MultiExcerpt to SmartExcerpt Migration Script
 *
 * This script automates the migration of MultiExcerpt macros to SmartExcerpt macros
 * by using Puppeteer to interact with the Confluence editor UI.
 *
 * Usage:
 *   node migrate-macros.js
 *
 * The script will:
 * 1. Open the Confluence edit page in a visible browser
 * 2. Find each MultiExcerpt macro
 * 3. Copy its content
 * 4. Insert a SmartExcerpt macro using slash command
 * 5. Paste the content
 * 6. Delete the old MultiExcerpt macro
 *
 * You can stop the script at any time with Ctrl+C
 */

const puppeteer = require('puppeteer');

// Configuration
const CONFIG = {
  pageUrl: 'https://qrsouther.atlassian.net/wiki/spaces/~5bb22d3a0958e968ce8153a3/pages/edit-v2/80150529',
  headless: false, // Set to false so you can watch it work
  slowMo: 100, // Slow down by 100ms to make actions visible
  defaultTimeout: 30000,
  pauseBetweenMacros: 2000, // Pause 2 seconds between each macro
};

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForUserLogin(page) {
  log('\n⏳ Waiting for you to log in to Confluence...', colors.yellow);
  log('   Please log in manually in the browser window that just opened.', colors.yellow);
  log('   The script will automatically continue once you reach the edit page.\n', colors.yellow);

  // Wait for the page to have the Confluence editor loaded
  // This indicates the user has logged in and navigation is complete
  await page.waitForFunction(
    () => {
      // Check if we're on the edit page and the editor has loaded
      return document.querySelector('[data-testid="fabric-editor-container"]') !== null ||
             document.querySelector('.ak-editor-content-area') !== null ||
             document.querySelector('[role="textbox"]') !== null;
    },
    { timeout: 300000 } // Wait up to 5 minutes for login
  );

  log('✅ Login detected! Editor loaded.', colors.green);
  await sleep(2000); // Give the editor a moment to fully initialize
}

async function fetchMultiExcerptNamesFromAPI(pageId) {
  log('\n📡 Fetching MultiExcerpt names from Confluence API...', colors.blue);

  const url = `https://qrsouther.atlassian.net/wiki/api/v2/pages/${pageId}?body-format=storage`;

  try {
    const https = require('https');
    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        res.on('error', reject);
      }).on('error', reject);
    });

    if (response.statusCode !== 200) {
      throw new Error(`API returned status ${response.statusCode}`);
    }

    const pageData = JSON.parse(response.body);
    const storageContent = pageData.body.storage.value;

    // Extract all MultiExcerpt macro names in order
    const nameRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>[\s\S]*?<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/g;
    const names = [];
    let match;

    while ((match = nameRegex.exec(storageContent)) !== null) {
      names.push(match[1]);
    }

    log(`   Found ${names.length} MultiExcerpt macro name(s) in storage`, colors.cyan);
    if (names.length > 0) {
      log(`   First: "${names[0]}"`, colors.cyan);
      log(`   Last: "${names[names.length - 1]}"`, colors.cyan);
    }

    return names;

  } catch (error) {
    log(`   ❌ Error fetching from API: ${error.message}`, colors.red);
    throw error;
  }
}

async function findMultiExcerptMacros(page, expectedNames) {
  log('\n🔍 Looking for MultiExcerpt macros in editor...', colors.blue);

  // Find all extension containers (should match the count from API)
  const macros = await page.evaluate(() => {
    const results = [];
    const allExtensions = document.querySelectorAll('[data-testid="extension-container"]');

    allExtensions.forEach((container, index) => {
      const contentWrapper = container.querySelector('.bodiedExtension-content-dom-wrapper');
      const textPreview = container.textContent.substring(0, 150).trim();

      results.push({
        index,
        textPreview,
        hasContent: !!contentWrapper,
      });
    });

    return results;
  });

  log(`   Found ${macros.length} extension container(s) in DOM`, colors.cyan);

  if (macros.length !== expectedNames.length) {
    log(`   ⚠️  Warning: DOM count (${macros.length}) doesn't match storage count (${expectedNames.length})`, colors.yellow);
  }

  // Match macros with names by index
  const matchedMacros = macros.map((macro, index) => ({
    ...macro,
    name: expectedNames[index] || `Unknown-${index}`,
  }));

  if (matchedMacros.length > 0) {
    log(`   First macro: "${matchedMacros[0].name}"`, colors.cyan);
  }

  return matchedMacros;
}

async function migrateSingleMacro(page, macro, macroIndex, totalMacros) {
  log(`\n📝 Processing macro ${macroIndex + 1} of ${totalMacros}: "${macro.name}"`, colors.blue);

  try {
    // Step 1: Select and copy the MultiExcerpt body content
    log('   1️⃣  Selecting MultiExcerpt content...', colors.cyan);

    const copyResult = await page.evaluate((index) => {
      try {
        const containers = document.querySelectorAll('[data-testid="extension-container"]');
        const container = containers[index];

        if (!container) {
          return { success: false, error: 'Container not found' };
        }

        // Find the content wrapper
        const contentWrapper = container.querySelector('.bodiedExtension-content-dom-wrapper');
        if (!contentWrapper) {
          return { success: false, error: 'No content wrapper found' };
        }

        // Select all content in the wrapper
        const range = document.createRange();
        range.selectNodeContents(contentWrapper);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        // Copy to clipboard
        document.execCommand('copy');

        // Clear selection
        selection.removeAllRanges();

        return { success: true, contentLength: contentWrapper.textContent.length };

      } catch (err) {
        return { success: false, error: err.message };
      }
    }, macroIndex);

    if (!copyResult.success) {
      throw new Error(`Failed to copy content: ${copyResult.error}`);
    }

    log(`   ✓ Copied ${copyResult.contentLength} characters`, colors.green);

    // Step 2: Position cursor after the macro and trigger slash command
    log('   2️⃣  Positioning cursor after macro...', colors.cyan);

    // Find and click the position after the macro
    const clickResult = await page.evaluate((index) => {
      try {
        const containers = document.querySelectorAll('[data-testid="extension-container"]');
        const container = containers[index];

        if (!container) {
          return { success: false, error: 'Container not found' };
        }

        // Get the bounding rect for clicking
        const rect = container.getBoundingClientRect();

        // Return coordinates to click just below the container
        return {
          success: true,
          x: rect.left + 50,
          y: rect.bottom + 20
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }, macroIndex);

    if (!clickResult.success) {
      throw new Error(`Failed to find click position: ${clickResult.error}`);
    }

    // Click at the position (this should create a new paragraph and focus it)
    await page.mouse.click(clickResult.x, clickResult.y);
    await sleep(1000);

    log('   ✓ Cursor positioned', colors.green);
    log('   3️⃣  Typing /smartexcerpt...', colors.cyan);

    // Type the slash command character by character
    await page.keyboard.type('/smartexcerpt', { delay: 100 });

    await sleep(2000);

    log('   ✓ Slash command triggered', colors.green);
    log('   ⏸️  Pausing - check the browser to see the slash menu!', colors.yellow);

    // TODO: Steps 3-6 will be implemented next
    log('   ⚠️  Steps 3-6 not yet implemented:', colors.yellow);
    log('     3. Select SmartExcerpt from menu', colors.yellow);
    log('     4. Fill in config modal (name, category)', colors.yellow);
    log('     5. Paste content into macro body', colors.yellow);
    log('     6. Delete old MultiExcerpt macro', colors.yellow);

    return { success: true, name: macro.name, partial: true };

  } catch (error) {
    log(`   ❌ Error processing macro: ${error.message}`, colors.red);
    console.error(error);
    return { success: false, error: error.message };
  }
}

async function main() {
  log('╔════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║   MultiExcerpt → SmartExcerpt Migration Tool              ║', colors.cyan);
  log('╚════════════════════════════════════════════════════════════╝', colors.cyan);

  log('\n🚀 Starting migration script...', colors.green);
  log(`   Page: ${CONFIG.pageUrl}`, colors.cyan);
  log(`   Mode: ${CONFIG.headless ? 'Headless' : 'Visible (you can watch!)'}`, colors.cyan);
  log(`   Press Ctrl+C at any time to stop the script\n`, colors.yellow);

  let browser;

  try {
    // First, fetch MultiExcerpt names from the API
    const pageId = '80150529';
    const multiExcerptNames = await fetchMultiExcerptNamesFromAPI(pageId);

    if (multiExcerptNames.length === 0) {
      log('\n⚠️  No MultiExcerpt macros found in page storage.', colors.yellow);
      return;
    }

    // Launch browser with user profile
    log('\n🌐 Launching Chrome with your work profile (Profile 6)...', colors.blue);
    const userDataDir = '/Users/quinnsouther/Library/Application Support/Google/Chrome';
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--user-data-dir=${userDataDir}`,
        '--profile-directory=Profile 6', // Use your work Chrome profile
        '--disable-session-crashed-bubble', // Prevent "Restore pages?" prompt
        '--disable-infobars', // Disable info bars
        '--disable-restore-session-state', // Don't restore previous session
      ],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(CONFIG.defaultTimeout);

    // Navigate to the edit page
    log('📄 Navigating to Confluence edit page...', colors.blue);
    await page.goto(CONFIG.pageUrl, { waitUntil: 'domcontentloaded' });

    // Wait for user to log in
    await waitForUserLogin(page);

    // Find all MultiExcerpt macros (match with names from API)
    const macros = await findMultiExcerptMacros(page, multiExcerptNames);

    if (macros.length === 0) {
      log('\n⚠️  No MultiExcerpt macros found on the page.', colors.yellow);
      log('   This could mean:', colors.yellow);
      log('   - They have already been migrated', colors.yellow);
      log('   - The page selectors need to be updated', colors.yellow);
      log('   - The page has not fully loaded', colors.yellow);
      return;
    }

    // TEST MODE: Process only the first macro
    log('\n🧪 TEST MODE: Processing only the first macro...', colors.yellow);
    log('   This will test steps 1-2 (copy content and trigger slash command)', colors.yellow);
    log('   Steps 3-6 are not yet implemented\n', colors.yellow);

    const testMacro = macros[0];
    const result = await migrateSingleMacro(page, testMacro, 0, 1);

    if (result.success) {
      log('\n╔════════════════════════════════════════════════════════════╗', colors.green);
      log('║                   Test Successful!                         ║', colors.green);
      log('╚════════════════════════════════════════════════════════════╝', colors.green);
      log(`\n   ✅ Successfully processed macro: "${result.name}"`, colors.green);
      log(`   ✅ Content copied to clipboard`, colors.green);
      log(`   ✅ Slash command "/smartexcerpt" typed`, colors.green);
      log('\n📋 Next Steps:', colors.cyan);
      log('   1. Check the browser window', colors.cyan);
      log('   2. Verify the slash command menu appeared', colors.cyan);
      log('   3. Verify the content is in your clipboard', colors.cyan);
      log('\n⏳ Script will remain open for inspection...', colors.yellow);
      log('   Press Ctrl+C when you are done reviewing\n', colors.yellow);

      // Wait indefinitely so user can inspect
      await new Promise(() => {});
    } else {
      log('\n❌ Test Failed!', colors.red);
      log(`   Error: ${result.error}`, colors.red);
      log('\n   Review the error above and the browser window', colors.yellow);
    }

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, colors.red);
    console.error(error);
  } finally {
    if (browser) {
      log('\n🔚 Closing browser in 10 seconds...', colors.yellow);
      log('   (Press Ctrl+C to keep it open for inspection)', colors.yellow);
      await sleep(10000);
      await browser.close();
    }
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\n⚠️  Script interrupted by user (Ctrl+C)', colors.yellow);
  log('   Browser will remain open for inspection', colors.yellow);
  process.exit(0);
});

// Run the script
main().catch((error) => {
  log(`\n❌ Unhandled error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
