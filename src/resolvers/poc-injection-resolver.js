/**
 * POC: Native Content Injection Resolver
 *
 * This proof-of-concept tests the approach of injecting rendered content
 * directly into the Confluence page body, bypassing Forge's iframe rendering.
 *
 * Flow:
 * 1. User configures Include macro (which excerpt, variables, etc.)
 * 2. On save: Render content and inject into page via REST API
 * 3. On view: Include macro displays nothing; users see native Confluence content
 *
 * Performance gain: No iframes, no invoke() calls, instant visibility
 */

import api, { route } from '@forge/api';

/**
 * POC: Inject "Hello World" content into page after Include macro
 *
 * This is a minimal test of the GET → modify → PUT workflow:
 * - Get page content via REST API
 * - Find the Include macro by its localId/macro-id
 * - Insert content immediately after it
 * - Put the updated page back
 */
export async function injectContentPOC(req) {
  try {
    const { pageId, macroId, localId, content } = req.payload;

    console.log(`[POC-INJECT] Starting injection for pageId=${pageId}, macroId=${macroId}`);

    // Step 1: Get current page content with storage format
    // Using v1 API with status=draft to access draft content
    console.log(`[POC-INJECT] Using v1 API with draft status to access draft content`);
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${pageId}?expand=body.storage,version&status=draft`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      throw new Error(`Failed to get page: ${pageResponse.status} - ${errorText}`);
    }

    const pageData = await pageResponse.json();
    const currentVersion = pageData.version.number;
    const currentBody = pageData.body.storage.value;

    console.log(`[POC-INJECT] Page status: ${pageData.status || 'current'}`);

    console.log(`[POC-INJECT] Got page version ${currentVersion}, body length: ${currentBody.length}`);

    // Step 2: Debug - Find ALL POC macros in the page
    const allPocMacrosPattern = /<ac:structured-macro[^>]*ac:name="smart-excerpt-include-poc"[^>]*>/g;
    const allMatches = currentBody.match(allPocMacrosPattern);
    console.log(`[POC-INJECT] Found ${allMatches ? allMatches.length : 0} POC macro(s) in page storage`);
    if (allMatches) {
      allMatches.forEach((match, idx) => {
        console.log(`[POC-INJECT] POC Macro ${idx + 1}:`, match);
      });
    }

    // Step 2: Find the Include macro in storage format
    // Look for: <ac:structured-macro ac:name="smart-excerpt-include-poc" ac:macro-id="MACRO_ID">
    // Note: Order of attributes might vary, so we need flexible matching
    const macroPattern = new RegExp(
      `(<ac:structured-macro[^>]*ac:name="smart-excerpt-include-poc"[^>]*ac:macro-id="${macroId}"[^>]*>.*?</ac:structured-macro>)`,
      'gs'
    );

    let match = macroPattern.exec(currentBody);

    if (!match) {
      console.log(`[POC-INJECT] Macro with id ${macroId} not found in page storage`);

      // Try to find if macro exists with different attribute order
      const reversedPattern = new RegExp(
        `(<ac:structured-macro[^>]*ac:macro-id="${macroId}"[^>]*ac:name="smart-excerpt-include-poc"[^>]*>.*?</ac:structured-macro>)`,
        'gs'
      );
      const reversedMatch = reversedPattern.exec(currentBody);

      if (reversedMatch) {
        console.log(`[POC-INJECT] Found macro with reversed attribute order!`);
        // Use this match instead
        match = reversedMatch;
      } else {
        throw new Error(
          `Could not find Include macro with id ${macroId} in page storage. ` +
          `Make sure you have saved/published the page at least once before using the Inject feature. ` +
          `The macro must exist in the page's saved content before injection can work.`
        );
      }
    }

    console.log(`[POC-INJECT] Found macro at position ${match.index}`);

    // Step 3: Create injected content wrapper
    // Use an Expand macro as a container to make it visible and identifiable
    const injectedContent = `
<!-- INJECTED BY SMARTEXCERPT POC -->
<ac:structured-macro ac:name="expand" ac:schema-version="1" ac:macro-id="injected-${macroId}">
  <ac:parameter ac:name="title">📄 Injected Content (POC)</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Hello World!</strong></p>
    <p>This content was injected directly into the page via REST API.</p>
    <p>Content from payload: ${content || 'None provided'}</p>
    <p><em>Generated at: ${new Date().toISOString()}</em></p>
  </ac:rich-text-body>
</ac:structured-macro>
<!-- END INJECTED CONTENT -->
`;

    // Step 4: Check if injected content already exists (update case)
    const injectedPattern = new RegExp(
      `<!-- INJECTED BY SMARTEXCERPT POC -->.*?<!-- END INJECTED CONTENT -->`,
      'gs'
    );

    let newBody;
    if (injectedPattern.test(currentBody)) {
      console.log(`[POC-INJECT] Updating existing injected content`);
      // Replace existing injected content
      newBody = currentBody.replace(injectedPattern, injectedContent);
    } else {
      console.log(`[POC-INJECT] Inserting new injected content`);
      // Insert after the macro
      const insertPosition = match.index + match[0].length;
      newBody =
        currentBody.substring(0, insertPosition) +
        '\n' + injectedContent + '\n' +
        currentBody.substring(insertPosition);
    }

    // Step 5: Update the page using v1 API with draft status
    console.log(`[POC-INJECT] Updating page with v1 API (draft status)`);
    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${pageId}?status=draft`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: pageId,
          type: 'page',
          title: pageData.title,
          body: {
            storage: {
              value: newBody,
              representation: 'storage'
            }
          },
          version: {
            number: currentVersion + 1,
            message: 'SmartExcerpt POC: Content injection via native rendering'
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    const updatedPage = await updateResponse.json();
    console.log(`[POC-INJECT] Successfully updated page to version ${updatedPage.version.number}`);

    return {
      success: true,
      message: 'Content injected successfully',
      pageVersion: updatedPage.version.number,
      injectedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('[POC-INJECT] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
