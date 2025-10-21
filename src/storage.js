import { storage } from '@forge/api';
import { v4 as uuidv4 } from 'uuid';

/**
 * Storage utilities for SmartExcerpt
 * Handles excerpts, includes, usage tracking, and caching
 */

// ============================================================================
// EXCERPTS - Source SmartExcerpt definitions
// ============================================================================

/**
 * Save or update a SmartExcerpt source
 */
export async function saveExcerpt(excerptData) {
  const id = excerptData.id || uuidv4();
  const now = new Date().toISOString();

  const excerpt = {
    id,
    name: excerptData.name,
    pageId: excerptData.pageId,
    spaceKey: excerptData.spaceKey,
    category: excerptData.category || 'Uncategorized',
    content: excerptData.content, // ADF JSON
    variables: excerptData.variables || [],
    variants: excerptData.variants || [],
    metadata: {
      createdAt: excerptData.metadata?.createdAt || now,
      updatedAt: now,
      createdBy: excerptData.createdBy,
      version: (excerptData.metadata?.version || 0) + 1
    }
  };

  await storage.set(`excerpt:${id}`, excerpt);

  // Update index for quick lookups
  await updateExcerptIndex(excerpt);

  // Invalidate cache
  await storage.delete(`cache:excerpt:${id}`);

  return excerpt;
}

/**
 * Get a SmartExcerpt by ID
 */
export async function getExcerpt(excerptId) {
  // Try cache first
  const cached = await storage.get(`cache:excerpt:${excerptId}`);
  if (cached) {
    return cached;
  }

  // Fetch from storage
  const excerpt = await storage.get(`excerpt:${excerptId}`);

  if (excerpt) {
    // Cache for 1 hour
    await storage.set(`cache:excerpt:${excerptId}`, excerpt);
  }

  return excerpt;
}

/**
 * Get all excerpts (for search/selection UI)
 */
export async function getAllExcerpts() {
  const index = await storage.get('excerpt-index') || { excerpts: [] };
  return index.excerpts;
}

/**
 * Get excerpts by category
 */
export async function getExcerptsByCategory(category) {
  const all = await getAllExcerpts();
  return all.filter(e => e.category === category);
}

/**
 * Search excerpts by name
 */
export async function searchExcerpts(query) {
  const all = await getAllExcerpts();
  const lowerQuery = query.toLowerCase();
  return all.filter(e => e.name.toLowerCase().includes(lowerQuery));
}

/**
 * Update the excerpt index for fast lookups
 */
async function updateExcerptIndex(excerpt) {
  const index = await storage.get('excerpt-index') || { excerpts: [] };

  // Remove old entry if exists
  index.excerpts = index.excerpts.filter(e => e.id !== excerpt.id);

  // Add updated entry (lightweight version for index)
  index.excerpts.push({
    id: excerpt.id,
    name: excerpt.name,
    category: excerpt.category,
    pageId: excerpt.pageId,
    spaceKey: excerpt.spaceKey,
    updatedAt: excerpt.metadata.updatedAt
  });

  await storage.set('excerpt-index', index);
}

// ============================================================================
// INCLUDES - SmartExcerpt Include configurations
// ============================================================================

/**
 * Save or update a SmartInclude configuration
 */
export async function saveInclude(includeData) {
  const id = includeData.id || uuidv4();
  const now = new Date().toISOString();

  const include = {
    id,
    excerptId: includeData.excerptId,
    pageId: includeData.pageId,
    macroId: includeData.macroId,
    variableValues: includeData.variableValues || {},
    enabledVariants: includeData.enabledVariants || [],
    customContent: includeData.customContent || [],
    metadata: {
      createdAt: includeData.metadata?.createdAt || now,
      updatedAt: now,
      lastModifiedBy: includeData.lastModifiedBy
    }
  };

  await storage.set(`include:${id}`, include);

  // Update usage tracking
  await trackUsage(includeData.excerptId, includeData.pageId, id);

  return include;
}

/**
 * Get a SmartInclude by ID
 */
export async function getInclude(includeId) {
  return await storage.get(`include:${includeId}`);
}

/**
 * Get all includes for a specific page
 */
export async function getIncludesForPage(pageId) {
  // This is a simple implementation; for scale, consider pagination
  const allKeys = await storage.query().where('key', 'startsWith', 'include:').getMany();
  const includes = await Promise.all(
    allKeys.results.map(async (key) => await storage.get(key.key))
  );
  return includes.filter(inc => inc.pageId === pageId);
}

// ============================================================================
// USAGE TRACKING - Track where excerpts are used
// ============================================================================

/**
 * Track usage of an excerpt
 */
async function trackUsage(excerptId, pageId, includeId) {
  const usageKey = `usage:${excerptId}`;
  const usage = await storage.get(usageKey) || {
    excerptId,
    usages: [],
    totalUsageCount: 0
  };

  // Remove old entry for this include if exists
  usage.usages = usage.usages.filter(u => u.includeId !== includeId);

  // Add new usage
  usage.usages.push({
    includeId,
    pageId,
    lastUsed: new Date().toISOString()
  });

  usage.totalUsageCount = usage.usages.length;

  await storage.set(usageKey, usage);
}

/**
 * Get all usages of an excerpt
 */
export async function getExcerptUsages(excerptId) {
  return await storage.get(`usage:${excerptId}`) || {
    excerptId,
    usages: [],
    totalUsageCount: 0
  };
}

// ============================================================================
// BATCH OPERATIONS - For performance optimization
// ============================================================================

/**
 * Batch fetch excerpts (for pages with many includes)
 */
export async function batchGetExcerpts(excerptIds) {
  const uniqueIds = [...new Set(excerptIds)];

  const excerpts = await Promise.all(
    uniqueIds.map(id => getExcerpt(id))
  );

  // Return as a map for easy lookup
  const excerptMap = {};
  excerpts.forEach((excerpt, index) => {
    if (excerpt) {
      excerptMap[uniqueIds[index]] = excerpt;
    }
  });

  return excerptMap;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Clear cache for an excerpt
 */
export async function clearExcerptCache(excerptId) {
  await storage.delete(`cache:excerpt:${excerptId}`);
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  const cacheKeys = await storage.query().where('key', 'startsWith', 'cache:').getMany();
  await Promise.all(
    cacheKeys.results.map(key => storage.delete(key.key))
  );
}
