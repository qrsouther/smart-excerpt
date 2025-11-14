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
import { updateProgress, calculatePhaseProgress, buildCompletionMessage } from './helpers/progress-tracker.js';
import { fetchPageContent, checkMacroExistsInADF, groupIncludesByPage } from './helpers/page-scanner.js';
import { handlePageNotFound, handleOrphanedMacro, removeFromUsageTracking } from './helpers/orphan-detector.js';
import { attemptReferenceRepair, checkExcerptExists, buildRepairedRecord, buildBrokenRecord } from './helpers/reference-repairer.js';
import { createBackupSnapshot } from './helpers/backup-manager.js';
import { collectAllEmbedInstances, buildActiveIncludeRecord } from './helpers/usage-collector.js';

// SAFETY: Dry-run mode configuration
// Default is true (preview mode) - must be explicitly set to false for cleanup
const DEFAULT_DRY_RUN_MODE = true;

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

    const { uniqueIncludes, orphanedUsageKeys } = await collectAllEmbedInstances(excerptIds);

    // Group by pageId for efficient checking
    const includesByPage = groupIncludesByPage(uniqueIncludes);
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
        const pageResult = await fetchPageContent(pageId);

        if (!pageResult.success) {
          // Page doesn't exist or is inaccessible
          console.log(`[WORKER] ${pageResult.error}`);

          const orphaned = await handlePageNotFound(pageIncludes, pageResult.error, dryRun);
          orphanedIncludes.push(...orphaned);
          orphanedEntriesRemoved.push(...pageIncludes.map(inc => inc.localId));
        } else {
          // Page exists - check each Embed instance
          const { pageData, adfContent } = pageResult;

          for (const include of pageIncludes) {
            // Check if this localId exists in the ADF
            const macroExists = checkMacroExistsInADF(adfContent, include.localId);

            if (!macroExists) {
              const orphaned = await handleOrphanedMacro(include, pageData, dryRun);
              orphanedIncludes.push(orphaned);
              orphanedEntriesRemoved.push(include.localId);
            } else {
              // Macro exists - check if referenced excerpt exists
              await processActiveEmbed(
                include,
                pageData,
                activeIncludes,
                brokenReferences,
                repairedReferences,
                staleIncludes
              );
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
      const percent = calculatePhaseProgress(pagesProcessed, totalPages, 25, 95);

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

    const completionStatus = buildCompletionMessage(
      dryRun,
      orphanedIncludes.length,
      repairedReferences.length,
      orphanedEntriesRemoved.length
    );

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
 * Process an active Embed (macro exists on page)
 * Checks if excerpt exists, repairs broken references, and detects staleness
 */
async function processActiveEmbed(
  include,
  pageData,
  activeIncludes,
  brokenReferences,
  repairedReferences,
  staleIncludes
) {
  const excerptId = include.excerptId;
  console.log(`[CHECK-MACRO] Checking excerptId for localId ${include.localId}: ${excerptId}`);

  // Handle missing excerptId (attempt repair)
  if (!excerptId) {
    const repairResult = await attemptReferenceRepair(include);

    if (!repairResult.repaired) {
      brokenReferences.push(buildBrokenRecord(include, repairResult.error, repairResult.excerptId));
      return;
    }

    // Repair successful - update include with repaired excerptId
    include.excerptId = repairResult.excerptId;
    repairedReferences.push(
      buildRepairedRecord(
        include.localId,
        include.pageId,
        include.pageTitle || pageData.title,
        repairResult.excerptId,
        repairResult.excerpt.name
      )
    );
  }

  // Check if referenced excerpt exists
  const excerptCheck = await checkExcerptExists(include.excerptId);

  if (!excerptCheck.exists) {
    brokenReferences.push(buildBrokenRecord(include, 'Referenced excerpt not found', include.excerptId));
    return;
  }

  // Active Include - check if stale and collect metadata
  console.log(`[CHECK-MACRO] ✅ Excerpt "${excerptCheck.excerpt.name}" found for localId ${include.localId}`);
  console.log(`[CHECK-MACRO] Checking staleness...`);

  const macroVars = await storage.get(`macro-vars:${include.localId}`);
  const cacheData = await storage.get(`macro-cache:${include.localId}`);

  const activeRecord = buildActiveIncludeRecord(
    include,
    pageData,
    excerptCheck.excerpt,
    macroVars,
    cacheData
  );

  activeIncludes.push(activeRecord);

  if (activeRecord.isStale) {
    staleIncludes.push(activeRecord);
  }
}
