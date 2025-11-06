/**
 * Centralized Logging Utility
 *
 * Built on the industry-standard 'debug' library (20M+ downloads/week)
 *
 * Usage in browser console:
 * - Enable all logs:          localStorage.setItem('debug', 'app:*')
 * - Enable specific category: localStorage.setItem('debug', 'app:saves')
 * - Enable multiple:          localStorage.setItem('debug', 'app:saves,app:errors')
 * - Disable all:              localStorage.setItem('debug', '')
 * - Then refresh the page
 *
 * Available namespaces:
 * - app:saves       - Save operations (auto-save, cache updates)
 * - app:errors      - Error conditions and failures
 * - app:queries     - React Query operations
 * - app:cache       - Cache operations (hits, misses, invalidation)
 * - app:verification - Source/Embed verification checks
 * - app:restore     - Backup/restore operations
 */

import debug from 'debug';

/**
 * Rate limiter wrapper to prevent console floods
 * Limits logs to maxPerSecond, then shows a suppression message
 */
const createRateLimitedLogger = (namespace, maxPerSecond = 10) => {
  const log = debug(namespace);
  let count = 0;
  let suppressed = false;

  // Reset counter every second
  setInterval(() => {
    if (suppressed && count > maxPerSecond) {
      log(`[RATE LIMIT] Suppressed ${count - maxPerSecond} logs in last second`);
    }
    count = 0;
    suppressed = false;
  }, 1000);

  return (...args) => {
    count++;
    if (count <= maxPerSecond) {
      log(...args);
    } else if (!suppressed) {
      suppressed = true;
      log('[RATE LIMIT] Too many logs, suppressing until next second...');
    }
  };
};

/**
 * Centralized logger with namespaces
 * Each namespace can be enabled/disabled independently
 */
export const logger = {
  // Save operations - limit to 5/sec to avoid floods during typing
  saves: createRateLimitedLogger('app:saves', 5),

  // Errors - always allow, no rate limit
  errors: debug('app:errors'),

  // React Query operations - limit to 10/sec
  queries: createRateLimitedLogger('app:queries', 10),

  // Cache operations - limit to 10/sec
  cache: createRateLimitedLogger('app:cache', 10),

  // Verification checks - limit to 5/sec
  verification: createRateLimitedLogger('app:verification', 5),

  // Backup/restore - no rate limit needed (infrequent operations)
  restore: debug('app:restore'),
};

/**
 * Helper to log errors with context
 * Always enabled, bypasses debug toggle
 */
export const logError = (context, error, additionalData = {}) => {
  console.error(`[ERROR] ${context}:`, error);
  if (Object.keys(additionalData).length > 0) {
    console.error('[ERROR] Additional context:', additionalData);
  }
  logger.errors(context, error.message, additionalData);
};
