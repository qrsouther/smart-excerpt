/**
 * Batch Coordinator for Include Macro Content Loading
 *
 * Performance optimization: Instead of each Include macro making separate network calls,
 * this coordinator collects requests for a brief window (50ms) and batches them into
 * a single getCachedContentBatch call.
 *
 * For a page with 50 macros:
 * - Without batching: 50 × 150ms = 7,500ms (7.5 seconds)
 * - With batching: 1 × 150ms = 150ms (50x faster!)
 */

import { invoke } from '@forge/bridge';

// Global batch registry
const batchRegistry = {
  pending: new Map(), // localId -> {resolve, reject, timestamp}
  timeout: null,
  isExecuting: false
};

/**
 * Request cached content for a specific localId
 * Automatically batches with other requests made within 50ms window
 *
 * @param {string} localId - The macro instance localId
 * @returns {Promise<{content, metadata}>} The cached content and metadata
 */
export function requestCachedContent(localId) {
  return new Promise((resolve, reject) => {
    // Add to pending batch
    batchRegistry.pending.set(localId, {
      resolve,
      reject,
      timestamp: Date.now()
    });

    console.log(`[BATCH-COORDINATOR] Registered ${localId}, pending count: ${batchRegistry.pending.size}`);

    // Debounce - wait for more requests
    // Use longer window (500ms) because Forge macros load sequentially, not simultaneously
    clearTimeout(batchRegistry.timeout);
    batchRegistry.timeout = setTimeout(() => {
      executeBatch();
    }, 500); // 500ms collection window to catch all macros on page
  });
}

/**
 * Execute the batched request
 * Collects all pending localIds, makes one network call, distributes results
 * ROLLING BATCH STRATEGY: If more requests arrive while executing, process them
 * in the next batch with a shorter delay (100ms instead of 500ms)
 */
async function executeBatch() {
  if (batchRegistry.isExecuting) {
    console.log('[BATCH-COORDINATOR] Already executing, will process in next batch');
    return;
  }

  if (batchRegistry.pending.size === 0) {
    console.log('[BATCH-COORDINATOR] No pending requests, skipping');
    return;
  }

  batchRegistry.isExecuting = true;

  // Snapshot the current pending requests
  const localIdsToProcess = Array.from(batchRegistry.pending.keys());
  const pendingToProcess = new Map(batchRegistry.pending);

  // Clear them immediately so new requests can be collected during execution
  batchRegistry.pending.clear();

  const startTime = Date.now();
  console.log(`[BATCH-COORDINATOR] Executing batch for ${localIdsToProcess.length} macros`);

  try {
    // Make batched network call
    const result = await invoke('getCachedContentBatch', { localIds: localIdsToProcess });

    if (!result.success) {
      throw new Error(result.error || 'Batch request failed');
    }

    const endTime = Date.now();
    console.log(`[BATCH-COORDINATOR] Batch completed in ${endTime - startTime}ms`);

    // Distribute results to waiting promises
    result.results.forEach(({ localId, success, content, metadata, error }) => {
      const pending = pendingToProcess.get(localId);
      if (pending) {
        if (success && content) {
          pending.resolve({ content, metadata });
        } else {
          pending.reject(new Error(error || 'Content not found'));
        }
      }
    });

  } catch (error) {
    console.error('[BATCH-COORDINATOR] Batch execution failed:', error);

    // Reject all pending promises from this batch
    pendingToProcess.forEach((pending, localId) => {
      pending.reject(error);
    });
  } finally {
    batchRegistry.isExecuting = false;

    // ROLLING BATCH: Check if more requests came in during execution
    if (batchRegistry.pending.size > 0) {
      console.log(`[BATCH-COORDINATOR] ${batchRegistry.pending.size} requests arrived during execution, scheduling next batch`);
      // Clear any existing timeout and schedule next batch with shorter delay (100ms)
      clearTimeout(batchRegistry.timeout);
      batchRegistry.timeout = setTimeout(() => {
        executeBatch();
      }, 100); // Much shorter window for subsequent batches
    }
  }
}

/**
 * For testing/debugging: Get current batch stats
 */
export function getBatchStats() {
  return {
    pendingCount: batchRegistry.pending.size,
    isExecuting: batchRegistry.isExecuting
  };
}
