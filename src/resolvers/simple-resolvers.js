/**
 * Simple Resolver Functions
 *
 * This module contains simple getter/setter resolvers with minimal business logic.
 * These are primarily storage lookups, API calls, and utility function wrappers.
 *
 * Extracted during Phase 2 of index.js modularization.
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { detectVariables, detectToggles } from '../utils/detection-utils.js';

/**
 * Detect variables from content (for UI to call)
 */
export async function detectVariablesFromContent(req) {
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
}

/**
 * Detect toggles from content (for UI to call)
 */
export async function detectTogglesFromContent(req) {
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
}

/**
 * Get all excerpts from index
 */
export async function getExcerpts() {
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
}

/**
 * Get specific excerpt by ID
 */
export async function getExcerpt(req) {
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
}

/**
 * Get page title by content ID
 */
export async function getPageTitle(req) {
  try {
    const contentId = req.payload.contentId;
    console.log('getPageTitle called for contentId:', contentId);

    const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${contentId}`);
    const data = await response.json();

    console.log('getPageTitle - title:', data.title);

    return {
      success: true,
      title: data.title
    };
  } catch (error) {
    console.error('Error getting page title:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get variable values and toggle states for a specific macro instance
 */
export async function getVariableValues(req) {
  try {
    const { localId } = req.payload;
    const key = `macro-vars:${localId}`;
    const data = await storage.get(key) || {};

    return {
      success: true,
      variableValues: data.variableValues || {},
      toggleStates: data.toggleStates || {},
      customInsertions: data.customInsertions || [],
      internalNotes: data.internalNotes || [],
      lastSynced: data.lastSynced,
      excerptId: data.excerptId
    };
  } catch (error) {
    console.error('Error getting variable values:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * DEPRECATED: Get or register the canonical localId for an excerpt on a page
 *
 * This approach had performance issues (extra network call on every render)
 * and didn't handle multiple instances of same excerpt on one page well.
 *
 * Replaced with lazy recovery approach: use context.localId directly,
 * only call recoverOrphanedData when data is missing.
 *
 * Keeping this function for backward compatibility during transition.
 */
export async function getCanonicalLocalId(req) {
  // Simply return the current localId - no longer doing canonical mapping
  return {
    success: true,
    canonicalLocalId: req.payload.currentLocalId,
    isDragged: false
  };
}

/**
 * Recover orphaned data after a macro has been moved (localId changed)
 * This handles the case where dragging a macro in Confluence assigns it a new localId
 *
 * Performance: Only called when data is missing (lazy recovery), not on every render
 * Multiple instances: Uses most recent updatedAt timestamp as tiebreaker
 */
export async function recoverOrphanedData(req) {
  try {
    const { pageId, excerptId, currentLocalId } = req.payload;

    console.log(`Attempting data recovery for localId ${currentLocalId}, excerptId ${excerptId} on page ${pageId}`);

    // Query all macro-vars entries
    const allEntries = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    console.log(`Found ${allEntries.results.length} total macro-vars entries`);

    // Find candidates: entries with matching excerptId that were recently accessed
    const now = new Date();
    const candidates = [];

    for (const entry of allEntries.results) {
      const data = entry.value;
      const entryLocalId = entry.key.replace('macro-vars:', '');

      // Skip if this is the current localId (we already checked it)
      if (entryLocalId === currentLocalId) {
        continue;
      }

      // Check if excerptId matches
      if (data.excerptId === excerptId) {
        // Check if recently synced (within last 5 minutes - generous window)
        if (data.lastSynced) {
          const lastSyncTime = new Date(data.lastSynced);
          const ageInSeconds = (now - lastSyncTime) / 1000;

          if (ageInSeconds < 300) { // 5 minutes
            candidates.push({
              localId: entryLocalId,
              data: data,
              ageInSeconds: ageInSeconds,
              updatedAt: data.updatedAt || data.lastSynced // Use updatedAt for tiebreaker
            });
            console.log(`Found candidate: localId ${entryLocalId}, age ${ageInSeconds}s, updatedAt: ${data.updatedAt || data.lastSynced}`);
          }
        }
      }
    }

    // If we found candidate(s), pick the most recently updated one
    if (candidates.length >= 1) {
      // Sort by updatedAt timestamp, most recent first
      candidates.sort((a, b) => {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        return dateB - dateA; // Most recent first
      });

      const orphanedEntry = candidates[0];

      if (candidates.length > 1) {
        console.log(`Found ${candidates.length} candidates (multiple instances of same excerpt on page)`);
        console.log(`Using most recently updated: ${orphanedEntry.localId} (${orphanedEntry.updatedAt})`);
      } else {
        console.log(`Migrating data from ${orphanedEntry.localId} to ${currentLocalId}`);
      }

      // Update excerptId to match (in case it was somehow different)
      orphanedEntry.data.excerptId = excerptId;

      // Save to new localId
      await storage.set(`macro-vars:${currentLocalId}`, orphanedEntry.data);

      // Delete old entry (only if not same as current)
      if (orphanedEntry.localId !== currentLocalId) {
        await storage.delete(`macro-vars:${orphanedEntry.localId}`);
      }

      // Also migrate cache if it exists
      const oldCache = await storage.get(`macro-cache:${orphanedEntry.localId}`);
      if (oldCache) {
        await storage.set(`macro-cache:${currentLocalId}`, oldCache);
        if (orphanedEntry.localId !== currentLocalId) {
          await storage.delete(`macro-cache:${orphanedEntry.localId}`);
        }
        console.log(`Also migrated cache from ${orphanedEntry.localId} to ${currentLocalId}`);
      }

      return {
        success: true,
        recovered: true,
        data: orphanedEntry.data,
        migratedFrom: orphanedEntry.localId,
        candidateCount: candidates.length
      };
    } else {
      console.log('No recent orphaned data found');
      return {
        success: true,
        recovered: false,
        reason: 'no_candidates'
      };
    }
  } catch (error) {
    console.error('Error recovering orphaned data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get cached rendered content for an Include instance (view mode)
 */
export async function getCachedContent(req) {
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
}

/**
 * Get saved categories
 */
export async function getCategories() {
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
}

/**
 * Save categories to storage
 */
export async function saveCategories(req) {
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
}

/**
 * Check if Include instance has stale content (update available)
 */
export async function checkVersionStaleness(req) {
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
}

/**
 * Get check progress data
 */
export async function getCheckProgress(req) {
  try {
    const { progressId } = req.payload;
    const progress = await storage.get(`progress:${progressId}`);

    if (!progress) {
      return {
        success: false,
        error: 'Progress not found'
      };
    }

    return {
      success: true,
      progress
    };
  } catch (error) {
    console.error('Error getting progress:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get migration status
 * ⚠️ ONE-TIME USE ONLY - DELETE AFTER PRODUCTION MIGRATION
 * This function reads migration-tracker data written by migration resolvers.
 * Once production migration is complete, this can be safely deleted.
 */
export async function getMigrationStatus() {
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
}

/**
 * Get MultiExcerpt scan progress
 * ⚠️ ONE-TIME USE ONLY - DELETE AFTER PRODUCTION MIGRATION
 * This function provides progress tracking for scanMultiExcerptIncludes operation.
 * Only used by hidden migration UI (SHOW_MIGRATION_TOOLS flag).
 * Once production migration is complete, this can be safely deleted.
 */
export async function getMultiExcerptScanProgress(req) {
  try {
    const { progressId } = req.payload;
    const progress = await storage.get(`progress:${progressId}`);

    if (!progress) {
      return {
        success: false,
        error: 'Progress not found'
      };
    }

    return {
      success: true,
      progress
    };
  } catch (error) {
    console.error('Error getting scan progress:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save cached rendered content for an Include instance
 */
export async function saveCachedContent(req) {
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
}

/**
 * Get all orphaned usage entries (usage data for excerpts that no longer exist)
 */
export async function getOrphanedUsage(req) {
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
}

/**
 * Get last verification timestamp
 * Used by auto-verification on Admin page mount to check if data is stale
 */
export async function getLastVerificationTime(req) {
  try {
    const timestamp = await storage.get('last-verification-time');
    return {
      success: true,
      lastVerificationTime: timestamp || null
    };
  } catch (error) {
    console.error('Error getting last verification time:', error);
    return {
      success: false,
      error: error.message,
      lastVerificationTime: null
    };
  }
}

/**
 * Set last verification timestamp
 * Called after Check All Includes completes to mark data as fresh
 */
export async function setLastVerificationTime(req) {
  const { timestamp } = req.payload;
  try {
    await storage.set('last-verification-time', timestamp);
    console.log('Last verification time updated:', timestamp);
    return {
      success: true,
      timestamp
    };
  } catch (error) {
    console.error('Error setting last verification time:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
