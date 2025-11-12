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
import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { findHeadingBeforeMacro } from '../utils/adf-utils.js';
import { saveVersion } from '../utils/version-manager.js';

// SAFETY: Dry-run mode configuration
// Default is true (preview mode) - must be explicitly set to false for cleanup
const DEFAULT_DRY_RUN_MODE = true;

/**
 * Soft Delete: Move data to deleted namespace instead of permanent deletion
 * Allows recovery for 90 days before automatic expiration
 */
async function softDeleteMacroVars(localId, reason, metadata = {}, dryRun = true) {
  const data = await storage.get(`macro-vars:${localId}`);

  if (data) {
    // Phase 3: Create version snapshot before soft delete (v7.17.0)
    const versionResult = await saveVersion(
      storage,
      `macro-vars:${localId}`,
      data,
      {
        changeType: 'DELETE',
        changedBy: 'checkAllIncludes',
        deletionReason: reason,
        localId: localId
      }
    );
    if (versionResult.success) {
      console.log(`[SOFT-DELETE] ✅ Version snapshot created: ${versionResult.versionId}`);
    } else {
      console.warn(`[SOFT-DELETE] ⚠️  Version snapshot failed: ${versionResult.error}`);
    }

    // Move to deleted namespace with recovery metadata
    await storage.set(`macro-vars-deleted:${localId}`, {
      ...data,
      deletedAt: new Date().toISOString(),
      deletedBy: 'checkAllIncludes',
      deletionReason: reason,
      canRecover: true,
      ...metadata
    });

    console.log(`[SOFT-DELETE] Moved macro-vars:${localId} to deleted namespace`);
    console.log(`[SOFT-DELETE] Reason: ${reason}`);
    console.log(`[SOFT-DELETE] Data can be recovered for 90 days`);
  }

  // Remove from active namespace
  if (!dryRun) {
    await storage.delete(`macro-vars:${localId}`);
    console.log(`[DELETE] Removed macro-vars:${localId} from active storage`);
  } else {
    console.log(`[DRY-RUN] Would delete macro-vars:${localId} (SKIPPED)`);
  }
}

/**
 * Soft Delete for cached content
 */
async function softDeleteMacroCache(localId, reason, dryRun = true) {
  if (!dryRun) {
    await storage.delete(`macro-cache:${localId}`);
    console.log(`[DELETE] Removed macro-cache:${localId}`);
  } else {
    console.log(`[DRY-RUN] Would delete macro-cache:${localId} (SKIPPED)`);
  }
}

/**
 * Create a full backup of all embed configurations before running destructive operations
 * @param {string} operation - The operation triggering the backup (e.g., 'checkAllIncludes')
 * @returns {string} The backupId for recovery operations
 */
async function createBackupSnapshot(operation = 'checkAllIncludes') {
  const timestamp = new Date().toISOString();
  const backupId = `backup-${timestamp}`;

  console.log(`[BACKUP] Creating full system backup...`);
  console.log(`[BACKUP] Backup ID: ${backupId}`);

  try {
    // Query all active embed configurations
    const allKeys = await storage.query()
      .where('key', startsWith('macro-vars:'))
      .getMany();

    const embedCount = allKeys.results.length;

    console.log(`[BACKUP] Found ${embedCount} embed configurations to backup`);

    // Save backup metadata
    await storage.set(`${backupId}:metadata`, {
      backupId,
      createdAt: timestamp,
      operation,
      totalEmbeds: embedCount,
      canRestore: true,
      version: '1.0'
    });

    console.log(`[BACKUP] Saved backup metadata`);

    // Save each embed configuration to backup namespace
    let savedCount = 0;
    for (const entry of allKeys.results) {
      const localId = entry.key.replace('macro-vars:', '');
      await storage.set(`${backupId}:embed:${localId}`, entry.value);
      savedCount++;

      // Log progress every 10 embeds
      if (savedCount % 10 === 0) {
        console.log(`[BACKUP] Progress: ${savedCount}/${embedCount} embeds backed up`);
      }
    }

    console.log(`[BACKUP] ✅ Backup complete: ${backupId}`);
    console.log(`[BACKUP] Backed up ${savedCount} embed configurations`);
    console.log(`[BACKUP] Backup can be used to restore data if needed`);

    return backupId;
  } catch (error) {
    console.error(`[BACKUP] ❌ Failed to create backup:`, error);
    throw new Error(`Backup creation failed: ${error.message}`);
  }
}

/**
 * Process Check All Includes operation asynchronously
 * This is the consumer function that processes queued events
 * @param {AsyncEvent} event - The async event from the queue (v2: payload is in event.body)
 * @param {Object} context - The context object with jobId, etc.
 */
export async function handler(event, context) {
  // In @forge/events v2, payload is in event.body, not event.payload
  const payload = event.payload || event.body || event;
  const { progressId, dryRun = DEFAULT_DRY_RUN_MODE } = payload;

  console.log(`[WORKER] Starting Check All Includes (progressId: ${progressId}, dryRun: ${dryRun})`);

  // CRITICAL SAFETY MESSAGE
  if (dryRun) {
    console.log(`[WORKER] 🛡️ DRY-RUN MODE ENABLED 🛡️`);
    console.log(`[WORKER] No data will be deleted. Orphaned items will be logged only.`);
    console.log(`[WORKER] This is a preview - use Clean Up to actually remove orphaned data.`);
  } else {
    console.log(`[WORKER] ⚠️ LIVE MODE - Deletions ENABLED ⚠️`);
    console.log(`[WORKER] Orphaned data will be soft-deleted and moved to recovery namespace.`);
  }

  try {
    // Phase 1: Initialize (0-5%)
    await updateProgress(progressId, {
      phase: 'initializing',
      percent: 0,
      status: dryRun ? '🛡️ DRY-RUN: Starting check (no deletions)...' : 'Starting check...',
      total: 0,
      processed: 0,
      dryRun: dryRun
    });

    // Phase 1.5: Create backup snapshot (5-10%)
    await updateProgress(progressId, {
      phase: 'backup',
      percent: 5,
      status: '💾 Creating backup snapshot...',
      total: 0,
      processed: 0,
      dryRun: dryRun
    });

    let backupId = null;
    try {
      backupId = await createBackupSnapshot('checkAllIncludes');

      await updateProgress(progressId, {
        phase: 'backup',
        percent: 10,
        status: `✅ Backup created: ${backupId.substring(0, 30)}...`,
        total: 0,
        processed: 0,
        backupId,
        dryRun: dryRun
      });
    } catch (backupError) {
      // Log backup failure but continue - don't block the check operation
      console.error(`[WORKER] ⚠️ Backup creation failed, continuing anyway:`, backupError);

      await updateProgress(progressId, {
        phase: 'backup',
        percent: 10,
        status: '⚠️ Backup failed - continuing check...',
        total: 0,
        processed: 0,
        dryRun: dryRun
      });
    }

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

    // Collect all Embed instances from ALL usage keys (not just existing Sources)
    // This ensures we clean up orphaned embeds even if their Source was deleted
    const allUsageQuery = await storage.query()
      .where('key', startsWith('usage:'))
      .getMany();

    console.log(`[WORKER] Found ${allUsageQuery.results.length} usage key(s) to check`);

    const allIncludes = [];
    const orphanedUsageKeys = []; // Track usage keys for deleted Sources

    for (const entry of allUsageQuery.results) {
      const excerptId = entry.key.replace('usage:', '');
      const usageData = entry.value;
      const references = usageData ? usageData.references || [] : [];

      // Check if this Source still exists
      const sourceExists = excerptIds.includes(excerptId);

      if (!sourceExists) {
        console.log(`[WORKER] ⚠️ Found orphaned usage key for deleted Source: ${excerptId} (${references.length} references)`);
        orphanedUsageKeys.push({ excerptId, key: entry.key, references });
      }

      // Collect all references (whether Source exists or not)
      allIncludes.push(...references);
    }

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

    console.log(`[WORKER] Found ${uniqueIncludes.length} Embed instances across ${totalPages} pages`);

    await updateProgress(progressId, {
      phase: 'collecting',
      percent: 25,
      status: `Found ${uniqueIncludes.length} Embed(s) on ${totalPages} page(s)...`,
      total: totalPages,
      processed: 0
    });

    // Phase 4: Check each page (25-95%)
    const activeIncludes = [];
    const orphanedIncludes = [];
    const brokenReferences = [];
    const repairedReferences = [];
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

            // Clean up orphaned data (using soft delete for recovery)
            await softDeleteMacroCache(include.localId, 'Page deleted or inaccessible', dryRun);
            await softDeleteMacroVars(include.localId, 'Page deleted or inaccessible', {
              pageId: include.pageId,
              pageExists: false
            }, dryRun);

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
          // Page exists - check each Embed instance
          const pageData = await response.json();
          const adfContent = JSON.parse(pageData.body?.atlas_doc_format?.value || '{}');

          // Construct page URL for CSV export
          const pageUrl = pageData._links?.webui ? `/wiki${pageData._links.webui}` : null;

          for (const include of pageIncludes) {
            // Check if this localId exists in the ADF
            const macroExists = checkMacroExistsInADF(adfContent, include.localId);

            if (!macroExists) {
              console.log(`[WORKER] ⚠️ ORPHAN DETECTED: localId ${include.localId} not found in page ${include.pageId}`);

              orphanedIncludes.push({
                ...include,
                reason: 'Macro not found in page content',
                pageExists: true
              });

              // Clean up orphaned data (using soft delete for recovery)
              await softDeleteMacroCache(include.localId, 'Macro not found in page content', dryRun);
              await softDeleteMacroVars(include.localId, 'Macro not found in page content', {
                pageId: include.pageId,
                pageTitle: pageData.title,
                pageExists: true
              }, dryRun);

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
              console.log(`[CHECK-MACRO] Checking excerptId for localId ${include.localId}: ${excerptId}`);

              if (!excerptId) {
                console.log(`[CHECK-MACRO] ⚠️ No excerptId in usage data for localId ${include.localId}`);
                console.log(`[CHECK-MACRO] 🔧 Attempting to repair from macro-vars storage...`);

                // Try to repair: read the actual excerptId from macro-vars storage
                const macroVars = await storage.get(`macro-vars:${include.localId}`);
                const actualExcerptId = macroVars?.excerptId;

                if (!actualExcerptId) {
                  console.log(`[CHECK-MACRO] ❌ BROKEN: No excerptId found in macro-vars either - truly broken`);
                  brokenReferences.push({
                    ...include,
                    reason: 'No excerptId in usage data or macro-vars storage'
                  });
                } else {
                  console.log(`[CHECK-MACRO] ✅ Found excerptId in macro-vars: ${actualExcerptId}`);
                  console.log(`[CHECK-MACRO] 🔧 Repairing usage tracking...`);

                  // Verify the excerpt exists
                  const excerpt = await storage.get(`excerpt:${actualExcerptId}`);
                  if (!excerpt) {
                    console.log(`[CHECK-MACRO] ❌ BROKEN: Excerpt ${actualExcerptId} not found - orphaned reference`);
                    brokenReferences.push({
                      ...include,
                      reason: 'Referenced excerpt not found (from macro-vars)',
                      excerptId: actualExcerptId
                    });
                  } else {
                    // Update the usage tracking with the correct excerptId
                    const usageKey = `usage:${actualExcerptId}`;
                    const usageData = await storage.get(usageKey) || { excerptId: actualExcerptId, references: [] };

                    // Find and update this reference
                    const refIndex = usageData.references.findIndex(r => r.localId === include.localId);
                    if (refIndex >= 0) {
                      // Update existing reference
                      usageData.references[refIndex] = {
                        ...usageData.references[refIndex],
                        ...include,
                        excerptId: actualExcerptId,
                        updatedAt: new Date().toISOString()
                      };
                    } else {
                      // Add missing reference
                      usageData.references.push({
                        ...include,
                        excerptId: actualExcerptId,
                        updatedAt: new Date().toISOString()
                      });
                    }

                    await storage.set(usageKey, usageData);

                    console.log(`[CHECK-MACRO] ✅ REPAIRED: Updated usage tracking for localId ${include.localId} with excerptId ${actualExcerptId}`);

                    repairedReferences.push({
                      localId: include.localId,
                      pageId: include.pageId,
                      pageTitle: include.pageTitle || pageData.title,
                      excerptId: actualExcerptId,
                      excerptName: excerpt.name,
                      repairedAt: new Date().toISOString()
                    });

                    // Now continue with normal active check (use actualExcerptId as excerptId)
                    // Set excerptId for the rest of this iteration
                    include.excerptId = actualExcerptId;
                  }
                }
              }

              // Continue with normal checks if excerptId is now available (either was there or repaired)
              if (include.excerptId) {
                const excerptId = include.excerptId;
                const excerpt = await storage.get(`excerpt:${excerptId}`);
                console.log(`[CHECK-MACRO] Looking up excerpt:${excerptId} - Found: ${!!excerpt}`);

                if (!excerpt) {
                  console.log(`[CHECK-MACRO] ❌ BROKEN: Referenced excerpt ${excerptId} not found in storage for localId ${include.localId}`);
                  console.log(`[CHECK-MACRO] This usually means the Source was deleted or the usage tracking is stale`);
                  brokenReferences.push({
                    ...include,
                    reason: 'Referenced excerpt not found',
                    excerptId
                  });
                } else {
                  console.log(`[CHECK-MACRO] ✅ Excerpt "${excerpt.name}" found for localId ${include.localId}`);
                  console.log(`[CHECK-MACRO] Checking staleness...`);
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
                    pageUrl: pageUrl,
                    spaceKey: include.spaceKey,
                    headingAnchor: include.headingAnchor,
                    excerptId,
                    excerptName: excerpt.name,
                    excerptCategory: excerpt.category,
                    status: isStale ? 'Stale (update available)' : 'Active',
                    lastSynced,
                    excerptUpdated,
                    excerptLastModified: excerpt.updatedAt,
                    isStale,
                    variables: excerpt.variables || [],
                    toggles: excerpt.toggles || [],
                    variableValues: macroVars?.variableValues || {},
                    toggleStates: macroVars?.toggleStates || {},
                    customInsertions: macroVars?.customInsertions || [],
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
      repairedReferenceCount: repairedReferences.length,
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
      repairedReferences,
      staleIncludes,
      orphanedEntriesRemoved,
      backupId, // Include backup ID for potential recovery operations
      completedAt: new Date().toISOString()
    };

    // Build completion status message
    let completionStatus;
    if (dryRun) {
      const parts = [];
      if (orphanedIncludes.length > 0) parts.push(`${orphanedIncludes.length} potential orphans`);
      if (repairedReferences.length > 0) parts.push(`${repairedReferences.length} repaired`);
      completionStatus = `🛡️ DRY-RUN Complete - No data deleted${parts.length > 0 ? ` (found ${parts.join(', ')})` : ''}`;
    } else {
      const parts = [];
      if (orphanedEntriesRemoved.length > 0) parts.push(`${orphanedEntriesRemoved.length} orphaned entries cleaned`);
      if (repairedReferences.length > 0) parts.push(`${repairedReferences.length} usage tracking repaired`);
      completionStatus = `Check complete${parts.length > 0 ? ` - ${parts.join(', ')}` : ''}`;
    }

    await updateProgress(progressId, {
      phase: 'complete',
      percent: 100,
      status: completionStatus,
      total: totalPages,
      processed: totalPages,
      dryRun: dryRun,
      results: finalResults
    });

    console.log(`[WORKER] Check All Includes complete (progressId: ${progressId})`);

    if (backupId) {
      console.log(`[WORKER] 💾 Backup available for recovery: ${backupId}`);
      console.log(`[WORKER] Use restore functions if data recovery is needed`);
    }

    return {
      success: true,
      progressId,
      summary,
      backupId
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
 *
 * CRITICAL: This function determines if an embed is orphaned. False negatives
 * cause data deletion. Extensive logging added to debug search failures.
 */
function checkMacroExistsInADF(node, targetLocalId, depth = 0) {
  if (!node || typeof node !== 'object') {
    return false;
  }

  // Log search initiation (only at root level)
  if (depth === 0) {
    console.log(`[CHECK-MACRO] 🔍 Searching for localId: ${targetLocalId}`);
  }

  // Check if this node is an extension (macro)
  if (node.type === 'extension') {
    // Log EVERY extension we find for debugging
    console.log(`[CHECK-MACRO] Found extension at depth ${depth}:`, {
      extensionType: node.attrs?.extensionType,
      extensionKey: node.attrs?.extensionKey,
      localId: node.attrs?.localId,
      macroId: node.attrs?.parameters?.macroParams?.['macro-id'],
      hasLocalId: !!node.attrs?.localId
    });

    // Check for Blueprint Standard Embed macro (current name)
    // NOTE: Forge apps use full path in extensionKey like:
    // "be1ff96b-.../static/blueprint-standard-embed"
    // So we check if the key CONTAINS or ENDS WITH our macro name
    const extensionKey = node.attrs?.extensionKey || '';
    const isOurMacro = extensionKey.includes('blueprint-standard-embed') ||
                       extensionKey.includes('smart-excerpt-include') || // Legacy name
                       extensionKey.includes('blueprint-standard-embed-poc') || // POC version
                       extensionKey === 'blueprint-standard-embed' || // Exact match (just in case)
                       extensionKey === 'smart-excerpt-include' || // Exact match legacy
                       extensionKey === 'blueprint-standard-embed-poc'; // Exact match POC

    if (isOurMacro) {
      console.log(`[CHECK-MACRO] ✅ Found our embed macro (${node.attrs.extensionKey})`);

      // Check localId match
      if (node.attrs?.localId === targetLocalId) {
        console.log(`[CHECK-MACRO] ✅✅ MATCH! Found embed with localId: ${targetLocalId}`);
        return true;
      } else {
        console.log(`[CHECK-MACRO] ⚠️ localId mismatch: expected ${targetLocalId}, got ${node.attrs?.localId}`);
      }
    }

    // Also check if extensionType matches (broader check for any Confluence/Forge macro)
    if (node.attrs?.extensionType === 'com.atlassian.confluence.macro.core' ||
        node.attrs?.extensionType === 'com.atlassian.ecosystem') {
      // This is a Confluence or Forge macro - check if localId matches regardless of extensionKey
      if (node.attrs?.localId === targetLocalId) {
        console.log(`[CHECK-MACRO] ✅ Found macro with matching localId (type: ${node.attrs.extensionType})`);
        console.log(`[CHECK-MACRO] Extension key: ${node.attrs?.extensionKey}`);
        return true;
      }
    }
  }

  // Recursively check content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (checkMacroExistsInADF(child, targetLocalId, depth + 1)) {
        return true;
      }
    }
  }

  // Also check marks array (some content nests in marks)
  if (Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (checkMacroExistsInADF(mark, targetLocalId, depth + 1)) {
        return true;
      }
    }
  }

  // Log if we finished searching without finding it (only at root level)
  if (depth === 0) {
    console.log(`[CHECK-MACRO] ❌ Search complete - localId ${targetLocalId} NOT found in ADF`);
    console.log(`[CHECK-MACRO] ⚠️ WARNING: About to mark as orphaned - THIS MAY BE A FALSE POSITIVE!`);
  }

  return false;
}
