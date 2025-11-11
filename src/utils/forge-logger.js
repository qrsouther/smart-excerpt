/**
 * Forge Logger Utility
 *
 * Provides structured logging for Forge apps with clear success/failure indicators.
 * Makes it easy to trace execution flow and identify where operations fail.
 *
 * Part of Phase 1 Safety Patch (v7.16.0) - Data Safety & Versioning System
 *
 * Usage:
 *   import { logFunction, logSuccess, logFailure, logPhase } from './utils/forge-logger.js';
 *
 *   // Log function entry
 *   logFunction('getDeletedItems', 'START');
 *
 *   // Log phase within function
 *   logPhase('getDeletedItems', 'Querying storage', { prefix: startsWith('macro-vars-deleted:') });
 *
 *   // Log success
 *   logSuccess('getDeletedItems', 'Retrieved 15 deleted items');
 *
 *   // Log failure
 *   logFailure('getDeletedItems', 'Storage query failed', error);
 *
 * @module forge-logger
 */

/**
 * Format timestamp for log entries
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Log function entry/exit
 *
 * @param {string} functionName - Name of the function
 * @param {string} action - 'START' or 'END'
 * @param {Object} context - Optional context data
 */
export function logFunction(functionName, action, context = {}) {
  const symbol = action === 'START' ? '▶' : '◀';
  const contextStr = Object.keys(context).length > 0 ? ` | Context: ${JSON.stringify(context)}` : '';
  console.log(`[${timestamp()}] ${symbol} [${functionName}] ${action}${contextStr}`);
}

/**
 * Log a phase/step within a function
 *
 * @param {string} functionName - Name of the function
 * @param {string} phase - Description of current phase
 * @param {Object} data - Optional data associated with this phase
 */
export function logPhase(functionName, phase, data = {}) {
  const dataStr = Object.keys(data).length > 0 ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp()}] ⋯ [${functionName}] PHASE: ${phase}${dataStr}`);
}

/**
 * Log successful operation
 *
 * @param {string} functionName - Name of the function
 * @param {string} message - Success message
 * @param {Object} data - Optional data to include
 */
export function logSuccess(functionName, message, data = {}) {
  const dataStr = Object.keys(data).length > 0 ? ` | Data: ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp()}] ✅ [${functionName}] SUCCESS: ${message}${dataStr}`);
}

/**
 * Log failed operation
 *
 * @param {string} functionName - Name of the function
 * @param {string} message - Failure message
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Optional context about what was being attempted
 */
export function logFailure(functionName, message, error, context = {}) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const contextStr = Object.keys(context).length > 0 ? ` | Context: ${JSON.stringify(context)}` : '';
  console.error(`[${timestamp()}] ❌ [${functionName}] FAILURE: ${message}${contextStr}`);
  console.error(`[${timestamp()}] ❌ [${functionName}] ERROR: ${errorMsg}`);
  if (error instanceof Error && error.stack) {
    console.error(`[${timestamp()}] ❌ [${functionName}] STACK: ${error.stack}`);
  }
}

/**
 * Log warning (not failure, but noteworthy)
 *
 * @param {string} functionName - Name of the function
 * @param {string} message - Warning message
 * @param {Object} data - Optional data to include
 */
export function logWarning(functionName, message, data = {}) {
  const dataStr = Object.keys(data).length > 0 ? ` | Data: ${JSON.stringify(data)}` : '';
  console.warn(`[${timestamp()}] ⚠️  [${functionName}] WARNING: ${message}${dataStr}`);
}

/**
 * Log validation result
 *
 * @param {string} functionName - Name of the function
 * @param {string} dataType - Type of data being validated (e.g., 'excerpt', 'macro-vars')
 * @param {Object} validation - Validation result { valid: boolean, errors: string[] }
 * @param {Object} context - Optional context (e.g., { id: 'excerpt-123' })
 */
export function logValidation(functionName, dataType, validation, context = {}) {
  const contextStr = Object.keys(context).length > 0 ? ` | ${JSON.stringify(context)}` : '';

  if (validation.valid) {
    console.log(`[${timestamp()}] ✅ [${functionName}] VALIDATION PASSED: ${dataType}${contextStr}`);
  } else {
    console.error(`[${timestamp()}] ❌ [${functionName}] VALIDATION FAILED: ${dataType}${contextStr}`);
    console.error(`[${timestamp()}] ❌ [${functionName}] VALIDATION ERRORS: ${validation.errors.join(', ')}`);
  }
}

/**
 * Log data operation (read/write/delete)
 *
 * @param {string} functionName - Name of the function
 * @param {string} operation - 'READ', 'WRITE', 'DELETE'
 * @param {string} key - Storage key
 * @param {boolean} success - Whether operation succeeded
 * @param {string} error - Optional error message if failed
 */
export function logStorageOp(functionName, operation, key, success, error = null) {
  if (success) {
    console.log(`[${timestamp()}] ✅ [${functionName}] STORAGE ${operation}: ${key}`);
  } else {
    console.error(`[${timestamp()}] ❌ [${functionName}] STORAGE ${operation} FAILED: ${key}`);
    if (error) {
      console.error(`[${timestamp()}] ❌ [${functionName}] ERROR: ${error}`);
    }
  }
}

/**
 * Generate a CSV row for before/after snapshots
 *
 * @param {string} operation - Operation name (e.g., 'restoreDeletedItem')
 * @param {string} key - Storage key
 * @param {Object} beforeData - Data before operation (or null if new)
 * @param {Object} afterData - Data after operation (or null if deleted)
 * @returns {string} CSV-formatted row
 */
export function generateSnapshotCSV(operation, key, beforeData, afterData) {
  const timestamp = new Date().toISOString();
  const beforeJSON = beforeData ? JSON.stringify(beforeData).replace(/"/g, '""') : 'null';
  const afterJSON = afterData ? JSON.stringify(afterData).replace(/"/g, '""') : 'null';

  return `"${timestamp}","${operation}","${key}","${beforeJSON}","${afterJSON}"`;
}

/**
 * Log a snapshot (before/after data) to Forge logs
 * This creates a CSV-format log entry that can be extracted and used for recovery
 *
 * @param {string} functionName - Name of the function
 * @param {string} operation - Operation being performed
 * @param {string} key - Storage key being modified
 * @param {Object} before - Data before operation
 * @param {Object} after - Data after operation
 */
export function logSnapshot(functionName, operation, key, before, after) {
  const csvRow = generateSnapshotCSV(operation, key, before, after);
  console.log(`[${timestamp()}] 💾 [${functionName}] SNAPSHOT (CSV): ${csvRow}`);
}
