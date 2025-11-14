/**
 * Page Scanner Module
 *
 * Handles fetching Confluence pages and detecting macros in ADF content.
 * Used by checkIncludesWorker to verify that Embed macros still exist on pages.
 */

import api, { route } from '@forge/api';

/**
 * Fetch page content from Confluence API
 * @param {string} pageId - Confluence page ID
 * @returns {Promise<{success: boolean, pageData?: Object, adfContent?: Object, error?: string}>}
 */
export async function fetchPageContent(pageId) {
  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Page ${pageId} not found or inaccessible (HTTP ${response.status})`
      };
    }

    const pageData = await response.json();
    const adfContent = JSON.parse(pageData.body?.atlas_doc_format?.value || '{}');

    return {
      success: true,
      pageData,
      adfContent
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if a macro with given localId exists in ADF content
 * Recursively searches through ADF structure for extension nodes with matching localId
 *
 * CRITICAL: This function determines if an embed is orphaned. False negatives
 * cause data deletion. Extensive logging added to debug search failures.
 *
 * @param {Object} node - ADF node to search
 * @param {string} targetLocalId - localId to find
 * @param {number} depth - Current recursion depth (for logging)
 * @returns {boolean} True if macro exists in ADF
 */
export function checkMacroExistsInADF(node, targetLocalId, depth = 0) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  // Log search initiation (only at root level)
  if (depth === 0) {
    console.log(`[CHECK-MACRO] 🔍 Searching for localId: ${targetLocalId}`);
  }

  // Check if this node is an extension (macro)
  if (node.type === 'extension') {
    // Log EVERY extension we find for debugging
    console.log(`[CHECK-MACRO] Found extension at depth ${depth}:`, {
      extensionType: node.attrs?.extensionType,
      extensionKey: node.attrs?.extensionKey,
      localId: node.attrs?.localId,
      macroId: node.attrs?.parameters?.macroParams?.['macro-id'],
      hasLocalId: !!node.attrs?.localId
    });

    // Check for Blueprint Standard Embed macro (current name)
    // NOTE: Forge apps use full path in extensionKey like:
    // "be1ff96b-.../static/blueprint-standard-embed"
    // So we check if the key CONTAINS or ENDS WITH our macro name
    const extensionKey = node.attrs?.extensionKey || '';
    const isOurMacro = extensionKey.includes('blueprint-standard-embed') ||
                       extensionKey.includes('smart-excerpt-include') || // Legacy name
                       extensionKey.includes('blueprint-standard-embed-poc') || // POC version
                       extensionKey === 'blueprint-standard-embed' || // Exact match (just in case)
                       extensionKey === 'smart-excerpt-include' || // Exact match legacy
                       extensionKey === 'blueprint-standard-embed-poc'; // Exact match POC

    if (isOurMacro) {
      console.log(`[CHECK-MACRO] ✅ Found our embed macro (${node.attrs.extensionKey})`);

      // Check localId match
      if (node.attrs?.localId === targetLocalId) {
        console.log(`[CHECK-MACRO] ✅✅ MATCH! Found embed with localId: ${targetLocalId}`);
        return true;
      } else {
        console.log(`[CHECK-MACRO] ⚠️ localId mismatch: expected ${targetLocalId}, got ${node.attrs?.localId}`);
      }
    }

    // Also check if extensionType matches (broader check for any Confluence/Forge macro)
    if (node.attrs?.extensionType === 'com.atlassian.confluence.macro.core' ||
        node.attrs?.extensionType === 'com.atlassian.ecosystem') {
      // This is a Confluence or Forge macro - check if localId matches regardless of extensionKey
      if (node.attrs?.localId === targetLocalId) {
        console.log(`[CHECK-MACRO] ✅ Found macro with matching localId (type: ${node.attrs.extensionType})`);
        console.log(`[CHECK-MACRO] Extension key: ${node.attrs?.extensionKey}`);
        return true;
      }
    }
  }

  // Recursively check content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (checkMacroExistsInADF(child, targetLocalId, depth + 1)) {
        return true;
      }
    }
  }

  // Also check marks array (some content nests in marks)
  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (checkMacroExistsInADF(mark, targetLocalId, depth + 1)) {
        return true;
      }
    }
  }

  // Log if we finished searching without finding it (only at root level)
  if (depth === 0) {
    console.log(`[CHECK-MACRO] ❌ Search complete - localId ${targetLocalId} NOT found in ADF`);
    console.log(`[CHECK-MACRO] ⚠️ WARNING: About to mark as orphaned - THIS MAY BE A FALSE POSITIVE!`);
  }

  return false;
}

/**
 * Group includes by pageId for efficient batch processing
 * @param {Array} includes - Array of include references
 * @returns {Object} Map of pageId -> array of includes on that page
 */
export function groupIncludesByPage(includes) {
  const includesByPage = {};
  includes.forEach(include => {
    if (!includesByPage[include.pageId]) {
      includesByPage[include.pageId] = [];
    }
    includesByPage[include.pageId].push(include);
  });
  return includesByPage;
}
