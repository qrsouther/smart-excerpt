/**
 * Page Published Handler
 *
 * This function is triggered when a Confluence page is published.
 * It scans the page for Blueprint App Include macros and automatically injects
 * their rendered content into the page storage as native Confluence content.
 */

import api, { route } from '@forge/api';
import { getExcerpt } from './storage.js';

console.log('[PAGE-PUBLISH-MODULE] Module loaded! Handler will be registered for page updates.');

// Helper function to escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to parse macro parameters from XML
function parseMacroParameters(macroXml) {
  const params = {};

  // Extract ac:parameter elements
  const paramPattern = /<ac:parameter\s+ac:name="([^"]+)">([^<]*)<\/ac:parameter>/g;
  let match;

  while ((match = paramPattern.exec(macroXml)) !== null) {
    const paramName = match[1];
    const paramValue = match[2];

    // Try to parse as JSON for complex values (like variableValues object)
    try {
      params[paramName] = JSON.parse(paramValue);
    } catch (e) {
      params[paramName] = paramValue;
    }
  }

  return params;
}

// Helper function to render excerpt content with variable substitution
function renderExcerptContent(excerpt, variableValues = {}) {
  let content = excerpt.content || '';

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

export async function handler(event, context) {
  console.log('='.repeat(80));
  console.log('[PAGE-PUBLISH] TRIGGER FIRED! Event received');
  console.log('[PAGE-PUBLISH] Event type:', event?.eventType);
  console.log('[PAGE-PUBLISH] Full event:', JSON.stringify(event, null, 2));
  console.log('='.repeat(80));

  try {
    const { content, updateTrigger } = event;
    const pageId = content?.id;
    const pageTitle = content?.title;

    console.log(`[PAGE-PUBLISH] Page "${pageTitle}" (${pageId}) was updated. Trigger: ${updateTrigger}`);

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
      console.error(`[PAGE-PUBLISH] Failed to get page: ${pageResponse.status} - ${errorText}`);
      return;
    }

    const pageData = await pageResponse.json();
    const currentBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    console.log(`[PAGE-PUBLISH] Got page version ${currentVersion}, body length: ${currentBody.length}`);

    // Step 2: Find all Blueprint App Include macros in the page
    const includeMacroPattern = /<ac:structured-macro[^>]*ac:name="smart-excerpt-include"[^>]*ac:macro-id="([^"]+)"[^>]*>(.*?)<\/ac:structured-macro>/gs;
    const macros = [];
    let match;

    while ((match = includeMacroPattern.exec(currentBody)) !== null) {
      const macroId = match[1];
      const macroBody = match[2];
      const params = parseMacroParameters(match[0]);

      console.log(`[PAGE-PUBLISH] Found Include macro ${macroId}`, params);

      macros.push({
        fullMatch: match[0],
        macroId,
        macroBody,
        params,
        index: match.index
      });
    }

    console.log(`[PAGE-PUBLISH] Found ${macros.length} Include macro(s) in page`);

    if (macros.length === 0) {
      console.log(`[PAGE-PUBLISH] No Include macros found, skipping injection`);
      return;
    }

    // Step 3: Inject content for each macro
    let modifiedBody = currentBody;
    let injectionCount = 0;

    for (const macro of macros.reverse()) { // Reverse to maintain indices
      console.log(`[PAGE-PUBLISH] Processing Include macro ${macro.macroId}`);

      const excerptId = macro.params.excerptId;
      if (!excerptId) {
        console.log(`[PAGE-PUBLISH] Macro ${macro.macroId} has no excerptId configured, skipping`);
        continue;
      }

      // Load the excerpt
      const excerpt = await getExcerpt(excerptId);
      if (!excerpt) {
        console.error(`[PAGE-PUBLISH] Excerpt ${excerptId} not found for macro ${macro.macroId}`);
        continue;
      }

      console.log(`[PAGE-PUBLISH] Loaded excerpt "${excerpt.name}" for macro ${macro.macroId}`);

      // Render content with variable substitution
      const variableValues = macro.params.variableValues || {};
      const renderedContent = renderExcerptContent(excerpt, variableValues);

      // Create injected content (native Confluence storage format)
      const injectedContent = `
<!-- INJECTED BY BLUEPRINT APP -->
${renderedContent}
<!-- END BLUEPRINT APP INJECTION -->
`;

      // Check if injected content already exists for this macro
      const injectedPattern = new RegExp(
        `<!-- INJECTED BY BLUEPRINT APP -->.*?<!-- END BLUEPRINT APP INJECTION -->`,
        'gs'
      );

      // Find injection immediately after this specific macro
      const afterMacroPos = macro.index + macro.fullMatch.length;
      const nextMacroPos = macros.find(m => m.index > macro.index)?.index || modifiedBody.length;
      const afterMacroSection = modifiedBody.substring(afterMacroPos, nextMacroPos);

      if (injectedPattern.test(afterMacroSection)) {
        console.log(`[PAGE-PUBLISH] Updating existing injected content for macro ${macro.macroId}`);
        // Replace the first occurrence after this macro
        const beforeMacro = modifiedBody.substring(0, afterMacroPos);
        const afterSection = modifiedBody.substring(afterMacroPos);
        const updatedAfterSection = afterSection.replace(injectedPattern, injectedContent);
        modifiedBody = beforeMacro + updatedAfterSection;
      } else {
        console.log(`[PAGE-PUBLISH] Inserting new injected content for macro ${macro.macroId}`);
        // Insert after the macro
        modifiedBody =
          modifiedBody.substring(0, afterMacroPos) +
          '\n' + injectedContent + '\n' +
          modifiedBody.substring(afterMacroPos);
      }

      injectionCount++;
    }

    if (injectionCount === 0) {
      console.log(`[PAGE-PUBLISH] No injections performed`);
      return;
    }

    // Step 4: Update the page with injected content
    console.log(`[PAGE-PUBLISH] Updating page with ${injectionCount} injection(s)`);

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
            message: 'Blueprint App: Auto-injected excerpt content'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[PAGE-PUBLISH] Failed to update page: ${updateResponse.status} - ${errorText}`);
      return;
    }

    const updatedPage = await updateResponse.json();
    console.log(`[PAGE-PUBLISH] Successfully injected ${injectionCount} excerpt(s)! New version: ${updatedPage.version.number}`);

  } catch (error) {
    console.error('[PAGE-PUBLISH] Error:', error);
    console.error('[PAGE-PUBLISH] Stack trace:', error.stack);
  }
}
