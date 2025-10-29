import Resolver from '@forge/resolver';
import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from './utils';

const resolver = new Resolver();

// Extract text from ADF document
function extractTextFromAdf(adfNode) {
  if (!adfNode) return '';

  let text = '';

  // If it's a text node, return its text
  if (adfNode.text) {
    text += adfNode.text;
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    for (const child of adfNode.content) {
      text += extractTextFromAdf(child);
    }
  }

  return text;
}

// Find the heading that appears directly before a macro with a specific localId
function findHeadingBeforeMacro(adfDoc, targetLocalId) {
  if (!adfDoc || !adfDoc.content) return null;

  let lastHeading = null;

  // Recursively traverse the ADF structure
  function traverse(nodes) {
    for (const node of nodes) {
      // Track the most recent heading
      if (node.type === 'heading' && node.content) {
        lastHeading = extractTextFromAdf(node);
      }

      // Check if this is the target macro (extension or bodiedExtension)
      if ((node.type === 'extension' || node.type === 'bodiedExtension') &&
          node.attrs?.localId === targetLocalId) {
        return lastHeading;
      }

      // Recursively check children
      if (node.content && Array.isArray(node.content)) {
        const result = traverse(node.content);
        if (result !== null && result !== undefined) {
          return result;
        }
      }
    }
    return null;
  }

  return traverse(adfDoc.content);
}

// Detect variables in content ({{variable}} syntax)
// Supports both plain text and ADF format
// Note: Excludes toggle markers from variable detection
function detectVariables(content) {
  const variables = [];
  const variableRegex = /\{\{([^}]+)\}\}/g;
  let match;

  // Extract text from content (handle both string and ADF object)
  let textContent = '';
  if (typeof content === 'string') {
    textContent = content;
  } else if (content && typeof content === 'object') {
    // ADF format
    textContent = extractTextFromAdf(content);
  }

  while ((match = variableRegex.exec(textContent)) !== null) {
    const varName = match[1].trim();
    // Skip toggle markers (they start with "toggle:" or "/toggle:")
    if (varName.startsWith('toggle:') || varName.startsWith('/toggle:')) {
      continue;
    }
    if (!variables.find(v => v.name === varName)) {
      variables.push({
        name: varName,
        description: '',
        example: ''
      });
    }
  }

  return variables;
}

// Detect toggles in content ({{toggle:name}}...{{/toggle:name}} syntax)
// Supports both plain text and ADF format
function detectToggles(content) {
  const toggles = [];
  const toggleRegex = /\{\{toggle:([^}]+)\}\}/g;
  let match;

  // Extract text from content (handle both string and ADF object)
  let textContent = '';
  if (typeof content === 'string') {
    textContent = content;
  } else if (content && typeof content === 'object') {
    // ADF format
    textContent = extractTextFromAdf(content);
  }

  while ((match = toggleRegex.exec(textContent)) !== null) {
    const toggleName = match[1].trim();
    if (!toggles.find(t => t.name === toggleName)) {
      toggles.push({
        name: toggleName,
        description: ''
      });
    }
  }

  return toggles;
}

// Update excerpt index
async function updateExcerptIndex(excerpt) {
  const index = await storage.get('excerpt-index') || { excerpts: [] };

  // Remove old entry if exists
  index.excerpts = index.excerpts.filter(e => e.id !== excerpt.id);

  // Add updated entry
  index.excerpts.push({
    id: excerpt.id,
    name: excerpt.name,
    category: excerpt.category,
    updatedAt: excerpt.updatedAt
  });

  await storage.set('excerpt-index', index);
}

// Detect variables from content (for UI to call)
resolver.define('detectVariablesFromContent', async (req) => {
  try {
    const { content } = req.payload;
    const variables = detectVariables(content);
    return {
      success: true,
      variables
    };
  } catch (error) {
    console.error('Error detecting variables:', error);
    return {
      success: false,
      error: error.message,
      variables: []
    };
  }
});

// Detect toggles from content (for UI to call)
resolver.define('detectTogglesFromContent', async (req) => {
  try {
    const { content } = req.payload;
    const toggles = detectToggles(content);
    return {
      success: true,
      toggles
    };
  } catch (error) {
    console.error('Error detecting toggles:', error);
    return {
      success: false,
      error: error.message,
      toggles: []
    };
  }
});

// Save excerpt
resolver.define('saveExcerpt', async (req) => {
  const { excerptName, category, content, excerptId, variableMetadata, toggleMetadata, sourcePageId, sourcePageTitle, sourceSpaceKey, sourceLocalId } = req.payload;

  // Extract page information from backend context (more reliable than frontend)
  const pageId = sourcePageId || req.context?.extension?.content?.id;
  const spaceKey = sourceSpaceKey || req.context?.extension?.space?.key;

  console.log('Saving with page info - pageId:', pageId, 'spaceKey:', spaceKey);

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

  // Store excerpt
  const excerpt = {
    id: id,
    name: excerptName,
    category: category || 'General',
    content: content,
    variables: variables,
    toggles: toggles,
    sourcePageId: pageId || existingExcerpt?.sourcePageId,
    sourceSpaceKey: spaceKey || existingExcerpt?.sourceSpaceKey,
    sourceLocalId: sourceLocalId || existingExcerpt?.sourceLocalId,
    createdAt: existingExcerpt?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await storage.set(`excerpt:${id}`, excerpt);

  // Update index
  await updateExcerptIndex(excerpt);

  console.log('Excerpt saved successfully:', id);

  return {
    excerptId: id,
    excerptName: excerptName,
    category: category,
    content: content,
    variables: variables,
    toggles: toggles
  };
});

// Get all excerpts
resolver.define('getExcerpts', async () => {
  try {
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    console.log('getExcerpts called, returning:', index.excerpts.length, 'excerpts');
    return {
      success: true,
      excerpts: index.excerpts
    };
  } catch (error) {
    console.error('Error getting excerpts:', error);
    return {
      success: false,
      error: error.message,
      excerpts: []
    };
  }
});

// Get specific excerpt
resolver.define('getExcerpt', async (req) => {
  try {
    const excerptId = req.payload.excerptId;
    console.log('getExcerpt called for:', excerptId);

    const excerpt = await storage.get(`excerpt:${excerptId}`);
    console.log('getExcerpt - excerpt from storage:', excerpt ? 'FOUND' : 'NULL/UNDEFINED');

    if (excerpt) {
      console.log('getExcerpt - excerpt name:', excerpt.name);
      console.log('getExcerpt - excerpt category:', excerpt.category);
      console.log('getExcerpt - excerpt has content:', !!excerpt.content);

      // Log panel types to debug custom panel rendering
      if (excerpt.content && excerpt.content.content) {
        excerpt.content.content.forEach((node, i) => {
          if (node.type === 'panel') {
            console.log(`getExcerpt - Panel ${i}: type=${node.attrs?.panelType}, color=${node.attrs?.panelColor}, icon=${node.attrs?.panelIcon}`);
          }
        });
      }
    }

    return {
      success: true,
      excerpt: excerpt
    };
  } catch (error) {
    console.error('Error getting excerpt:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Update excerpt content only (called automatically when Source macro body changes)
resolver.define('updateExcerptContent', async (req) => {
  try {
    const { excerptId, content } = req.payload;

    // Log the content being saved to help debug custom attributes
    console.log('updateExcerptContent - excerptId:', excerptId);
    console.log('updateExcerptContent - content ADF:', JSON.stringify(content, null, 2));

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

    // Update excerpt with new content
    const updatedExcerpt = {
      ...excerpt,
      content: content,
      variables: variables,
      toggles: toggles,
      updatedAt: new Date().toISOString()
    };

    await storage.set(`excerpt:${excerptId}`, updatedExcerpt);

    // Update index
    await updateExcerptIndex(updatedExcerpt);

    console.log('Excerpt content auto-updated:', excerptId);
    return { success: true };
  } catch (error) {
    console.error('Error updating excerpt content:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Save variable values and toggle states for a specific macro instance
// We'll store this keyed by localId (unique ID for each macro instance)
resolver.define('saveVariableValues', async (req) => {
  try {
    const { localId, excerptId, variableValues, toggleStates, customInsertions, pageId: explicitPageId } = req.payload;

    const key = `macro-vars:${localId}`;
    const now = new Date().toISOString();
    await storage.set(key, {
      excerptId,
      variableValues,
      toggleStates: toggleStates || {},
      customInsertions: customInsertions || [],
      updatedAt: now,
      lastSynced: now  // Track when this Include instance last synced with Source
    });

    // Also update usage tracking with the latest toggle states
    // This ensures toggle states are always current in the usage data
    try {
      // Get page context - use explicit pageId if provided (from Admin page), otherwise use context
      const pageId = explicitPageId || req.context?.extension?.content?.id;
      const spaceKey = req.context?.extension?.space?.key || 'Unknown Space';

      if (pageId && excerptId && localId) {
        // Fetch page title
        let pageTitle = 'Unknown Page';
        let headingAnchor = null;

        try {
          const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`);
          const pageData = await response.json();
          pageTitle = pageData.title || 'Unknown Page';

          // Parse the ADF to find the heading above this Include macro
          if (pageData.body?.atlas_doc_format?.value) {
            const adfContent = JSON.parse(pageData.body.atlas_doc_format.value);
            headingAnchor = findHeadingBeforeMacro(adfContent, localId);
          }
        } catch (apiError) {
          console.error('Error fetching page data:', apiError);
          pageTitle = req.context?.extension?.content?.title || 'Unknown Page';
        }

        // Update usage data
        const usageKey = `usage:${excerptId}`;
        const usageData = await storage.get(usageKey) || { excerptId, references: [] };

        const existingIndex = usageData.references.findIndex(r => r.localId === localId);

        const reference = {
          localId,
          pageId,
          pageTitle,
          spaceKey,
          headingAnchor,
          toggleStates: toggleStates || {},
          variableValues: variableValues || {},
          updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
          usageData.references[existingIndex] = reference;
        } else {
          usageData.references.push(reference);
        }

        await storage.set(usageKey, usageData);
      }
    } catch (trackingError) {
      // Don't fail the save if tracking fails
      console.error('Error updating usage tracking:', trackingError);
    }

    return {
      success: true
    };
  } catch (error) {
    console.error('Error saving variable values:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Save cached rendered content for an Include instance
resolver.define('saveCachedContent', async (req) => {
  try {
    const { localId, renderedContent } = req.payload;

    const key = `macro-cache:${localId}`;
    const now = new Date().toISOString();

    await storage.set(key, {
      content: renderedContent,
      cachedAt: now
    });

    console.log(`saveCachedContent: Cached content for localId ${localId}`);

    // Also update lastSynced in macro-vars
    const varsKey = `macro-vars:${localId}`;
    const existingVars = await storage.get(varsKey) || {};
    existingVars.lastSynced = now;
    await storage.set(varsKey, existingVars);

    return { success: true, cachedAt: now };
  } catch (error) {
    console.error('Error saving cached content:', error);
    return { success: false, error: error.message };
  }
});

// Get cached rendered content for an Include instance (view mode)
resolver.define('getCachedContent', async (req) => {
  try {
    const { localId } = req.payload;

    const key = `macro-cache:${localId}`;
    const cached = await storage.get(key);

    console.log(`getCachedContent for localId ${localId}: ${cached ? 'FOUND' : 'NOT FOUND'}`);

    if (!cached) {
      return { success: false, error: 'No cached content found' };
    }

    return {
      success: true,
      content: cached.content,
      cachedAt: cached.cachedAt
    };
  } catch (error) {
    console.error('Error loading cached content:', error);
    return { success: false, error: error.message };
  }
});

// Check if Include instance has stale content (update available)
resolver.define('checkVersionStaleness', async (req) => {
  try {
    const { localId, excerptId } = req.payload;

    // Get excerpt's lastModified (updatedAt)
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Get Include instance's lastSynced
    const varsKey = `macro-vars:${localId}`;
    const macroVars = await storage.get(varsKey);

    const excerptLastModified = new Date(excerpt.updatedAt);
    const includeLastSynced = macroVars?.lastSynced ? new Date(macroVars.lastSynced) : new Date(0);

    const isStale = excerptLastModified > includeLastSynced;

    return {
      success: true,
      isStale,
      excerptLastModified: excerpt.updatedAt,
      includeLastSynced: macroVars?.lastSynced || null
    };
  } catch (error) {
    console.error('Error checking version staleness:', error);
    return { success: false, error: error.message };
  }
});

// Push updates to all Include instances of a specific excerpt (Admin function)
resolver.define('pushUpdatesToAll', async (req) => {
  try {
    const { excerptId } = req.payload;

    // Get the excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Get all usages of this excerpt
    const usageKey = `excerpt-usage:${excerptId}`;
    const usageData = await storage.get(usageKey) || { usages: [] };

    let updated = 0;
    let errors = [];

    // For each usage, regenerate and cache content
    for (const usage of usageData.usages) {
      try {
        const localId = usage.localId;

        // Get variable values for this instance
        const varsKey = `macro-vars:${localId}`;
        const macroVars = await storage.get(varsKey) || {};
        const variableValues = macroVars.variableValues || {};
        const toggleStates = macroVars.toggleStates || {};
        const customInsertions = macroVars.customInsertions || [];

        // Generate fresh content
        let freshContent = excerpt.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

        if (isAdf) {
          // Apply filters/substitutions (we'll need to import helper functions)
          // For now, just cache the base content - frontend will handle processing
          freshContent = excerpt.content;
        }

        // Cache the updated content
        const now = new Date().toISOString();
        const cacheKey = `macro-cache:${localId}`;
        await storage.set(cacheKey, {
          content: freshContent,
          cachedAt: now
        });

        // Update lastSynced timestamp
        macroVars.lastSynced = now;
        await storage.set(varsKey, macroVars);

        updated++;
      } catch (err) {
        console.error(`Error updating localId ${usage.localId}:`, err);
        errors.push({ localId: usage.localId, error: err.message });
      }
    }

    console.log(`pushUpdatesToAll: Updated ${updated} instances for excerpt ${excerptId}`);

    return {
      success: true,
      updated,
      total: usageData.usages.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('Error pushing updates to all:', error);
    return { success: false, error: error.message };
  }
});

// Push updates to a specific page's Include instances (Admin function)
resolver.define('pushUpdatesToPage', async (req) => {
  try {
    const { excerptId, pageId } = req.payload;

    // Get the excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Get all usages of this excerpt
    const usageKey = `excerpt-usage:${excerptId}`;
    const usageData = await storage.get(usageKey) || { usages: [] };

    // Filter to only usages on the specified page
    const pageUsages = usageData.usages.filter(u => u.pageId === pageId);

    if (pageUsages.length === 0) {
      return { success: false, error: 'No instances found on this page' };
    }

    let updated = 0;
    let errors = [];

    // Update each instance on this page
    for (const usage of pageUsages) {
      try {
        const localId = usage.localId;

        // Get variable values for this instance
        const varsKey = `macro-vars:${localId}`;
        const macroVars = await storage.get(varsKey) || {};

        // Generate fresh content
        let freshContent = excerpt.content;

        // Cache the updated content
        const now = new Date().toISOString();
        const cacheKey = `macro-cache:${localId}`;
        await storage.set(cacheKey, {
          content: freshContent,
          cachedAt: now
        });

        // Update lastSynced timestamp
        macroVars.lastSynced = now;
        await storage.set(varsKey, macroVars);

        updated++;
      } catch (err) {
        console.error(`Error updating localId ${usage.localId}:`, err);
        errors.push({ localId: usage.localId, error: err.message });
      }
    }

    console.log(`pushUpdatesToPage: Updated ${updated} instances on page ${pageId}`);

    return {
      success: true,
      updated,
      total: pageUsages.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('Error pushing updates to page:', error);
    return { success: false, error: error.message };
  }
});

// Get variable values and toggle states for a specific macro instance
// Get page title via Confluence API
resolver.define('getPageTitle', async (req) => {
  try {
    const { contentId } = req.payload;
    console.log('Fetching page title for contentId:', contentId);

    const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${contentId}`);
    const pageData = await response.json();

    console.log('Page data fetched:', pageData);
    console.log('Page title:', pageData.title);

    return {
      success: true,
      title: pageData.title || ''
    };
  } catch (error) {
    console.error('Error fetching page title:', error);
    return {
      success: false,
      error: error.message,
      title: ''
    };
  }
});

resolver.define('getVariableValues', async (req) => {
  try {
    const { localId } = req.payload;
    const key = `macro-vars:${localId}`;
    const data = await storage.get(key);

    console.log('Getting variable values for localId:', localId, 'found:', !!data);
    return {
      success: true,
      variableValues: data?.variableValues || {},
      toggleStates: data?.toggleStates || {},
      customInsertions: data?.customInsertions || [],
      lastSynced: data?.lastSynced || null
    };
  } catch (error) {
    console.error('Error getting variable values:', error);
    return {
      success: false,
      error: error.message,
      variableValues: {},
      toggleStates: {},
      customInsertions: [],
      lastSynced: null
    };
  }
});

// Get all excerpts with full details (for admin page)
resolver.define('getAllExcerpts', async () => {
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
});

// Delete an excerpt
resolver.define('deleteExcerpt', async (req) => {
  try {
    const { excerptId } = req.payload;

    // Delete the excerpt
    await storage.delete(`excerpt:${excerptId}`);

    // Update the index
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    index.excerpts = index.excerpts.filter(e => e.id !== excerptId);
    await storage.set('excerpt-index', index);

    console.log('Excerpt deleted:', excerptId);
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
});

// Update excerpt metadata (name, category)
resolver.define('updateExcerptMetadata', async (req) => {
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

    console.log('Excerpt metadata updated:', excerptId);
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
});

// Mass update excerpts (e.g., change category for multiple excerpts)
resolver.define('massUpdateExcerpts', async (req) => {
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

    console.log('Mass update completed for', excerptIds.length, 'excerpts');
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
});

// Track usage of an excerpt (called when Include macro is saved)
resolver.define('trackExcerptUsage', async (req) => {
  try {
    const { excerptId, localId } = req.payload;

    // Extract page information from backend context
    const pageId = req.context?.extension?.content?.id;
    const spaceKey = req.context?.extension?.space?.key || 'Unknown Space';

    if (!pageId) {
      console.error('CRITICAL: pageId not available in req.context');
      return {
        success: false,
        error: 'Page context not available'
      };
    }

    // Fetch page data including title and body (ADF content)
    let pageTitle = 'Unknown Page';
    let headingAnchor = null;

    try {
      const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`);
      const pageData = await response.json();
      pageTitle = pageData.title || 'Unknown Page';

      // Parse the ADF to find the heading above this Include macro
      if (pageData.body?.atlas_doc_format?.value) {
        const adfContent = JSON.parse(pageData.body.atlas_doc_format.value);
        headingAnchor = findHeadingBeforeMacro(adfContent, localId);
      }
    } catch (apiError) {
      console.error('Error fetching page data via API:', apiError);
      // Fall back to context title if API fails
      pageTitle = req.context?.extension?.content?.title || 'Unknown Page';
    }

    // Fetch toggle states and variable values from storage (saved during auto-save)
    let toggleStates = {};
    let variableValues = {};
    try {
      const macroVars = await storage.get(`macro-vars:${localId}`);
      if (macroVars?.toggleStates) {
        toggleStates = macroVars.toggleStates;
      }
      if (macroVars?.variableValues) {
        variableValues = macroVars.variableValues;
      }
    } catch (storageError) {
      console.error('Error fetching toggle states and variable values:', storageError);
    }

    // Store usage data in a reverse index
    const usageKey = `usage:${excerptId}`;
    const usageData = await storage.get(usageKey) || { excerptId, references: [] };

    // Check if this localId already exists
    const existingIndex = usageData.references.findIndex(r => r.localId === localId);

    const reference = {
      localId,
      pageId,
      pageTitle,
      spaceKey,
      headingAnchor,
      toggleStates,
      variableValues,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      // Update existing reference
      usageData.references[existingIndex] = reference;
    } else {
      // Add new reference
      usageData.references.push(reference);
    }

    await storage.set(usageKey, usageData);

    return {
      success: true,
      pageId,
      pageTitle,
      spaceKey,
      headingAnchor,
      toggleStates
    };
  } catch (error) {
    console.error('Error tracking excerpt usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Remove usage tracking (called when Include macro is deleted or excerptId changes)
resolver.define('removeExcerptUsage', async (req) => {
  try {
    const { excerptId, localId } = req.payload;

    const usageKey = `usage:${excerptId}`;
    const usageData = await storage.get(usageKey);

    if (usageData) {
      usageData.references = usageData.references.filter(r => r.localId !== localId);

      if (usageData.references.length === 0) {
        // No more references, delete the usage record
        await storage.delete(usageKey);
      } else {
        await storage.set(usageKey, usageData);
      }
    }

    console.log('Usage removed for excerpt:', excerptId, 'localId:', localId);
    return {
      success: true
    };
  } catch (error) {
    console.error('Error removing excerpt usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get excerpt usage (which Include macros reference this excerpt)
resolver.define('getExcerptUsage', async (req) => {
  try {
    const { excerptId } = req.payload;

    const usageKey = `usage:${excerptId}`;
    const usageData = await storage.get(usageKey) || { references: [] };

    // Enrich usage data with lastSynced timestamp from macro-vars
    const enrichedReferences = await Promise.all(usageData.references.map(async (ref) => {
      const varsKey = `macro-vars:${ref.localId}`;
      const macroVars = await storage.get(varsKey);

      return {
        ...ref,
        lastSynced: macroVars?.lastSynced || null
      };
    }));

    return {
      success: true,
      usage: enrichedReferences
    };
  } catch (error) {
    console.error('Error getting excerpt usage:', error);
    return {
      success: false,
      error: error.message,
      usage: []
    };
  }
});

// Source heartbeat: Update lastSeenAt timestamp when Source macro is rendered
resolver.define('sourceHeartbeat', async (req) => {
  try {
    const { excerptId } = req.payload;

    // Load the excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Update lastSeenAt timestamp
    excerpt.lastSeenAt = new Date().toISOString();
    await storage.set(`excerpt:${excerptId}`, excerpt);

    return { success: true };
  } catch (error) {
    console.error('Error in sourceHeartbeat:', error);
    return { success: false, error: error.message };
  }
});

// Get orphaned Sources (Sources that haven't checked in recently or were deleted)
// Active check: Verify each Source still exists on its page
resolver.define('checkAllSources', async (req) => {
  try {
    console.log('🔍 ACTIVE CHECK: Checking all Sources against their pages...');

    // Get all excerpts from the index
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    console.log('Total excerpts to check:', excerptIndex.excerpts.length);

    const orphanedSources = [];
    const checkedSources = [];
    let totalStaleEntriesRemoved = 0;

    for (const excerptSummary of excerptIndex.excerpts) {
      // Load full excerpt data
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (!excerpt) continue;

      // Skip if this excerpt doesn't have page info (shouldn't happen, but safety check)
      if (!excerpt.sourcePageId || !excerpt.sourceLocalId) {
        console.log(`⚠️ Excerpt "${excerpt.name}" missing sourcePageId or sourceLocalId, skipping`);
        continue;
      }

      console.log(`Checking "${excerpt.name}" on page ${excerpt.sourcePageId}...`);

      try {
        // Fetch the page content from Confluence API
        const response = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${excerpt.sourcePageId}?body-format=storage`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          console.log(`❌ Page ${excerpt.sourcePageId} not found or not accessible`);
          orphanedSources.push({
            ...excerpt,
            orphanedReason: 'Source page not found or deleted'
          });
          continue;
        }

        const pageData = await response.json();
        const pageBody = pageData?.body?.storage?.value || '';

        // Check if the sourceLocalId exists in the page body
        // Confluence stores macro IDs in the storage format like: data-macro-id="sourceLocalId"
        const macroExists = pageBody.includes(excerpt.sourceLocalId);

        if (macroExists) {
          console.log(`✅ Source "${excerpt.name}" found on page`);
          checkedSources.push(excerpt.name);
        } else {
          console.log(`❌ Source "${excerpt.name}" NOT found on page - ORPHANED`);
          orphanedSources.push({
            ...excerpt,
            orphanedReason: 'Macro deleted from source page'
          });
        }
      } catch (apiError) {
        console.error(`Error checking page ${excerpt.sourcePageId}:`, apiError);
        orphanedSources.push({
          ...excerpt,
          orphanedReason: `API error: ${apiError.message}`
        });
      }
    }

    console.log(`✅ Source check complete: ${checkedSources.length} active, ${orphanedSources.length} orphaned`);

    // Now clean up stale Include usage entries
    console.log('🧹 CLEANUP: Checking for stale Include usage entries...');

    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (!excerpt) continue;

      // Get usage data for this excerpt
      const usageKey = `usage:${excerpt.id}`;
      const usageData = await storage.get(usageKey);

      if (!usageData || !usageData.references || usageData.references.length === 0) {
        continue;
      }

      console.log(`Checking usage entries for "${excerpt.name}" (${usageData.references.length} entries)...`);

      // Group references by pageId to check each page only once
      const pageMap = new Map();
      for (const ref of usageData.references) {
        if (!pageMap.has(ref.pageId)) {
          pageMap.set(ref.pageId, []);
        }
        pageMap.get(ref.pageId).push(ref);
      }

      const validReferences = [];
      let staleEntriesForThisExcerpt = 0;

      // Check each page
      for (const [pageId, refs] of pageMap.entries()) {
        try {
          // Fetch the page content
          const response = await api.asApp().requestConfluence(
            route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
            {
              headers: {
                'Accept': 'application/json'
              }
            }
          );

          if (!response.ok) {
            console.log(`⚠️ Page ${pageId} not accessible, removing all ${refs.length} references`);
            staleEntriesForThisExcerpt += refs.length;
            continue;
          }

          const pageData = await response.json();
          const pageBody = pageData?.body?.storage?.value || '';

          // Check which localIds still exist on the page
          for (const ref of refs) {
            if (pageBody.includes(ref.localId)) {
              validReferences.push(ref);
            } else {
              console.log(`🗑️ Removing stale entry: localId ${ref.localId} no longer on page ${pageId}`);
              staleEntriesForThisExcerpt++;
            }
          }
        } catch (apiError) {
          console.error(`Error checking page ${pageId}:`, apiError);
          // Keep references if we can't verify (safer than deleting)
          validReferences.push(...refs);
        }
      }

      // Update storage if we removed any stale entries
      if (staleEntriesForThisExcerpt > 0) {
        console.log(`✅ Cleaned up ${staleEntriesForThisExcerpt} stale entries for "${excerpt.name}"`);
        totalStaleEntriesRemoved += staleEntriesForThisExcerpt;

        if (validReferences.length > 0) {
          usageData.references = validReferences;
          await storage.set(usageKey, usageData);
        } else {
          // No valid references left, delete the usage key
          await storage.delete(usageKey);
        }
      }
    }

    console.log(`✅ Cleanup complete: ${totalStaleEntriesRemoved} stale Include entries removed`);

    return {
      success: true,
      orphanedSources,
      checkedCount: checkedSources.length + orphanedSources.length,
      activeCount: checkedSources.length,
      staleEntriesRemoved: totalStaleEntriesRemoved
    };
  } catch (error) {
    console.error('Error in checkAllSources:', error);
    return {
      success: false,
      error: error.message,
      orphanedSources: [],
      staleEntriesRemoved: 0
    };
  }
});

// Get all orphaned usage entries (usage data for excerpts that no longer exist)
resolver.define('getOrphanedUsage', async (req) => {
  try {
    console.log('Checking for orphaned usage entries...');

    // Get all storage keys
    const allKeys = await storage.query().where('key', startsWith('usage:')).getMany();
    console.log('Found usage keys:', allKeys.results.length);

    // Get all existing excerpt IDs
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const existingExcerptIds = new Set(excerptIndex.excerpts.map(e => e.id));
    console.log('Existing excerpts:', existingExcerptIds.size);

    // Find orphaned usage entries
    const orphanedUsage = [];
    for (const entry of allKeys.results) {
      const excerptId = entry.key.replace('usage:', '');

      // If usage exists but excerpt doesn't, it's orphaned
      if (!existingExcerptIds.has(excerptId)) {
        const usageData = entry.value;
        orphanedUsage.push({
          excerptId,
          excerptName: usageData.excerptName || 'Unknown',
          references: usageData.references || [],
          referenceCount: (usageData.references || []).length
        });
      }
    }

    console.log('Found orphaned usage entries:', orphanedUsage.length);

    return {
      success: true,
      orphanedUsage
    };
  } catch (error) {
    console.error('Error getting orphaned usage:', error);
    return {
      success: false,
      error: error.message,
      orphanedUsage: []
    };
  }
});

// Import from MultiExcerpt and create SmartExcerpt
resolver.define('importFromMultiExcerpt', async (req) => {
  try {
    const { multiExcerptName, content, smartExcerptName, category } = req.payload;

    // Create a new SmartExcerpt using the saveExcerpt logic
    const excerptId = generateUUID();
    const detectedVariables = detectVariables(content);
    const detectedToggles = detectToggles(content);

    const excerpt = {
      id: excerptId,
      name: smartExcerptName,
      category: category || 'General',
      content: content,
      variables: detectedVariables,
      toggles: detectedToggles,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.set(`excerpt:${excerptId}`, excerpt);
    await updateExcerptIndex(excerpt);

    // Track migration
    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };
    tracker.multiExcerpts.push({
      id: generateUUID(),
      multiExcerptName,
      status: 'migrated',
      smartExcerptId: excerptId,
      migratedAt: new Date().toISOString()
    });
    await storage.set('migration-tracker', tracker);

    console.log('Import successful:', smartExcerptName, 'from MultiExcerpt:', multiExcerptName);
    return {
      success: true,
      excerptId
    };
  } catch (error) {
    console.error('Error importing from MultiExcerpt:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Track migration status manually (for planning)
resolver.define('trackMigration', async (req) => {
  try {
    const { multiExcerptName, status, smartExcerptId } = req.payload;

    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };

    // Check if already exists
    const existingIndex = tracker.multiExcerpts.findIndex(m => m.multiExcerptName === multiExcerptName);

    if (existingIndex >= 0) {
      // Update existing
      tracker.multiExcerpts[existingIndex].status = status;
      tracker.multiExcerpts[existingIndex].smartExcerptId = smartExcerptId || tracker.multiExcerpts[existingIndex].smartExcerptId;
      if (status === 'migrated' && !tracker.multiExcerpts[existingIndex].migratedAt) {
        tracker.multiExcerpts[existingIndex].migratedAt = new Date().toISOString();
      }
    } else {
      // Add new
      tracker.multiExcerpts.push({
        id: generateUUID(),
        multiExcerptName,
        status: status || 'not-migrated',
        smartExcerptId: smartExcerptId || null,
        addedAt: new Date().toISOString()
      });
    }

    await storage.set('migration-tracker', tracker);

    console.log('Migration tracked:', multiExcerptName, 'status:', status);
    return {
      success: true
    };
  } catch (error) {
    console.error('Error tracking migration:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get migration status
resolver.define('getMigrationStatus', async () => {
  try {
    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };

    return {
      success: true,
      migrations: tracker.multiExcerpts
    };
  } catch (error) {
    console.error('Error getting migration status:', error);
    return {
      success: false,
      error: error.message,
      migrations: []
    };
  }
});

// Save categories to storage
resolver.define('saveCategories', async (req) => {
  try {
    const { categories } = req.payload;

    if (!Array.isArray(categories)) {
      return {
        success: false,
        error: 'Categories must be an array'
      };
    }

    await storage.set('categories', { categories });

    return {
      success: true
    };
  } catch (error) {
    console.error('Error saving categories:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get categories from storage
resolver.define('getCategories', async () => {
  try {
    const data = await storage.get('categories');

    // Return stored categories or default list if not found
    const defaultCategories = ['General', 'Pricing', 'Technical', 'Legal', 'Marketing'];
    const categories = data?.categories || defaultCategories;

    return {
      success: true,
      categories
    };
  } catch (error) {
    console.error('Error getting categories:', error);
    return {
      success: false,
      error: error.message,
      categories: ['General', 'Pricing', 'Technical', 'Legal', 'Marketing']
    };
  }
});

export const handler = resolver.getDefinitions();
