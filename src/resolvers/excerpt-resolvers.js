/**
 * Excerpt CRUD Resolver Functions
 *
 * This module contains all excerpt create, read, update, and delete operations.
 * These are the core business logic resolvers for managing excerpt entities.
 *
 * Extracted during Phase 3 of index.js modularization.
 */

import { storage } from '@forge/api';
import { generateUUID } from '../utils.js';
import { detectVariables, detectToggles } from '../utils/detection-utils.js';
import { updateExcerptIndex } from '../utils/storage-utils.js';

/**
 * Save excerpt (create or update)
 */
export async function saveExcerpt(req) {
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
}

/**
 * Update excerpt content only (called automatically when Source macro body changes)
 */
export async function updateExcerptContent(req) {
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
}
