/**
 * Verification Resolver Functions
 *
 * This module contains all health-check and verification operations for
 * Source and Include macros. These are production features used regularly
 * to maintain data integrity and clean up orphaned entries.
 *
 * Extracted during Phase 5 of index.js modularization.
 *
 * Functions:
 * - sourceHeartbeat: Update Source macro last-seen timestamp
 * - checkAllSources: Verify all Source macros exist on their pages
 * - checkAllIncludes: Comprehensive Include verification with progress tracking
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { Queue } from '@forge/events';
import { generateUUID } from '../utils.js';
import { extractTextFromAdf } from '../utils/adf-utils.js';

/**
 * Source macro heartbeat - tracks when a Source macro was last seen/active
 */
export async function sourceHeartbeat(req) {
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
}

/**
 * Check all Sources - verify each Source macro still exists on its page
 * Also cleans up stale Include usage entries
 */
export async function checkAllSources(req) {
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
}

// ============================================================================
// OLD SYNCHRONOUS CHECK ALL INCLUDES - COMMENTED OUT
// ============================================================================
// This function is being replaced by startCheckAllIncludes + async worker
// Keeping it here temporarily for reference until async version is proven stable
// TODO: Delete this entire commented section after async version is confirmed working

/*
export async function checkAllIncludes_OLD_SYNC_VERSION(req) {
  try {
    console.log('🔍 ACTIVE CHECK: Checking all Include instances...');

    // Accept progressId from frontend, or generate if not provided
    const progressId = req.payload?.progressId || generateUUID();
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

    // Clean up stale usage tracking references
    console.log('🧹 CLEANUP: Removing stale usage tracking references...');
    let staleUsageReferencesRemoved = 0;

    for (const orphaned of [...orphanedIncludes, ...brokenReferences]) {
      try {
        const usageKey = `usage:${orphaned.excerptId}`;
        const usageData = await storage.get(usageKey);

        if (usageData && Array.isArray(usageData.references)) {
          const originalLength = usageData.references.length;
          usageData.references = usageData.references.filter(ref => ref.localId !== orphaned.localId);

          if (usageData.references.length < originalLength) {
            staleUsageReferencesRemoved += (originalLength - usageData.references.length);

            if (usageData.references.length > 0) {
              await storage.set(usageKey, usageData);
              console.log(`🗑️ Removed stale usage reference for localId ${orphaned.localId} from excerpt ${orphaned.excerptId}`);
            } else {
              await storage.delete(usageKey);
              console.log(`🗑️ Deleted empty usage key for excerpt ${orphaned.excerptId}`);
            }
          }
        }
      } catch (err) {
        console.error(`Error cleaning usage data for ${orphaned.excerptId}:`, err);
      }
    }

    console.log(`✅ Cleanup complete: removed ${staleUsageReferencesRemoved} stale usage references`);

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
}
*/

// ============================================================================
// NEW ASYNC CHECK ALL INCLUDES - USES FORGE ASYNC EVENTS API
// ============================================================================

/**
 * Start Check All Includes - Trigger resolver for async processing
 *
 * This replaces the old synchronous checkAllIncludes function with an async
 * queue-based approach that can handle large scale operations (3,000+ Includes)
 * with real-time progress tracking.
 *
 * Architecture:
 * 1. This trigger pushes event to queue and returns immediately with jobId + progressId
 * 2. Consumer worker (src/workers/checkIncludesWorker.js) processes asynchronously
 * 3. Frontend polls getCheckProgress for real-time updates
 *
 * Returns immediately with:
 * - success: boolean
 * - jobId: string (for Async Events API job tracking)
 * - progressId: string (for progress polling via getCheckProgress)
 */
export async function startCheckAllIncludes(req) {
  try {
    console.log('[TRIGGER] Starting Check All Includes async operation...');

    // Generate progressId for frontend polling
    const progressId = generateUUID();

    // Initialize progress state (queued)
    await storage.set(`progress:${progressId}`, {
      phase: 'queued',
      percent: 0,
      status: 'Job queued...',
      total: 0,
      processed: 0,
      queuedAt: new Date().toISOString()
    });

    // Create queue and push event
    const queue = new Queue({ key: 'check-includes-queue' });
    const { jobId } = await queue.push({
      body: { progressId }
    });

    console.log(`[TRIGGER] Job queued: jobId=${jobId}, progressId=${progressId}`);

    // Return immediately - consumer will process in background
    return {
      success: true,
      jobId,
      progressId,
      message: 'Check All Includes job queued successfully'
    };

  } catch (error) {
    console.error('[TRIGGER] Error starting Check All Includes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check All Includes - wrapper for backwards compatibility
 * Redirects to startCheckAllIncludes
 */
export async function checkAllIncludes(req) {
  return startCheckAllIncludes(req);
}
