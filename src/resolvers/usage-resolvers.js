/**
 * Usage Tracking and Update Resolver Functions
 *
 * This module contains operations for tracking excerpt usage across pages
 * and pushing updates to Include instances. These are tightly related operations:
 * tracking tells us WHERE instances are, and push updates keep those instances
 * in sync with their source.
 *
 * Extracted during Phase 6 of index.js modularization.
 *
 * Usage Tracking Functions:
 * - trackExcerptUsage: Record when/where an excerpt is used on a page
 * - removeExcerptUsage: Remove usage tracking when Include is deleted
 * - getExcerptUsage: Get all pages using a specific excerpt
 *
 * Push Update Functions:
 * - pushUpdatesToAll: Push excerpt updates to all Include instances
 * - pushUpdatesToPage: Push updates to specific page's Include instances
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { findHeadingBeforeMacro } from '../utils/adf-utils.js';

/**
 * Track excerpt usage - record when/where an excerpt is used
 * Called when Embed macro is saved
 */
export async function trackExcerptUsage(req) {
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

      // Parse the ADF to find the heading above this Embed macro
      if (pageData.body?.atlas_doc_format?.value) {
        const adfContent = JSON.parse(pageData.body.atlas_doc_format.value);
        const headingText = findHeadingBeforeMacro(adfContent, localId);
        // Format heading for Confluence URL anchor (spaces → hyphens)
        if (headingText) {
          headingAnchor = headingText.replace(/\s+/g, '-');
        }
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
}

/**
 * Remove usage tracking
 * Called when Embed macro is deleted or excerptId changes
 */
export async function removeExcerptUsage(req) {
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
}

/**
 * Get excerpt usage - which Embed macros reference this excerpt
 */
export async function getExcerptUsage(req) {
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
}

/**
 * Get usage counts for all excerpts (lightweight for sorting)
 * Returns object mapping excerptId -> count of references
 */
export async function getAllUsageCounts() {
  try {
    // Get all excerpt IDs from the index
    const index = await storage.get('excerpt-index') || { excerpts: [] };
    const usageCounts = {};

    // For each excerpt, get just the count of references
    await Promise.all(index.excerpts.map(async (indexEntry) => {
      const usageKey = `usage:${indexEntry.id}`;
      const usageData = await storage.get(usageKey);

      // Count unique pages (not total references)
      if (usageData && Array.isArray(usageData.references)) {
        const uniquePageIds = new Set(usageData.references.map(ref => ref.pageId));
        usageCounts[indexEntry.id] = uniquePageIds.size;
      } else {
        usageCounts[indexEntry.id] = 0;
      }
    }));

    return {
      success: true,
      usageCounts
    };
  } catch (error) {
    console.error('Error getting all usage counts:', error);
    return {
      success: false,
      error: error.message,
      usageCounts: {}
    };
  }
}

/**
 * Push updates to all Include instances of a specific excerpt
 * Admin function to force-refresh all instances
 */
export async function pushUpdatesToAll(req) {
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
}

/**
 * Push updates to a specific page's Include instances
 * Admin function to force-refresh instances on one page
 */
export async function pushUpdatesToPage(req) {
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
}
