import Resolver from '@forge/resolver';
import { storage } from '@forge/api';
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
  const { excerptName, category, content, excerptId, variableMetadata, toggleMetadata, sourcePageId, sourcePageTitle, sourceSpaceKey } = req.payload;

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
      example: metadata?.example || ''
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
    const excerpt = await storage.get(`excerpt:${req.payload.excerptId}`);
    console.log('getExcerpt called for:', req.payload.excerptId);
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

// Save variable values and toggle states for a specific macro instance
// We'll store this keyed by localId (unique ID for each macro instance)
resolver.define('saveVariableValues', async (req) => {
  try {
    const { localId, excerptId, variableValues, toggleStates } = req.payload;
    console.log('Saving variable values for localId:', localId, 'excerptId:', excerptId);
    console.log('Toggle states:', toggleStates);

    const key = `macro-vars:${localId}`;
    await storage.set(key, {
      excerptId,
      variableValues,
      toggleStates: toggleStates || {},
      updatedAt: new Date().toISOString()
    });

    console.log('Variable values and toggle states saved successfully');
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

// Get variable values and toggle states for a specific macro instance
resolver.define('getVariableValues', async (req) => {
  try {
    const { localId } = req.payload;
    const key = `macro-vars:${localId}`;
    const data = await storage.get(key);

    console.log('Getting variable values for localId:', localId, 'found:', !!data);
    return {
      success: true,
      variableValues: data?.variableValues || {},
      toggleStates: data?.toggleStates || {}
    };
  } catch (error) {
    console.error('Error getting variable values:', error);
    return {
      success: false,
      error: error.message,
      variableValues: {},
      toggleStates: {}
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
    const { excerptId, localId, pageId, pageTitle, spaceKey } = req.payload;

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

    console.log('Usage tracked for excerpt:', excerptId, 'localId:', localId);
    return {
      success: true
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

    return {
      success: true,
      usage: usageData.references
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

export const handler = resolver.getDefinitions();
