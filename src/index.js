import Resolver from '@forge/resolver';
import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from './utils.js';

// Import utility functions from modular files
import { extractTextFromAdf, findHeadingBeforeMacro } from './utils/adf-utils.js';
import { detectVariables, detectToggles } from './utils/detection-utils.js';
import { updateExcerptIndex } from './utils/storage-utils.js';
import { decodeTemplateData, storageToPlainText, cleanMultiExcerptMacros } from './utils/migration-utils.js';

// Import simple resolver functions (Phase 2 modularization)
import {
  detectVariablesFromContent as detectVariablesResolver,
  detectTogglesFromContent as detectTogglesResolver,
  getExcerpts as getExcerptsResolver,
  getExcerpt as getExcerptResolver,
  getPageTitle as getPageTitleResolver,
  getVariableValues as getVariableValuesResolver,
  getCachedContent as getCachedContentResolver,
  saveCachedContent as saveCachedContentResolver,
  getCategories as getCategoriesResolver,
  saveCategories as saveCategoriesResolver,
  getCheckProgress as getCheckProgressResolver,
  getMigrationStatus as getMigrationStatusResolver,
  getMultiExcerptScanProgress as getMultiExcerptScanProgressResolver,
  checkVersionStaleness as checkVersionStalenessResolver,
  getOrphanedUsage as getOrphanedUsageResolver
} from './resolvers/simple-resolvers.js';

// Import excerpt CRUD resolver functions (Phase 3 modularization)
import {
  saveExcerpt as saveExcerptResolver,
  updateExcerptContent as updateExcerptContentResolver,
  getAllExcerpts as getAllExcerptsResolver,
  deleteExcerpt as deleteExcerptResolver,
  updateExcerptMetadata as updateExcerptMetadataResolver,
  massUpdateExcerpts as massUpdateExcerptsResolver
} from './resolvers/excerpt-resolvers.js';

// ⚠️ ONE-TIME USE MIGRATION FUNCTIONS - DELETE AFTER PRODUCTION MIGRATION ⚠️
// Import migration resolver functions (Phase 4 modularization)
// These are one-time use functions for migrating from MultiExcerpt to SmartExcerpt
// Will be used ONCE during initial production setup, then can be safely deleted
// See migration-resolvers.js header for full deletion checklist
import {
  importFromMultiExcerpt as importFromMultiExcerptResolver,
  trackMigration as trackMigrationResolver,
  scanMultiExcerptIncludes as scanMultiExcerptIncludesResolver,
  bulkImportSources as bulkImportSourcesResolver,
  createSourceMacrosOnPage as createSourceMacrosOnPageResolver,
  convertMultiExcerptsOnPage as convertMultiExcerptsOnPageResolver,
  bulkInitializeAllExcerpts as bulkInitializeAllExcerptsResolver
} from './resolvers/migration-resolvers.js';

const resolver = new Resolver();

// Detect variables from content (for UI to call)
resolver.define('detectVariablesFromContent', detectVariablesResolver);

// Detect toggles from content (for UI to call)
resolver.define('detectTogglesFromContent', detectTogglesResolver);

// Save excerpt
resolver.define('saveExcerpt', saveExcerptResolver);

// Get all excerpts
resolver.define('getExcerpts', getExcerptsResolver);

// Get specific excerpt
resolver.define('getExcerpt', getExcerptResolver);

// Update excerpt content only (called automatically when Source macro body changes)
resolver.define('updateExcerptContent', updateExcerptContentResolver);

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
            const headingText = findHeadingBeforeMacro(adfContent, localId);
            // Format heading for Confluence URL anchor (spaces → hyphens)
            if (headingText) {
              headingAnchor = headingText.replace(/\s+/g, '-');
            }
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
resolver.define('saveCachedContent', saveCachedContentResolver);

// Get cached rendered content for an Include instance (view mode)
resolver.define('getCachedContent', getCachedContentResolver);

// Check if Include instance has stale content (update available)
resolver.define('checkVersionStaleness', checkVersionStalenessResolver);

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

// Get page title via Confluence API
resolver.define('getPageTitle', getPageTitleResolver);

// Get variable values and toggle states for a specific macro instance
resolver.define('getVariableValues', getVariableValuesResolver);

// Get all excerpts with full details (for admin page)
resolver.define('getAllExcerpts', getAllExcerptsResolver);

// Delete an excerpt
resolver.define('deleteExcerpt', deleteExcerptResolver);

// Update excerpt metadata (name, category)
resolver.define('updateExcerptMetadata', updateExcerptMetadataResolver);

// Mass update excerpts (e.g., change category for multiple excerpts)
resolver.define('massUpdateExcerpts', massUpdateExcerptsResolver);

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
resolver.define('getOrphanedUsage', getOrphanedUsageResolver);

// Check all Include instances (verify they exist, clean up orphans, generate export data)
resolver.define('checkAllIncludes', async (req) => {
  try {
    console.log('🔍 ACTIVE CHECK: Checking all Include instances...');

    const progressId = generateUUID();
    const startTime = Date.now();

    // Get all macro-vars entries (each represents an Include instance)
    const allMacroVars = await storage.query().where('key', startsWith('macro-vars:')).getMany();
    const totalIncludes = allMacroVars.results.length;
    console.log('Total Include instances to check:', totalIncludes);

    // Initialize progress tracking
    await storage.set(`progress:${progressId}`, {
      phase: 'initializing',
      total: totalIncludes,
      processed: 0,
      percent: 0,
      startTime,
      status: 'Loading excerpts...'
    });

    // Get excerpt index for validation
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const existingExcerptIds = new Set(excerptIndex.excerpts.map(e => e.id));

    // Load all excerpts for metadata
    const excerptMap = new Map();
    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (excerpt) {
        excerptMap.set(excerpt.id, excerpt);
      }
    }

    const activeIncludes = [];
    const orphanedIncludes = [];
    const brokenReferences = [];
    const staleIncludes = [];
    let orphanedEntriesRemoved = 0;

    // Group includes by page to minimize API calls
    const pageMap = new Map(); // pageId -> [includes on that page]

    // Update progress
    await storage.set(`progress:${progressId}`, {
      phase: 'grouping',
      total: totalIncludes,
      processed: 0,
      percent: 5,
      startTime,
      status: 'Organizing Includes by page...'
    });

    for (const entry of allMacroVars.results) {
      const localId = entry.key.replace('macro-vars:', '');
      const macroVars = entry.value;

      // Get usage data to find which page this Include is on
      const excerptId = macroVars.excerptId;
      const usageKey = `usage:${excerptId}`;
      const usageData = await storage.get(usageKey) || { references: [] };
      const reference = usageData.references.find(ref => ref.localId === localId);

      if (!reference) {
        console.log(`⚠️ No usage reference found for localId ${localId}, marking as orphaned`);
        orphanedIncludes.push({
          localId,
          excerptId,
          reason: 'No usage tracking reference'
        });
        continue;
      }

      const pageId = reference.pageId;

      if (!pageMap.has(pageId)) {
        pageMap.set(pageId, []);
      }

      pageMap.get(pageId).push({
        localId,
        macroVars,
        reference
      });
    }

    // Update progress - grouping complete
    await storage.set(`progress:${progressId}`, {
      phase: 'checking',
      total: totalIncludes,
      processed: 0,
      percent: 10,
      startTime,
      status: `Checking ${pageMap.size} pages with Includes...`
    });

    // Check each page
    let processedIncludes = 0;
    const totalPages = pageMap.size;
    let processedPages = 0;

    for (const [pageId, includes] of pageMap.entries()) {
      try {
        // Update progress before checking page
        processedPages++;
        const percent = Math.min(10 + Math.floor((processedIncludes / totalIncludes) * 80), 95);
        await storage.set(`progress:${progressId}`, {
          phase: 'checking',
          total: totalIncludes,
          processed: processedIncludes,
          percent,
          startTime,
          currentPage: processedPages,
          totalPages,
          status: `Checking page ${processedPages}/${totalPages}...`
        });

        // Fetch page content
        const response = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          console.log(`❌ Page ${pageId} not accessible, marking ${includes.length} Includes as orphaned`);
          includes.forEach(inc => {
            orphanedIncludes.push({
              localId: inc.localId,
              pageId,
              pageTitle: inc.reference.pageTitle,
              excerptId: inc.macroVars.excerptId,
              reason: 'Page not found or deleted'
            });
          });
          continue;
        }

        const pageData = await response.json();
        const pageBody = pageData?.body?.storage?.value || '';
        const pageTitle = pageData.title || 'Unknown Page';

        // Check each Include on this page
        for (const inc of includes) {
          const { localId, macroVars, reference } = inc;
          const excerptId = macroVars.excerptId;

          // Check if Include still exists on page
          if (!pageBody.includes(localId)) {
            console.log(`❌ Include ${localId} NOT found on page "${pageTitle}"`);
            orphanedIncludes.push({
              localId,
              pageId,
              pageTitle,
              excerptId,
              reason: 'Macro deleted from page'
            });
            continue;
          }

          // Check if excerpt still exists
          if (!existingExcerptIds.has(excerptId)) {
            console.log(`❌ Include ${localId} references non-existent excerpt ${excerptId}`);
            brokenReferences.push({
              localId,
              pageId,
              pageTitle,
              excerptId,
              reason: 'Referenced excerpt deleted'
            });
            continue;
          }

          // Get excerpt details
          const excerpt = excerptMap.get(excerptId);
          if (!excerpt) {
            console.log(`⚠️ Excerpt ${excerptId} not in map, skipping`);
            continue;
          }

          // Check staleness
          const excerptLastModified = new Date(excerpt.updatedAt || 0);
          const includeLastSynced = macroVars.lastSynced ? new Date(macroVars.lastSynced) : new Date(0);
          const isStale = excerptLastModified > includeLastSynced;

          // Generate rendered content for export
          let renderedContent = '';
          try {
            let content = excerpt.content;
            const isAdf = content && typeof content === 'object' && content.type === 'doc';

            if (isAdf) {
              // For ADF, extract plain text (simplified)
              renderedContent = extractTextFromAdf(content);
            } else {
              renderedContent = content || '';
            }

            // Perform variable substitution
            if (macroVars.variableValues) {
              Object.entries(macroVars.variableValues).forEach(([varName, value]) => {
                const regex = new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                renderedContent = renderedContent.replace(regex, value || '');
              });
            }

            // Remove toggle markers (simplified - just remove the markers themselves)
            renderedContent = renderedContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
            renderedContent = renderedContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          } catch (err) {
            console.error(`Error rendering content for ${localId}:`, err);
            renderedContent = '[Error rendering content]';
          }

          // Build complete Include data
          const includeData = {
            localId,
            pageId,
            pageTitle,
            pageUrl: `/wiki/pages/viewpage.action?pageId=${pageId}`,
            headingAnchor: reference.headingAnchor || '',
            excerptId,
            excerptName: excerpt.name,
            excerptCategory: excerpt.category || 'General',
            status: isStale ? 'stale' : 'active',
            lastSynced: macroVars.lastSynced || null,
            excerptLastModified: excerpt.updatedAt || null,
            variableValues: macroVars.variableValues || {},
            toggleStates: macroVars.toggleStates || {},
            customInsertions: macroVars.customInsertions || [],
            renderedContent: renderedContent.trim(),
            variables: excerpt.variables || [],
            toggles: excerpt.toggles || []
          };

          if (isStale) {
            staleIncludes.push(includeData);
          }

          activeIncludes.push(includeData);
          console.log(`✅ Include "${excerpt.name}" on "${pageTitle}" - ${isStale ? 'STALE' : 'UP TO DATE'}`);

          // Increment processed count
          processedIncludes++;
        }

        // Update progress after processing all Includes on this page
        processedIncludes += includes.filter(inc => !pageBody || !pageBody.includes(inc.localId) || !existingExcerptIds.has(inc.macroVars.excerptId)).length;

      } catch (apiError) {
        console.error(`Error checking page ${pageId}:`, apiError);
        includes.forEach(inc => {
          orphanedIncludes.push({
            localId: inc.localId,
            pageId,
            pageTitle: inc.reference.pageTitle,
            excerptId: inc.macroVars.excerptId,
            reason: `API error: ${apiError.message}`
          });
        });
      }
    }

    // Clean up orphaned entries
    console.log('🧹 CLEANUP: Removing orphaned Include entries...');
    await storage.set(`progress:${progressId}`, {
      phase: 'cleanup',
      total: totalIncludes,
      processed: totalIncludes,
      percent: 95,
      startTime,
      status: `Cleaning up ${orphanedIncludes.length} orphaned entries...`
    });

    for (const orphaned of orphanedIncludes) {
      try {
        // Remove macro-vars entry
        await storage.delete(`macro-vars:${orphaned.localId}`);

        // Remove macro-cache entry
        await storage.delete(`macro-cache:${orphaned.localId}`);

        orphanedEntriesRemoved++;
        console.log(`🗑️ Removed orphaned entries for localId ${orphaned.localId}`);
      } catch (err) {
        console.error(`Error removing orphaned entry ${orphaned.localId}:`, err);
      }
    }

    // Final progress update
    await storage.set(`progress:${progressId}`, {
      phase: 'complete',
      total: totalIncludes,
      processed: totalIncludes,
      percent: 100,
      startTime,
      endTime: Date.now(),
      status: 'Complete!'
    });

    console.log(`✅ Check complete: ${activeIncludes.length} active, ${orphanedIncludes.length} orphaned, ${brokenReferences.length} broken references, ${staleIncludes.length} stale`);

    // Clean up progress data after a delay (frontend will have time to read it)
    setTimeout(async () => {
      try {
        await storage.delete(`progress:${progressId}`);
      } catch (err) {
        console.error('Error cleaning up progress data:', err);
      }
    }, 60000); // 1 minute

    return {
      success: true,
      progressId, // Return this so frontend can poll for progress
      summary: {
        totalChecked: allMacroVars.results.length,
        activeCount: activeIncludes.length,
        orphanedCount: orphanedIncludes.length,
        brokenReferenceCount: brokenReferences.length,
        staleCount: staleIncludes.length,
        orphanedEntriesRemoved
      },
      activeIncludes,
      orphanedIncludes,
      brokenReferences,
      staleIncludes
    };

  } catch (error) {
    console.error('Error in checkAllIncludes:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        totalChecked: 0,
        activeCount: 0,
        orphanedCount: 0,
        brokenReferenceCount: 0,
        staleCount: 0,
        orphanedEntriesRemoved: 0
      },
      activeIncludes: [],
      orphanedIncludes: [],
      brokenReferences: [],
      staleIncludes: []
    };
  }
});

// Get progress for checkAllIncludes operation
resolver.define('getCheckProgress', getCheckProgressResolver);

// ============================================================================
// MIGRATION RESOLVERS (Phase 4 modularization)
// ⚠️ ONE-TIME USE ONLY - DELETE ENTIRE SECTION AFTER PRODUCTION MIGRATION ⚠️
// ============================================================================
// These are one-time use functions for migrating from MultiExcerpt to SmartExcerpt
// Will be used ONCE during initial production setup, then this entire section can be deleted
// See migration-resolvers.js header for full deletion checklist

// Import from MultiExcerpt and create SmartExcerpt (ONE-TIME USE)
resolver.define('importFromMultiExcerpt', importFromMultiExcerptResolver);

// Track migration status manually (ONE-TIME USE)
resolver.define('trackMigration', trackMigrationResolver);

// Get migration status (ONE-TIME USE)
resolver.define('getMigrationStatus', getMigrationStatusResolver);

// Scan for old MultiExcerpt Include macros (ONE-TIME USE)
resolver.define('scanMultiExcerptIncludes', scanMultiExcerptIncludesResolver);

// Get progress for scanMultiExcerptIncludes operation (ONE-TIME USE)
resolver.define('getMultiExcerptScanProgress', getMultiExcerptScanProgressResolver);

// Bulk import MultiExcerpt Sources from JSON export (ONE-TIME USE)
resolver.define('bulkImportSources', bulkImportSourcesResolver);

// Create Source macros on a Confluence page for migrated excerpts (ONE-TIME USE)
resolver.define('createSourceMacrosOnPage', createSourceMacrosOnPageResolver);

// Convert MultiExcerpt macros to SmartExcerpt macros on a page (ONE-TIME USE)
resolver.define('convertMultiExcerptsOnPage', convertMultiExcerptsOnPageResolver);

// Bulk initialize all excerpts with hardcoded name-UUID mappings (ONE-TIME USE)
resolver.define('bulkInitializeAllExcerpts', bulkInitializeAllExcerptsResolver);

// ============================================================================
// END OF MIGRATION RESOLVERS - DELETE ABOVE SECTION AFTER PRODUCTION MIGRATION
// ============================================================================

// Save categories to storage
resolver.define('saveCategories', saveCategoriesResolver);

// Get categories from storage
resolver.define('getCategories', getCategoriesResolver);

export const handler = resolver.getDefinitions();
