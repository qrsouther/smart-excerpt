import Resolver from '@forge/resolver';
import { storage } from '@forge/api';
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
    if (!variables.find(v => v.name === varName)) {
      variables.push({
        name: varName,
        defaultValue: '',
        description: ''
      });
    }
  }

  return variables;
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

// Save excerpt
resolver.define('saveExcerpt', async (req) => {
  const { excerptName, category, content, excerptId } = req.payload;

  // Generate or reuse excerpt ID
  const id = excerptId || generateUUID();

  // Detect variables in content
  const variables = detectVariables(content);

  // Store excerpt
  const excerpt = {
    id: id,
    name: excerptName,
    category: category || 'General',
    content: content,
    variables: variables,
    createdAt: excerptId ? (await storage.get(`excerpt:${id}`))?.createdAt : new Date().toISOString(),
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
    variables: variables
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

// Save variable values for a specific macro instance
// We'll store this keyed by localId (unique ID for each macro instance)
resolver.define('saveVariableValues', async (req) => {
  try {
    const { localId, excerptId, variableValues } = req.payload;
    console.log('Saving variable values for localId:', localId, 'excerptId:', excerptId);

    const key = `macro-vars:${localId}`;
    await storage.set(key, {
      excerptId,
      variableValues,
      updatedAt: new Date().toISOString()
    });

    console.log('Variable values saved successfully');
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

// Get variable values for a specific macro instance
resolver.define('getVariableValues', async (req) => {
  try {
    const { localId } = req.payload;
    const key = `macro-vars:${localId}`;
    const data = await storage.get(key);

    console.log('Getting variable values for localId:', localId, 'found:', !!data);
    return {
      success: true,
      variableValues: data?.variableValues || {}
    };
  } catch (error) {
    console.error('Error getting variable values:', error);
    return {
      success: false,
      error: error.message,
      variableValues: {}
    };
  }
});

export const handler = resolver.getDefinitions();
