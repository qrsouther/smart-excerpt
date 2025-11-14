/**
 * Progress Tracker Module
 *
 * Handles progress tracking for async worker operations.
 * Writes progress updates to Forge storage for polling by frontend.
 *
 * Progress Flow:
 * - 0-5%: Initializing
 * - 5-10%: Creating backup
 * - 10-15%: Fetching excerpts
 * - 15-25%: Collecting usage data
 * - 25-95%: Processing pages (incremental)
 * - 95-100%: Finalizing results
 */

import { storage } from '@forge/api';

/**
 * Update progress in storage for frontend polling
 * @param {string} progressId - Unique ID for this operation
 * @param {Object} progressData - Progress data to write
 * @param {string} progressData.phase - Current phase (initializing, backup, fetching, etc.)
 * @param {number} progressData.percent - Progress percentage (0-100)
 * @param {string} progressData.status - Human-readable status message
 * @param {number} progressData.total - Total items to process
 * @param {number} progressData.processed - Items processed so far
 */
export async function updateProgress(progressId, progressData) {
  await storage.set(`progress:${progressId}`, {
    ...progressData,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Calculate percentage within a phase range
 * @param {number} current - Current item being processed
 * @param {number} total - Total items to process
 * @param {number} phaseStart - Starting percentage for this phase (e.g., 25)
 * @param {number} phaseEnd - Ending percentage for this phase (e.g., 95)
 * @returns {number} Calculated percentage
 */
export function calculatePhaseProgress(current, total, phaseStart, phaseEnd) {
  if (total === 0) return phaseStart;
  const phaseRange = phaseEnd - phaseStart;
  return phaseStart + Math.floor((current / total) * phaseRange);
}

/**
 * Build completion status message based on operation results
 * @param {boolean} dryRun - Whether this was a dry-run operation
 * @param {number} orphanedCount - Number of orphaned items found
 * @param {number} repairedCount - Number of repaired references
 * @param {number} removedCount - Number of items actually removed (live mode only)
 * @returns {string} Human-readable completion message
 */
export function buildCompletionMessage(dryRun, orphanedCount, repairedCount, removedCount) {
  if (dryRun) {
    const parts = [];
    if (orphanedCount > 0) parts.push(`${orphanedCount} potential orphans`);
    if (repairedCount > 0) parts.push(`${repairedCount} repaired`);
    return `🛡️ DRY-RUN Complete - No data deleted${parts.length > 0 ? ` (found ${parts.join(', ')})` : ''}`;
  } else {
    const parts = [];
    if (removedCount > 0) parts.push(`${removedCount} orphaned entries cleaned`);
    if (repairedCount > 0) parts.push(`${repairedCount} usage tracking repaired`);
    return `Check complete${parts.length > 0 ? ` - ${parts.join(', ')}` : ''}`;
  }
}
