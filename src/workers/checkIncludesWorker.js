/**
 * Check All Includes - Async Worker
 *
 * This worker processes the Check All Includes operation asynchronously using
 * Forge's Async Events API v2. It runs in the background with up to 15 minutes
 * of execution time, writing progress updates to storage as it processes.
 *
 * Architecture:
 * 1. Frontend calls startCheckAllIncludes (trigger resolver)
 * 2. Trigger pushes event to queue and returns immediately with jobId + progressId
 * 3. This worker processes the event asynchronously
 * 4. Frontend polls getCheckProgress for real-time updates
 *
 * Progress Flow:
 * - 0%: Job queued
 * - 10%: Fetching excerpts index
 * - 25%: Starting page checks
 * - 25-95%: Processing pages (incremental progress)
 * - 95%: Finalizing results
 * - 100%: Complete
 */

import { AsyncEvent } from '@forge/events';
import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { findHeadingBeforeMacro } from '../utils/adf-utils.js';

/**
 * Process Check All Includes operation asynchronously
 * This is the consumer function that processes queued events
 * @param {AsyncEvent} event - The async event from the queue (v2: payload is in event.body)
 * @param {Object} context - The context object with jobId, etc.
 */
export async function handler(event, context) {
  // In @forge/events v2, payload is in event.body, not event.payload
  const payload = event.payload || event.body || event;
  const { progressId } = payload;

  console.log(`[WORKER] Starting Check All Includes (progressId: ${progressId})`);

  try {
    // Phase 1: Initialize (0-10%)
    await updateProgress(progressId, {
      phase: 'initializing',
      percent: 0,
      status: 'Starting check...',
      total: 0,
      processed: 0
    });

    // Phase 2: Fetch excerpts index (10-15%)
    await updateProgress(progressId, {
      phase: 'fetching',
      percent: 10,
      status: 'Fetching excerpts index...',
      total: 0,
      processed: 0
    });

    const index = await storage.get('excerpt-index') || { excerpts: [] };
    const excerptIds = index.excerpts.map(e => e.id);

    console.log(`[WORKER] Found ${excerptIds.length} excerpts to check`);

    await updateProgress(progressId, {
      phase: 'fetching',
      percent: 15,
      status: `Found ${excerptIds.length} excerpt(s)...`,
      total: 0,
      processed: 0
    });

    // Phase 3: Collect all usage data (15-25%)
    await updateProgress(progressId, {
      phase: 'collecting',
      percent: 15,
      status: 'Collecting usage data...',
      total: 0,
      processed: 0
    });

    // Collect all Include instances from all excerpts
    const allUsagePromises = excerptIds.map(async (excerptId) => {
      const usageKey = `usage:${excerptId}`;
      const usageData = await storage.get(usageKey);
      return usageData ? usageData.references || [] : [];
    });

    const allUsageArrays = await Promise.all(allUsagePromises);
    const allIncludes = allUsageArrays.flat();

    // Deduplicate by localId (in case an Include references multiple excerpts)
    const uniqueIncludes = Array.from(
      new Map(allIncludes.map(inc => [inc.localId, inc])).values()
    );

    // Group by pageId for efficient checking
    const includesByPage = {};
    uniqueIncludes.forEach(include => {
      if (!includesByPage[include.pageId]) {
        includesByPage[include.pageId] = [];
      }
      includesByPage[include.pageId].push(include);
    });

    const pageIds = Object.keys(includesByPage);
    const totalPages = pageIds.length;

    console.log(`[WORKER] Found ${uniqueIncludes.length} Include instances across ${totalPages} pages`);

    await updateProgress(progressId, {
      phase: 'collecting',
      percent: 25,
      status: `Found ${uniqueIncludes.length} Include(s) on ${totalPages} page(s)...`,
      total: totalPages,
      processed: 0
    });

    // Phase 4: Check each page (25-95%)
    const activeIncludes = [];
    const orphanedIncludes = [];
    const brokenReferences = [];
    const staleIncludes = [];
    const orphanedEntriesRemoved = [];

    let pagesProcessed = 0;

    for (const pageId of pageIds) {
      const pageIncludes = includesByPage[pageId];

      try {
        // Fetch page content to verify macro existence
        const response = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`
        );

        if (!response.ok) {
          // Page doesn't exist or is inaccessible
          console.log(`[WORKER] Page ${pageId} not found - marking all Includes as orphaned`);

          // All Includes on this page are orphaned
          for (const include of pageIncludes) {
            orphanedIncludes.push({
              ...include,
              reason: 'Page deleted or inaccessible',
              pageExists: false
            });

            // Clean up orphaned data
            await storage.delete(`macro-cache:${include.localId}`);
            await storage.delete(`macro-vars:${include.localId}`);

            // Remove from usage tracking
            const usageKey = `usage:${include.excerptId || 'unknown'}`;
            const usageData = await storage.get(usageKey);
            if (usageData) {
              usageData.references = usageData.references.filter(
                r => r.localId !== include.localId
              );
              if (usageData.references.length === 0) {
                await storage.delete(usageKey);
              } else {
                await storage.set(usageKey, usageData);
              }
              orphanedEntriesRemoved.push(include.localId);
            }
          }
        } else {
          // Page exists - check each Include instance
          const pageData = await response.json();
          const adfContent = JSON.parse(pageData.body?.atlas_doc_format?.value || '{}');

          for (const include of pageIncludes) {
            // Check if this localId exists in the ADF
            const macroExists = checkMacroExistsInADF(adfContent, include.localId);

            if (!macroExists) {
              orphanedIncludes.push({
                ...include,
                reason: 'Macro not found in page content',
                pageExists: true
              });

              // Clean up orphaned data
              await storage.delete(`macro-cache:${include.localId}`);
              await storage.delete(`macro-vars:${include.localId}`);

              // Remove from usage tracking
              const usageKey = `usage:${include.excerptId || 'unknown'}`;
              const usageData = await storage.get(usageKey);
              if (usageData) {
                usageData.references = usageData.references.filter(
                  r => r.localId !== include.localId
                );
                if (usageData.references.length === 0) {
                  await storage.delete(usageKey);
                } else {
                  await storage.set(usageKey, usageData);
                }
                orphanedEntriesRemoved.push(include.localId);
              }
            } else {
              // Macro exists - check if referenced excerpt exists
              const excerptId = include.excerptId;
              if (!excerptId) {
                brokenReferences.push({
                  ...include,
                  reason: 'No excerptId in usage data'
                });
              } else {
                const excerpt = await storage.get(`excerpt:${excerptId}`);
                if (!excerpt) {
                  brokenReferences.push({
                    ...include,
                    reason: 'Referenced excerpt not found',
                    excerptId
                  });
                } else {
                  // Active Include - check if stale
                  const macroVars = await storage.get(`macro-vars:${include.localId}`);
                  const lastSynced = macroVars?.lastSynced;
                  const excerptUpdated = excerpt.updatedAt;

                  const isStale = lastSynced && excerptUpdated &&
                                  new Date(excerptUpdated) > new Date(lastSynced);

                  // Get rendered content from cache
                  const cacheData = await storage.get(`macro-cache:${include.localId}`);
                  const renderedContent = cacheData?.content || null;

                  activeIncludes.push({
                    localId: include.localId,
                    pageId: include.pageId,
                    pageTitle: include.pageTitle || pageData.title,
                    spaceKey: include.spaceKey,
                    headingAnchor: include.headingAnchor,
                    excerptId,
                    excerptName: excerpt.name,
                    excerptCategory: excerpt.category,
                    lastSynced,
                    excerptUpdated,
                    isStale,
                    variableValues: include.variableValues || {},
                    toggleStates: include.toggleStates || {},
                    renderedContent
                  });

                  if (isStale) {
                    staleIncludes.push(activeIncludes[activeIncludes.length - 1]);
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`[WORKER] Error checking page ${pageId}:`, error);
        // Mark all Includes on this page as orphaned due to error
        for (const include of pageIncludes) {
          orphanedIncludes.push({
            ...include,
            reason: `Error checking page: ${error.message}`,
            pageExists: false
          });
        }
      }

      // Update progress
      pagesProcessed++;
      const percent = 25 + Math.floor((pagesProcessed / totalPages) * 70); // 25-95%

      await updateProgress(progressId, {
        phase: 'processing',
        percent,
        status: `Checked page ${pagesProcessed}/${totalPages}...`,
        total: totalPages,
        processed: pagesProcessed
      });

      console.log(`[WORKER] Processed page ${pagesProcessed}/${totalPages} (${percent}%)`);
    }

    // Phase 5: Finalize results (95-100%)
    await updateProgress(progressId, {
      phase: 'finalizing',
      percent: 95,
      status: 'Finalizing results...',
      total: totalPages,
      processed: totalPages
    });

    const summary = {
      totalChecked: uniqueIncludes.length,
      activeCount: activeIncludes.length,
      orphanedCount: orphanedIncludes.length,
      brokenReferenceCount: brokenReferences.length,
      staleCount: staleIncludes.length,
      orphanedEntriesRemoved: orphanedEntriesRemoved.length,
      pagesChecked: totalPages
    };

    console.log(`[WORKER] Check complete:`, summary);

    // Phase 6: Store final results and mark complete (100%)
    const finalResults = {
      summary,
      activeIncludes,
      orphanedIncludes,
      brokenReferences,
      staleIncludes,
      orphanedEntriesRemoved,
      completedAt: new Date().toISOString()
    };

    await updateProgress(progressId, {
      phase: 'complete',
      percent: 100,
      status: 'Check complete!',
      total: totalPages,
      processed: totalPages,
      results: finalResults
    });

    console.log(`[WORKER] Check All Includes complete (progressId: ${progressId})`);

    return {
      success: true,
      progressId,
      summary
    };

  } catch (error) {
    console.error(`[WORKER] Fatal error in Check All Includes:`, error);

    await updateProgress(progressId, {
      phase: 'error',
      percent: 0,
      status: `Error: ${error.message}`,
      total: 0,
      processed: 0,
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      progressId
    };
  }
}

/**
 * Helper: Update progress in storage
 */
async function updateProgress(progressId, progressData) {
  await storage.set(`progress:${progressId}`, {
    ...progressData,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Helper: Check if a macro with given localId exists in ADF content
 * Recursively searches through ADF structure for extension nodes with matching localId
 */
function checkMacroExistsInADF(node, targetLocalId) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  // Check if this node is an extension (macro) with matching localId
  if (node.type === 'extension' &&
      node.attrs?.extensionType === 'com.atlassian.confluence.macro.core' &&
      node.attrs?.localId === targetLocalId) {
    return true;
  }

  // Recursively check content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (checkMacroExistsInADF(child, targetLocalId)) {
        return true;
      }
    }
  }

  return false;
}
