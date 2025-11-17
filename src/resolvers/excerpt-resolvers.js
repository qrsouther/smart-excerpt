/**
 * Excerpt CRUD Resolver Functions
 *
 * This module contains all excerpt create, read, update, and delete operations.
 * These are the core business logic resolvers for managing excerpt entities.
 *
 * Extracted during Phase 3 of index.js modularization.
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from '../utils.js';
import { detectVariables, detectToggles } from '../utils/detection-utils.js';
import { updateExcerptIndex } from '../utils/storage-utils.js';
import { calculateContentHash } from '../utils/hash-utils.js';
import { saveVersion } from '../utils/version-manager.js';

/**
 * Save excerpt (create or update)
 */
export async function saveExcerpt(req) {
  // DEBUG: Log the entire payload to see what we receive
  console.log('[saveExcerpt] RAW PAYLOAD:', JSON.stringify(req.payload, null, 2));
  console.log('[saveExcerpt] documentationLinks from payload:', req.payload.documentationLinks);
  console.log('[saveExcerpt] documentationLinks type:', typeof req.payload.documentationLinks);
  console.log('[saveExcerpt] documentationLinks is array?:', Array.isArray(req.payload.documentationLinks));

  const { excerptName, category, content, excerptId, variableMetadata, toggleMetadata, documentationLinks, sourcePageId, sourcePageTitle, sourceSpaceKey, sourceLocalId } = req.payload;

  console.log('[saveExcerpt] After destructuring, documentationLinks:', documentationLinks);

  // Extract page information from backend context (more reliable than frontend)
  const pageId = sourcePageId || req.context?.extension?.content?.id;
  const spaceKey = sourceSpaceKey || req.context?.extension?.space?.key;

  // Generate or reuse excerpt ID
  const id = excerptId || generateUUID();

  // Detect variables in content
  const detectedVariables = detectVariables(content);

  // Merge detected variables with provided metadata
  const variables = detectedVariables.map(v => {
    const metadata = variableMetadata?.find(m => m.name === v.name);
    return {
      name: v.name,
      description: metadata?.description || '',
      example: metadata?.example || '',
      required: metadata?.required || false
    };
  });

  // Detect toggles in content
  const detectedToggles = detectToggles(content);

  // Merge detected toggles with provided metadata
  const toggles = detectedToggles.map(t => {
    const metadata = toggleMetadata?.find(m => m.name === t.name);
    return {
      name: t.name,
      description: metadata?.description || ''
    };
  });

  // Get existing excerpt to preserve createdAt and existing source page if not provided
  const existingExcerpt = excerptId ? await storage.get(`excerpt:${id}`) : null;

  // Create excerpt object (without hash first)
  const excerpt = {
    id: id,
    name: excerptName,
    category: category || 'General',
    content: content,
    variables: variables,
    toggles: toggles,
    documentationLinks: documentationLinks || [],
    sourcePageId: pageId || existingExcerpt?.sourcePageId,
    sourceSpaceKey: spaceKey || existingExcerpt?.sourceSpaceKey,
    sourceLocalId: sourceLocalId || existingExcerpt?.sourceLocalId,
    createdAt: existingExcerpt?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Calculate and add content hash
  excerpt.contentHash = calculateContentHash(excerpt);

  // DEBUG: Log what we're saving
  console.log('[saveExcerpt] About to save excerpt with documentationLinks:', excerpt.documentationLinks);
  console.log('[saveExcerpt] Full excerpt object before storage.set:', JSON.stringify(excerpt, null, 2));
  console.log('[saveExcerpt] Excerpt object keys:', Object.keys(excerpt));

  // Phase 3: Create version snapshot before modification (v7.17.0)
  if (existingExcerpt) {
    const versionResult = await saveVersion(
      storage,
      `excerpt:${id}`,
      existingExcerpt,
      {
        changeType: 'UPDATE',
        changedBy: 'saveExcerpt',
        userAccountId: req.context?.accountId,
        excerptName: existingExcerpt.name
      }
    );
    if (versionResult.success) {
      console.log('[saveExcerpt] ✅ Version snapshot created:', versionResult.versionId);
    } else if (versionResult.skipped) {
      console.log('[saveExcerpt] ⏭️  Version snapshot skipped (content unchanged)');
    } else {
      console.warn('[saveExcerpt] ⚠️  Version snapshot failed:', versionResult.error);
    }
  }

  await storage.set(`excerpt:${id}`, excerpt);

  // DEBUG: Immediately read it back to verify it was saved
  const verifyExcerpt = await storage.get(`excerpt:${id}`);
  console.log('[saveExcerpt] Verification - read back from storage:', {
    hasDocumentationLinks: !!verifyExcerpt.documentationLinks,
    documentationLinksCount: verifyExcerpt.documentationLinks?.length || 0,
    documentationLinks: verifyExcerpt.documentationLinks,
    allKeys: Object.keys(verifyExcerpt)
  });

  // Update index
  await updateExcerptIndex(excerpt);

  // Return saved excerpt data
  return {
    excerptId: id,
    excerptName: excerptName,
    category: category,
    content: content,
    variables: variables,
    toggles: toggles,
    documentationLinks: excerpt.documentationLinks || []
  };
}

/**
 * Update excerpt content only (called automatically when Source macro body changes)
 */
export async function updateExcerptContent(req) {
  try {
    const { excerptId, content } = req.payload;

    // Load existing excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      console.error('Excerpt not found:', excerptId);
      return { success: false, error: 'Excerpt not found' };
    }

    // Update content and re-detect variables/toggles
    const detectedVariables = detectVariables(content);
    const detectedToggles = detectToggles(content);

    // Preserve existing variable metadata, but update the list
    const variables = detectedVariables.map(v => {
      const existing = excerpt.variables?.find(ev => ev.name === v.name);
      return existing || {
        name: v.name,
        description: '',
        example: '',
        multiline: false
      };
    });

    // Preserve existing toggle metadata, but update the list
    const toggles = detectedToggles.map(t => {
      const existing = excerpt.toggles?.find(et => et.name === t.name);
      return existing || {
        name: t.name,
        description: ''
      };
    });

    // Build updated excerpt object (without updatedAt yet)
    const updatedExcerpt = {
      ...excerpt,
      content: content,
      variables: variables,
      toggles: toggles
    };

    // Calculate what the new content hash would be
    const newContentHash = calculateContentHash(updatedExcerpt);

    // Compare to existing hash - if unchanged, skip the update
    if (excerpt.contentHash === newContentHash) {
      return { success: true, unchanged: true };
    }

    // Content actually changed - update the excerpt
    updatedExcerpt.contentHash = newContentHash;
    updatedExcerpt.updatedAt = new Date().toISOString();

    // Phase 3: Create version snapshot before modification (v7.17.0)
    const versionResult = await saveVersion(
      storage,
      `excerpt:${excerptId}`,
      excerpt, // Save the OLD version before overwriting
      {
        changeType: 'UPDATE',
        changedBy: 'updateExcerptContent',
        userAccountId: req.context?.accountId,
        excerptName: excerpt.name
      }
    );
    if (versionResult.success) {
      console.log('[updateExcerptContent] ✅ Version snapshot created:', versionResult.versionId);
    } else {
      console.warn('[updateExcerptContent] ⚠️  Version snapshot failed:', versionResult.error);
    }

    await storage.set(`excerpt:${excerptId}`, updatedExcerpt);

    // Update index
    await updateExcerptIndex(updatedExcerpt);

    return { success: true, unchanged: false };
  } catch (error) {
    console.error('Error updating excerpt content:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get all excerpts with full details (for admin page)
 */
export async function getAllExcerpts() {
  try {
    const index = await storage.get('excerpt-index') || { excerpts: [] };

    // Load full details for each excerpt
    const excerptPromises = index.excerpts.map(async (indexEntry) => {
      const fullExcerpt = await storage.get(`excerpt:${indexEntry.id}`);
      return fullExcerpt;
    });

    const excerpts = await Promise.all(excerptPromises);

    return {
      success: true,
      excerpts: excerpts.filter(e => e !== null)
    };
  } catch (error) {
    console.error('Error getting all excerpts:', error);
    return {
      success: false,
      error: error.message,
      excerpts: []
    };
  }
}

/**
 * Delete an excerpt
 */
export async function deleteExcerpt(req) {
  try {
    const { excerptId } = req.payload;

    // Delete the excerpt
    await storage.delete(`excerpt:${excerptId}`);

    // Update the index
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    index.excerpts = index.excerpts.filter(e => e.id !== excerptId);
    await storage.set('excerpt-index', index);

    return {
      success: true
    };
  } catch (error) {
    console.error('Error deleting excerpt:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update excerpt metadata (name, category)
 */
export async function updateExcerptMetadata(req) {
  try {
    const { excerptId, name, category } = req.payload;

    // Load the existing excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return {
        success: false,
        error: 'Excerpt not found'
      };
    }

    // Update the metadata
    excerpt.name = name;
    excerpt.category = category;
    excerpt.updatedAt = new Date().toISOString();

    // Save the updated excerpt
    await storage.set(`excerpt:${excerptId}`, excerpt);

    // Update the index
    await updateExcerptIndex(excerpt);

    return {
      success: true
    };
  } catch (error) {
    console.error('Error updating excerpt metadata:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mass update excerpts (e.g., change category for multiple excerpts)
 */
export async function massUpdateExcerpts(req) {
  try {
    const { excerptIds, category } = req.payload;

    const updatePromises = excerptIds.map(async (excerptId) => {
      const excerpt = await storage.get(`excerpt:${excerptId}`);
      if (excerpt) {
        excerpt.category = category;
        excerpt.updatedAt = new Date().toISOString();
        await storage.set(`excerpt:${excerptId}`, excerpt);
        await updateExcerptIndex(excerpt);
      }
    });

    await Promise.all(updatePromises);

    return {
      success: true
    };
  } catch (error) {
    console.error('Error in mass update:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update Source macro body content on the page
 */
export async function updateSourceMacroBody(req) {
  try {
    const { pageId, excerptId, localId, content } = req.payload;

    if (!pageId || !excerptId || !content) {
      return {
        success: false,
        error: 'Missing required parameters: pageId, excerptId, and content are required'
      };
    }

    console.log(`[UPDATE-MACRO-BODY] Updating macro body for excerptId ${excerptId} on page ${pageId}`);

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
      console.error(`[UPDATE-MACRO-BODY] Failed to get page: ${pageResponse.status} - ${errorText}`);
      return {
        success: false,
        error: `Failed to get page: ${pageResponse.status}`
      };
    }

    const pageData = await pageResponse.json();
    const currentBody = pageData.body.storage.value;
    const currentVersion = pageData.version.number;

    console.log(`[UPDATE-MACRO-BODY] Got page version ${currentVersion}, body length: ${currentBody.length}`);

    // Step 2: Find the Source macro by excerptId
    // The macro structure: <ac:adf-extension><ac:adf-node type="bodied-extension">...<ac:adf-parameter key="excerpt-id">EXCERPT_ID</ac:adf-parameter>...<ac:adf-content>CURRENT_CONTENT</ac:adf-content>...</ac:adf-node></ac:adf-extension>
    // If localId is provided, use it for more precise matching
    let macroPattern;
    if (localId) {
      // Match by both excerpt-id and local-id for precision
      macroPattern = new RegExp(
        `(<ac:adf-extension><ac:adf-node type="bodied-extension"[^>]*>.*?<ac:adf-parameter key="excerpt-id">${excerptId}</ac:adf-parameter>.*?<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>.*?<ac:adf-content>)([\\s\\S]*?)(</ac:adf-content>.*?</ac:adf-node></ac:adf-extension>)`,
        'gs'
      );
    } else {
      // Match by excerpt-id only
      macroPattern = new RegExp(
        `(<ac:adf-extension><ac:adf-node type="bodied-extension"[^>]*>.*?<ac:adf-parameter key="excerpt-id">${excerptId}</ac:adf-parameter>.*?<ac:adf-content>)([\\s\\S]*?)(</ac:adf-content>.*?</ac:adf-node></ac:adf-extension>)`,
        'gs'
      );
    }

    const match = macroPattern.exec(currentBody);

    if (!match) {
      console.error(`[UPDATE-MACRO-BODY] Macro not found for excerptId ${excerptId}${localId ? ` and localId ${localId}` : ''}`);
      return {
        success: false,
        error: `Source macro not found on page`
      };
    }

    // Step 3: Replace the content within <ac:adf-content> tags
    // The content is already in ADF format (JSON), so we need to insert it as a JSON string
    // JSON.stringify already escapes quotes properly, we just need to escape XML special chars
    const contentJson = JSON.stringify(content);
    // Escape XML special characters: & < > (quotes are already escaped by JSON.stringify)
    const escapedContent = contentJson
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    const modifiedBody = currentBody.replace(
      macroPattern,
      `$1${escapedContent}$3`
    );

    // Step 4: Update the page
    console.log(`[UPDATE-MACRO-BODY] Updating page with new macro body content`);

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
            message: `Blueprint App: Updated Source macro content`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[UPDATE-MACRO-BODY] Failed to update page: ${updateResponse.status} - ${errorText}`);
      return {
        success: false,
        error: `Failed to update page: ${updateResponse.status}`
      };
    }

    const updatedPage = await updateResponse.json();
    console.log(`[UPDATE-MACRO-BODY] Successfully updated macro body! New version: ${updatedPage.version.number}`);

    return {
      success: true,
      pageVersion: updatedPage.version.number,
      updatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('[UPDATE-MACRO-BODY] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
