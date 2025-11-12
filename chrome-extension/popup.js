// MultiExcerpt Include Scanner - Chrome Extension
// Ported from Blueprint App Forge app

let scanResults = null;

// DOM Elements
const scanButton = document.getElementById('scan-button');
const downloadButton = document.getElementById('download-button');
const statusMessage = document.getElementById('status-message');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const progressDetails = document.getElementById('progress-details');
const resultsArea = document.getElementById('results');
const resultsSummary = document.getElementById('results-summary');
const errorArea = document.getElementById('error-area');

// Get the current Confluence instance URL
async function getCurrentConfluenceUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);

  if (!url.hostname.includes('atlassian.net')) {
    throw new Error('Please navigate to a Confluence page on atlassian.net');
  }

  return `${url.protocol}//${url.hostname}`;
}

// Decode HTML entities (e.g., &amp; -> &)
function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// Decode MultiExcerpt templateData (base64 + zlib compressed JSON)
// Recycled from src/index.js:1816-1837
function decodeTemplateData(templateDataString) {
  try {
    // First decode any HTML entities (e.g., &amp; -> &)
    const htmlDecoded = decodeHtmlEntities(templateDataString);

    // Remove any whitespace
    const cleaned = htmlDecoded.trim();

    // Base64 decode
    const binaryString = atob(cleaned);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Zlib decompress using pako
    const decompressed = pako.inflate(bytes, { to: 'string' });

    // Parse JSON
    const parsed = JSON.parse(decompressed);

    return parsed;
  } catch (error) {
    console.error('Error decoding templateData:', error);
    return null;
  }
}

// Update UI progress
function updateProgress(percent, status, details = '') {
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
  statusMessage.textContent = status;
  statusMessage.className = 'status-scanning';

  if (details) {
    progressDetails.textContent = details;
  }
}

// Show error
function showError(message) {
  errorArea.textContent = message;
  errorArea.classList.remove('hidden');
  statusMessage.textContent = 'Scan failed';
  statusMessage.className = 'status-error';
}

// Hide error
function hideError() {
  errorArea.classList.add('hidden');
}

// Escape CSV values
// Recycled from src/admin-page.jsx:560-567
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

// Generate CSV from scan results
// Recycled from src/admin-page.jsx:558-619
function generateCSV(includeData) {
  // Collect all unique variable names across all includes
  const allVariables = new Set();
  includeData.forEach(inc => {
    if (inc.variableValues && Array.isArray(inc.variableValues)) {
      inc.variableValues.forEach(varObj => {
        if (varObj.k) {
          allVariables.add(varObj.k);
        }
      });
    }
  });

  const variableColumns = Array.from(allVariables).sort();

  // Build CSV header
  const baseHeaders = [
    'Page ID',
    'Page Title',
    'Page URL',
    'MultiExcerpt Name',
    'Source Page Title'
  ];

  // Add variable columns
  const variableHeaders = variableColumns.map(varName => `Variable: ${varName}`);

  const headers = [...baseHeaders, ...variableHeaders];

  // Build CSV rows
  const rows = includeData.map(inc => {
    const row = [
      escapeCSV(inc.pageId || ''),
      escapeCSV(inc.pageTitle || ''),
      escapeCSV(inc.pageUrl || ''),
      escapeCSV(inc.multiExcerptName || ''),
      escapeCSV(inc.sourcePageTitle || '')
    ];

    // Add variable values
    variableColumns.forEach(varName => {
      const varObj = inc.variableValues?.find(v => v.k === varName);
      const value = varObj?.v || '';
      row.push(escapeCSV(value));
    });

    return row.join(',');
  });

  // Combine header and rows
  return [headers.join(','), ...rows].join('\n');
}

// Download CSV file
function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Main scan function
// Recycled and adapted from src/index.js:1839-2021
async function scanMultiExcerptIncludes() {
  try {
    hideError();
    scanButton.disabled = true;
    downloadButton.classList.add('hidden');
    resultsArea.classList.add('hidden');
    progressContainer.classList.remove('hidden');

    updateProgress(0, 'Initializing scan...', '');

    // Get Confluence instance URL
    const baseUrl = await getCurrentConfluenceUrl();
    console.log('Scanning Confluence instance:', baseUrl);

    // Use CQL to search for pages with multiexcerpt-include-macro in 'cs' space
    const cql = encodeURIComponent('space = cs AND macro = "multiexcerpt-include-macro"');
    const searchUrl = `${baseUrl}/wiki/rest/api/content/search?cql=${cql}&limit=100&expand=space`;

    updateProgress(5, 'Searching for pages with MultiExcerpt Includes...', '');

    console.log('CQL search URL:', searchUrl);

    const searchResponse = await fetch(searchUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!searchResponse.ok) {
      throw new Error(`CQL search failed: ${searchResponse.status} ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    const pages = searchData.results || [];
    const totalPages = pages.length;

    console.log(`Found ${totalPages} pages with MultiExcerpt Includes`);

    updateProgress(10, `Found ${totalPages} pages to scan...`, '');

    const includeData = [];
    let processedPages = 0;

    // Process each page
    for (const page of pages) {
      try {
        const pageId = page.id;
        const pageTitle = page.title || 'Unknown Page';

        console.log(`Processing page: ${pageTitle} (${pageId})`);

        // Update progress
        processedPages++;
        const percent = Math.min(10 + Math.floor((processedPages / totalPages) * 85), 95);
        updateProgress(
          percent,
          `Scanning page ${processedPages}/${totalPages}...`,
          pageTitle
        );

        // Fetch page content with storage format
        const pageUrl = `${baseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`;
        const pageResponse = await fetch(pageUrl, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!pageResponse.ok) {
          console.log(`⚠️ Could not fetch page ${pageId}`);
          continue;
        }

        const pageData = await pageResponse.json();
        const storageValue = pageData?.body?.storage?.value || '';

        if (!storageValue) {
          console.log(`⚠️ No storage content for page ${pageId}`);
          continue;
        }

        // Parse storage format XML to find multiexcerpt-include-macro instances
        // Look for <ac:structured-macro ac:name="multiexcerpt-include-macro"
        // Recycled regex from src/index.js:1933
        const macroRegex = /<ac:structured-macro ac:name="multiexcerpt-include-macro"[^>]*>(.*?)<\/ac:structured-macro>/gs;
        let macroMatch;

        while ((macroMatch = macroRegex.exec(storageValue)) !== null) {
          const macroXml = macroMatch[0];
          const macroContent = macroMatch[1];

          // Extract parameters (recycled from src/index.js:1940-1943)
          const nameMatch = /<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/.exec(macroContent);
          const templateDataMatch = /<ac:parameter ac:name="templateData">([^<]+)<\/ac:parameter>/.exec(macroContent);
          const pageRefMatch = /<ri:page ri:content-title="([^"]+)"/.exec(macroContent);

          const multiExcerptName = nameMatch ? nameMatch[1] : 'Unknown';
          const templateDataEncoded = templateDataMatch ? templateDataMatch[1] : null;
          const sourcePageTitle = pageRefMatch ? pageRefMatch[1] : 'Unknown Source';

          console.log(`Found Include: ${multiExcerptName}`);

          // Decode templateData to get variable values
          let variableValues = [];
          if (templateDataEncoded) {
            const decoded = decodeTemplateData(templateDataEncoded);
            if (decoded && Array.isArray(decoded)) {
              variableValues = decoded;
              console.log(`  Variables:`, variableValues);
            }
          }

          // Store the include data
          includeData.push({
            pageId,
            pageTitle,
            pageUrl: `${baseUrl}/wiki/pages/viewpage.action?pageId=${pageId}`,
            multiExcerptName,
            sourcePageTitle,
            variableValues
          });
        }

      } catch (pageError) {
        console.error(`Error processing page ${page.id}:`, pageError);
      }
    }

    // Scan complete
    updateProgress(100, 'Scan complete!', '');

    console.log(`✅ Scan complete: Found ${includeData.length} MultiExcerpt Includes across ${totalPages} pages`);

    // Store results
    scanResults = includeData;

    // Show results
    statusMessage.textContent = 'Scan complete!';
    statusMessage.className = 'status-complete';

    resultsArea.classList.remove('hidden');
    resultsSummary.innerHTML = `
      <strong>✅ Scan completed successfully</strong><br>
      • Found <strong>${includeData.length}</strong> MultiExcerpt Include(s)<br>
      • Across <strong>${totalPages}</strong> page(s) in 'cs' space
    `;

    if (includeData.length > 0) {
      downloadButton.classList.remove('hidden');
    }

  } catch (error) {
    console.error('Error scanning MultiExcerpt includes:', error);
    showError(`Scan failed: ${error.message}`);
  } finally {
    scanButton.disabled = false;
  }
}

// Handle download button click
function handleDownload() {
  if (!scanResults || scanResults.length === 0) {
    showError('No scan results available');
    return;
  }

  const csv = generateCSV(scanResults);
  const filename = `multiexcerpt-includes-scan-${new Date().toISOString().split('T')[0]}.csv`;
  downloadCSV(csv, filename);

  // Show success message
  statusMessage.textContent = 'CSV downloaded successfully!';
  statusMessage.className = 'status-complete';
}

// Event listeners
scanButton.addEventListener('click', scanMultiExcerptIncludes);
downloadButton.addEventListener('click', handleDownload);

// Check if we're on a Confluence page
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab.url.includes('atlassian.net')) {
    showError('Please navigate to a Confluence page on atlassian.net to use this extension');
    scanButton.disabled = true;
  }
});

// =====================================
// TAB 2: EXPORT SOURCES
// =====================================

// Export tab DOM elements
const tabScan = document.getElementById('tab-scan');
const tabExport = document.getElementById('tab-export');
const tabMigrate = document.getElementById('tab-migrate');
const panelScan = document.getElementById('panel-scan');
const panelExport = document.getElementById('panel-export');
const panelMigrate = document.getElementById('panel-migrate');
const sourceUrlInput = document.getElementById('source-url');
const exportButton = document.getElementById('export-button');
const downloadJsonButton = document.getElementById('download-json-button');
const exportStatusMessage = document.getElementById('export-status-message');
const exportProgressContainer = document.getElementById('export-progress-container');
const exportProgressFill = document.getElementById('export-progress-fill');
const exportProgressText = document.getElementById('export-progress-text');
const exportProgressDetails = document.getElementById('export-progress-details');
const exportResultsArea = document.getElementById('export-results');
const exportResultsSummary = document.getElementById('export-results-summary');
const exportErrorArea = document.getElementById('export-error-area');

let exportedSources = null;

// Tab switching
tabScan.addEventListener('click', () => {
  tabScan.classList.add('active');
  tabExport.classList.remove('active');
  tabMigrate.classList.remove('active');
  panelScan.classList.add('active');
  panelExport.classList.remove('active');
  panelMigrate.classList.remove('active');
});

tabExport.addEventListener('click', () => {
  tabExport.classList.add('active');
  tabScan.classList.remove('active');
  tabMigrate.classList.remove('active');
  panelExport.classList.add('active');
  panelScan.classList.remove('active');
  panelMigrate.classList.remove('active');
});

tabMigrate.addEventListener('click', () => {
  tabMigrate.classList.add('active');
  tabScan.classList.remove('active');
  tabExport.classList.remove('active');
  panelMigrate.classList.add('active');
  panelScan.classList.remove('active');
  panelExport.classList.remove('active');
});

// Update export UI progress
function updateExportProgress(percent, status, details = '') {
  exportProgressFill.style.width = `${percent}%`;
  exportProgressText.textContent = `${percent}%`;
  exportStatusMessage.textContent = status;
  exportStatusMessage.className = 'status-scanning';

  if (details) {
    exportProgressDetails.textContent = details;
  }
}

// Show export error
function showExportError(message) {
  exportErrorArea.textContent = message;
  exportErrorArea.classList.remove('hidden');
  exportStatusMessage.textContent = 'Export failed';
  exportStatusMessage.className = 'status-error';
}

// Hide export error
function hideExportError() {
  exportErrorArea.classList.add('hidden');
}

// Detect variables in text content (NO toggles - MultiExcerpt doesn't have them)
// Recycled pattern from Forge app's detectVariables function
function detectVariables(textContent) {
  const variables = [];
  const variableRegex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = variableRegex.exec(textContent)) !== null) {
    const varName = match[1].trim();
    // Skip toggle markers (just in case they exist, though they shouldn't)
    if (varName.startsWith('toggle:') || varName.startsWith('/toggle:')) {
      continue;
    }
    if (!variables.find(v => v.name === varName)) {
      variables.push({
        name: varName,
        description: '',
        example: '',
        required: false
      });
    }
  }

  return variables;
}

// Extract text from storage format (simplified - just get the text)
function extractTextFromStorage(storageContent) {
  if (!storageContent) return '';

  // Remove XML tags to get plain text
  let text = storageContent;
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/\s+/g, ' ');

  return text.trim();
}

// Parse page ID from Confluence URL
function parsePageIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const pagesIndex = pathParts.indexOf('pages');

    if (pagesIndex >= 0 && pagesIndex + 1 < pathParts.length) {
      return pathParts[pagesIndex + 1];
    }

    throw new Error('Could not extract page ID from URL');
  } catch (error) {
    throw new Error(`Invalid URL format: ${error.message}`);
  }
}

// Main export function
async function exportMultiExcerptSources() {
  try {
    hideExportError();
    exportButton.disabled = true;
    downloadJsonButton.classList.add('hidden');
    exportResultsArea.classList.add('hidden');
    exportProgressContainer.classList.remove('hidden');

    updateExportProgress(0, 'Initializing export...', '');

    // Parse source URL
    const sourceUrl = sourceUrlInput.value.trim();
    if (!sourceUrl) {
      throw new Error('Please enter a source page URL');
    }

    const sourceUrlObj = new URL(sourceUrl);
    const baseUrl = `${sourceUrlObj.protocol}//${sourceUrlObj.hostname}`;
    const pageId = parsePageIdFromUrl(sourceUrl);

    console.log('Exporting from:', baseUrl);
    console.log('Page ID:', pageId);

    updateExportProgress(10, 'Fetching page content...', '');

    // Fetch page with storage format
    const pageUrl = `${baseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`;
    const pageResponse = await fetch(pageUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status} ${pageResponse.statusText}`);
    }

    const pageData = await pageResponse.json();
    const storageValue = pageData?.body?.storage?.value || '';
    const pageTitle = pageData.title || 'Unknown Page';

    if (!storageValue) {
      throw new Error('Page has no content');
    }

    console.log('Page fetched:', pageTitle);
    updateExportProgress(30, 'Parsing MultiExcerpt Source macros...', '');

    // Parse MultiExcerpt Source macros
    // Look for <ac:structured-macro ac:name="multiexcerpt-macro">
    const macroRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>(.*?)<\/ac:structured-macro>/gs;
    const sources = [];
    let macroMatch;
    let processedCount = 0;

    const macroMatches = [...storageValue.matchAll(macroRegex)];
    const totalMacros = macroMatches.length;

    console.log(`Found ${totalMacros} MultiExcerpt Source macros`);

    for (const match of macroMatches) {
      try {
        const macroContent = match[1];

        // Extract name parameter
        const nameMatch = /<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/.exec(macroContent);
        const name = nameMatch ? decodeHtmlEntities(nameMatch[1]) : `Untitled ${processedCount + 1}`;

        // Extract body content
        const bodyMatch = /<ac:rich-text-body>(.*?)<\/ac:rich-text-body>/s.exec(macroContent);
        const bodyContent = bodyMatch ? bodyMatch[1] : '';

        // Extract plain text for variable detection
        const textContent = extractTextFromStorage(bodyContent);

        // Detect variables (NO toggles)
        const variables = detectVariables(textContent);

        console.log(`Extracted: "${name}" with ${variables.length} variable(s)`);

        sources.push({
          name,
          content: bodyContent, // Store raw storage format
          variables,
          sourcePageTitle: pageTitle,
          sourcePageId: pageId,
          sourcePageUrl: sourceUrl
        });

        processedCount++;
        const percent = Math.min(30 + Math.floor((processedCount / totalMacros) * 65), 95);
        updateExportProgress(percent, 'Parsing MultiExcerpt Sources...', `${processedCount}/${totalMacros} processed`);

      } catch (error) {
        console.error('Error parsing macro:', error);
      }
    }

    updateExportProgress(100, 'Export complete!', '');

    console.log(`✅ Export complete: ${sources.length} Sources extracted`);

    // Store results
    exportedSources = sources;

    // Show results
    exportStatusMessage.textContent = 'Export complete!';
    exportStatusMessage.className = 'status-complete';

    exportResultsArea.classList.remove('hidden');
    exportResultsSummary.innerHTML = `
      <strong>✅ Export completed successfully</strong><br>
      • Found <strong>${sources.length}</strong> MultiExcerpt Source(s)<br>
      • From page: <strong>${pageTitle}</strong><br>
      • Total variables detected: <strong>${sources.reduce((sum, s) => sum + s.variables.length, 0)}</strong>
    `;

    if (sources.length > 0) {
      downloadJsonButton.classList.remove('hidden');
    }

  } catch (error) {
    console.error('Error exporting MultiExcerpt sources:', error);
    showExportError(`Export failed: ${error.message}`);
  } finally {
    exportButton.disabled = false;
  }
}

// Download JSON file
function downloadJSON() {
  if (!exportedSources || exportedSources.length === 0) {
    showExportError('No export data available');
    return;
  }

  const jsonData = {
    exportedAt: new Date().toISOString(),
    sourceCount: exportedSources.length,
    sources: exportedSources
  };

  const jsonString = JSON.stringify(jsonData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `multiexcerpt-sources-export-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);

  // Show success message
  exportStatusMessage.textContent = 'JSON downloaded successfully!';
  exportStatusMessage.className = 'status-complete';
}

// Event listeners for export tab
exportButton.addEventListener('click', exportMultiExcerptSources);
downloadJsonButton.addEventListener('click', downloadJSON);

// ==================== TAB 3: MIGRATE MACROS ====================

// DOM Elements for migrate tab
const migrateButton = document.getElementById('migrate-button');
const migrateStopButton = document.getElementById('migrate-stop-button');
const migrateStatusMessage = document.getElementById('migrate-status-message');
const migrateProgressContainer = document.getElementById('migrate-progress-container');
const migrateProgressFill = document.getElementById('migrate-progress-fill');
const migrateProgressText = document.getElementById('migrate-progress-text');
const migrateProgressDetails = document.getElementById('migrate-progress-details');
const migrateResults = document.getElementById('migrate-results');
const migrateResultsSummary = document.getElementById('migrate-results-summary');
const migrateErrorArea = document.getElementById('migrate-error-area');

// Show migrate error
function showMigrateError(message) {
  migrateErrorArea.textContent = message;
  migrateErrorArea.classList.remove('hidden');
  migrateStatusMessage.textContent = 'Migration failed';
  migrateStatusMessage.className = 'status-error';
}

// Hide migrate error
function hideMigrateError() {
  migrateErrorArea.classList.add('hidden');
}

// Update migrate progress
function updateMigrateProgress(data) {
  const { status, current, total, message, details } = data;

  if (status === 'started') {
    migrateProgressContainer.classList.remove('hidden');
    migrateResults.classList.add('hidden');
    hideMigrateError();
    migrateStatusMessage.textContent = message || 'Migration started';
    migrateStatusMessage.className = 'status-scanning';
    migrateProgressText.textContent = `0 / ${total}`;
  }

  if (status === 'processing') {
    const percent = total > 0 ? (current / total) * 100 : 0;
    migrateProgressFill.style.width = `${percent}%`;
    migrateProgressText.textContent = `${current} / ${total}`;
    migrateStatusMessage.textContent = message || 'Processing...';
    if (details) {
      migrateProgressDetails.textContent = details;
    }
  }

  if (status === 'paused') {
    migrateStatusMessage.textContent = message || 'Migration paused';
    migrateStatusMessage.className = 'status-complete';
    if (details) {
      migrateProgressDetails.textContent = details;
    }
  }

  if (status === 'complete') {
    migrateProgressFill.style.width = '100%';
    migrateStatusMessage.textContent = message || 'Migration complete!';
    migrateStatusMessage.className = 'status-complete';
    migrateButton.disabled = false;
  }

  if (status === 'error') {
    showMigrateError(message || 'An error occurred during migration');
    migrateButton.disabled = false;
  }
}

// Start migration
async function startMigration() {
  try {
    migrateButton.disabled = true;
    hideMigrateError();

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if we're on an edit page
    if (!tab.url.includes('/pages/edit-v2/')) {
      showMigrateError('Please navigate to a Confluence edit page (URL must contain /pages/edit-v2/)');
      migrateButton.disabled = false;
      return;
    }

    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['migrate-content.js']
    });

    migrateStatusMessage.textContent = 'Migration script injected...';
    migrateStatusMessage.className = 'status-scanning';

  } catch (error) {
    console.error('Error starting migration:', error);
    showMigrateError(`Failed to start migration: ${error.message}`);
    migrateButton.disabled = false;
  }
}

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MIGRATION_PROGRESS') {
    updateMigrateProgress(message);
  }
});

// Event listener for migrate button
migrateButton.addEventListener('click', startMigration);
