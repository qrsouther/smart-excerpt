/**
 * Content Injection Resolver
 *
 * Handles manual injection of rendered excerpt content into page storage.
 * Called when user clicks the "Inject Content" button in the Include macro UI.
 */

import api, { route } from '@forge/api';
import { getExcerpt } from '../storage.js';

// Helper function to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to convert ADF to storage format using Confluence API
async function convertAdfToStorage(adfContent) {
  console.log('[INJECT] Converting ADF to storage format via API');

  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/contentbody/convert/storage`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: JSON.stringify(adfContent),
          representation: 'atlas_doc_format'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[INJECT] ADF conversion failed: ${response.status} - ${errorText}`);
      return null;
    }

    const result = await response.json();
    console.log('[INJECT] ADF successfully converted to storage format');
    return result.value; // The converted storage format HTML
  } catch (error) {
    console.error('[INJECT] Error converting ADF:', error);
    return null;
  }
}

// Helper function to render excerpt content with variable substitution
async function renderExcerptContent(excerpt, variableValues = {}) {
  let content = excerpt.content;

  // Check if content is ADF JSON format
  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  if (isAdf) {
    console.log('[INJECT] Content is in ADF format, attempting conversion to storage format');

    // Convert ADF to storage format
    const storageContent = await convertAdfToStorage(content);

    if (!storageContent) {
      console.error('[INJECT] Failed to convert ADF to storage format');
      return `<p><strong>⚠️ ADF Conversion Failed</strong></p><p>Could not convert ADF content to storage format. Check logs for details.</p>`;
    }

    content = storageContent;
    console.log('[INJECT] Using converted storage format content');
  }

  // Handle plain text/string content
  if (typeof content !== 'string') {
    console.log('[INJECT] Warning: Content is not a string and not ADF format');
    content = String(content || '');
  }

  // Substitute variables
  if (excerpt.variables && Array.isArray(excerpt.variables)) {
    excerpt.variables.forEach(variable => {
      const value = variableValues[variable.name] || `{{${variable.name}}}`;
      const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
      content = content.replace(regex, value);
    });
  }

  return content;
}

/**
 * Inject rendered excerpt content for a specific Include macro
 */
export async function injectIncludeContent(req) {
  console.log('[INJECT] Injection requested');

  try {
    const { pageId, excerptId, variableValues, localId } = req.payload;

    if (!pageId || !excerptId || !localId) {
      return {
        success: false,
        error: 'Missing required parameters: pageId, excerptId, and localId are required'
      };
    }

    console.log(`[INJECT] Injecting excerptId ${excerptId} on page ${pageId} for macro ${localId}`);

    // Step 1: Get the current page content
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      console.error(`[INJECT] Failed to get page: ${pageResponse.status} - ${errorText}`);
      return {
        success: false,
        error: `Failed to get page: ${pageResponse.status}`
      };
    }

    const pageData = await pageResponse.json();
    const currentBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    console.log(`[INJECT] Got page version ${currentVersion}, body length: ${currentBody.length}`);

    // Debug: Show a sample of the page body to understand format
    const sampleLength = 2000;
    const sample = currentBody.substring(0, Math.min(sampleLength, currentBody.length));
    console.log(`[INJECT] Page body sample (first ${sampleLength} chars):`, sample);

    // Count all structured macros
    const allStructuredMacros = currentBody.match(/<ac:structured-macro[^>]*>/g) || [];
    console.log(`[INJECT] Total structured macros in page: ${allStructuredMacros.length}`);

    // Look for any smart-excerpt macros (Include OR Source)
    const smartExcerptMacros = currentBody.match(/<ac:structured-macro[^>]*ac:name="smart-excerpt-[^"]*"/g) || [];
    console.log(`[INJECT] SmartExcerpt macros found:`, smartExcerptMacros);

    // Step 2: Check if page uses new ADF format or old storage format
    const isAdfFormat = currentBody.includes('<ac:adf-extension>');
    console.log(`[INJECT] Page format: ${isAdfFormat ? 'ADF (new editor)' : 'Storage (old editor)'}`);

    let match = null;

    if (isAdfFormat) {
      // NEW EDITOR FORMAT: Search for ADF extension with matching local-id
      console.log(`[INJECT] Searching for ADF extension with local-id: ${localId}`);

      // Pattern to find the entire ADF extension node containing our local-id
      const adfPattern = new RegExp(
        `(<ac:adf-extension>.*?<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>.*?</ac:adf-extension>)`,
        'gs'
      );

      match = adfPattern.exec(currentBody);

      if (!match) {
        console.log(`[INJECT] Local-id ${localId} not found. Searching by excerpt-id...`);

        // Fallback: Search by excerpt-id
        const excerptIdPattern = new RegExp(
          `(<ac:adf-extension>.*?<ac:adf-parameter key="excerpt-id">${excerptId}</ac:adf-parameter>.*?</ac:adf-extension>)`,
          'gs'
        );

        match = excerptIdPattern.exec(currentBody);

        if (match) {
          console.log(`[INJECT] Found ADF extension by excerpt-id!`);
        }
      } else {
        console.log(`[INJECT] Found ADF extension by local-id at position ${match.index}`);
      }

    } else {
      // OLD EDITOR FORMAT: Use structured-macro search
      console.log(`[INJECT] Searching for structured-macro with macro-id: ${localId}`);

      const includeMacroPattern = new RegExp(
        `(<ac:structured-macro[^>]*ac:name="smart-excerpt-include"[^>]*ac:macro-id="${localId}"[^>]*>.*?</ac:structured-macro>)`,
        'gs'
      );

      match = includeMacroPattern.exec(currentBody);

      if (!match) {
        console.log(`[INJECT] Macro-id ${localId} not found. Searching by excerptId...`);

        const paramPattern = new RegExp(
          `(<ac:structured-macro[^>]*ac:name="smart-excerpt-include"[^>]*>.*?<ac:parameter ac:name="excerptId">${excerptId}</ac:parameter>.*?</ac:structured-macro>)`,
          'gs'
        );

        match = paramPattern.exec(currentBody);

        if (match) {
          console.log(`[INJECT] Found structured-macro by excerptId!`);
        }
      }
    }

    if (!match) {
      console.error(`[INJECT] No Include macro found with localId ${localId} or excerptId ${excerptId}`);
      return {
        success: false,
        error: `Include macro not found in page storage. Format: ${isAdfFormat ? 'ADF' : 'Storage'}`
      };
    }

    console.log(`[INJECT] Found Include macro at position ${match.index}`);

    // Step 3: Load the excerpt
    const excerpt = await getExcerpt(excerptId);
    if (!excerpt) {
      console.error(`[INJECT] Excerpt ${excerptId} not found`);
      return {
        success: false,
        error: `Excerpt not found: ${excerptId}`
      };
    }

    console.log(`[INJECT] Loaded excerpt "${excerpt.name}"`);

    // Step 4: Render content with variable substitution
    const renderedContent = await renderExcerptContent(excerpt, variableValues || {});

    // Create injected content with simple markers
    // Use a unique marker ID based on localId so each macro instance has its own injection
    const markerStart = `<!-- SMARTEXCERPT-START-${localId} -->`;
    const markerEnd = `<!-- SMARTEXCERPT-END-${localId} -->`;
    const injectedContent = `${markerStart}\n${renderedContent}\n${markerEnd}`;

    console.log(`[INJECT] Creating injection for localId: ${localId}`);
    console.log(`[INJECT] Rendered content length: ${renderedContent.length} chars`);
    console.log(`[INJECT] Injected content sample (first 300 chars):`, injectedContent.substring(0, 300));

    // Step 5: Check if injected content already exists for this specific macro (by localId)
    const afterMacroPos = match.index + match[0].length;

    // CRITICAL: Search for the marker in what Confluence actually has stored, not what we think we saved
    // Confluence might encode the comment, so look for the pattern flexibly
    const markerPattern = new RegExp(
      `<!--\\s*SMARTEXCERPT-START-${escapeRegex(localId)}\\s*-->[\\s\\S]*?<!--\\s*SMARTEXCERPT-END-${escapeRegex(localId)}\\s*-->`,
      'g'
    );

    console.log(`[INJECT] Searching for existing injection markers in full page body...`);
    console.log(`[INJECT] Page body length: ${currentBody.length} chars`);

    // Test if the marker exists anywhere in the body
    const testMatch = markerPattern.exec(currentBody);
    const hasExisting = testMatch !== null;

    console.log(`[INJECT] Found existing injection: ${hasExisting}`);
    if (hasExisting) {
      console.log(`[INJECT] Existing injection found at position: ${testMatch.index}`);
      console.log(`[INJECT] Existing injection sample (first 200 chars):`, testMatch[0].substring(0, 200));
    }

    let modifiedBody;
    if (hasExisting) {
      console.log(`[INJECT] Replacing existing injection`);
      // Replace the existing injection anywhere in the document
      markerPattern.lastIndex = 0; // Reset regex
      modifiedBody = currentBody.replace(markerPattern, injectedContent);

      // Verify replacement happened
      const replacementHappened = modifiedBody !== currentBody;
      console.log(`[INJECT] Replacement occurred: ${replacementHappened}`);

      if (!replacementHappened) {
        console.error(`[INJECT] WARNING: Replacement failed even though marker was found!`);
      }
    } else {
      console.log(`[INJECT] Inserting new injected content after macro`);
      // Insert after the macro
      modifiedBody =
        currentBody.substring(0, afterMacroPos) +
        '\n' + injectedContent + '\n' +
        currentBody.substring(afterMacroPos);
    }

    // Step 6: Update the page with injected content
    console.log(`[INJECT] Updating page with injected content`);

    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: pageId,
          status: 'current',
          title: pageData.title,
          body: {
            representation: 'storage',
            value: modifiedBody
          },
          version: {
            number: currentVersion + 1,
            message: `SmartExcerpt: Injected "${excerpt.name}"`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[INJECT] Failed to update page: ${updateResponse.status} - ${errorText}`);
      return {
        success: false,
        error: `Failed to update page: ${updateResponse.status}`
      };
    }

    const updatedPage = await updateResponse.json();
    console.log(`[INJECT] Successfully injected! New version: ${updatedPage.version.number}`);

    // INVESTIGATION: Fetch the page again to see how Confluence transformed our injection
    console.log(`[INJECT] === INVESTIGATION: Fetching page again to check storage transformation ===`);
    const verifyResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (verifyResponse.ok) {
      const verifyData = await verifyResponse.json();
      const savedBody = verifyData.body.storage.value;

      // Look for our injection in the saved content
      const injectionIdPattern = new RegExp(`smartexcerpt-injection-${localId}`, 'i');
      const hasInjectionId = injectionIdPattern.test(savedBody);

      console.log(`[INJECT] Injection ID present in saved content: ${hasInjectionId}`);

      // Find and log what's around our injection ID (if it exists)
      if (hasInjectionId) {
        const match = savedBody.match(new RegExp(`.{0,200}smartexcerpt-injection-${localId}.{0,200}`, 'i'));
        if (match) {
          console.log(`[INJECT] Content around injection ID (±200 chars):`, match[0]);
        }
      }

      // Look for any ac:placeholder tags
      const placeholderMatches = savedBody.match(/<ac:placeholder[^>]*>[\s\S]{0,100}/gi);
      if (placeholderMatches && placeholderMatches.length > 0) {
        console.log(`[INJECT] Found ${placeholderMatches.length} ac:placeholder tag(s) in saved content:`);
        placeholderMatches.forEach((pm, idx) => {
          console.log(`[INJECT]   Placeholder ${idx + 1}:`, pm.substring(0, 200));
        });
      } else {
        console.log(`[INJECT] NO ac:placeholder tags found in saved content`);
      }

      // Look for what was injected vs what was saved - log sample around where injection should be
      const macroInSaved = savedBody.indexOf(`local-id">${localId}</ac:adf-parameter>`);
      if (macroInSaved !== -1) {
        const afterMacroInSaved = savedBody.substring(macroInSaved + 200, macroInSaved + 700);
        console.log(`[INJECT] Content after macro in saved page (500 chars):`, afterMacroInSaved);
      }
    }

    return {
      success: true,
      message: `Content injected successfully! Refresh the page to see the native content.`,
      pageVersion: updatedPage.version.number
    };

  } catch (error) {
    console.error('[INJECT] Error:', error);
    console.error('[INJECT] Stack trace:', error.stack);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}
