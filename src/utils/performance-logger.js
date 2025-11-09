/**
 * Performance Logger Utility
 *
 * Silent performance tracking for measuring Embed load times and optimizations.
 * Uses browser Performance API and collects metrics globally for aggregate reporting.
 *
 * Design:
 * - Silent by default (no console spam on pages with 50+ embeds)
 * - Uses native Performance API (viewable in Chrome DevTools Performance tab)
 * - Collects metrics in global registry for aggregate reporting
 * - Debug mode available for development (set PERF_DEBUG_MODE = true)
 *
 * Usage:
 * const perfLogger = new PerformanceLogger('embed-123');
 * perfLogger.mark('component-mount');
 * perfLogger.mark('data-loaded');
 * perfLogger.measure('data-loaded', 'component-mount'); // Silent, but tracked
 *
 * // View aggregate stats for all embeds on page
 * PerformanceRegistry.logAggregateSummary();
 *
 * @example
 * const logger = new PerformanceLogger(context.localId);
 * logger.mark(PERF_MILESTONES.COMPONENT_MOUNT);
 * logger.mark(PERF_MILESTONES.INTERACTIVE);
 * const duration = logger.measure(PERF_MILESTONES.INTERACTIVE, PERF_MILESTONES.COMPONENT_MOUNT);
 */

/**
 * Global registry to collect performance data from all Embed instances
 */
class PerformanceRegistryClass {
  constructor() {
    this.embeds = new Map(); // embedId -> { marks, measurements, metadata }
  }

  register(embedId, marks, measurements, metadata = {}) {
    this.embeds.set(embedId, { marks, measurements, metadata });
  }

  getStats() {
    const allEmbeds = Array.from(this.embeds.values());
    if (allEmbeds.length === 0) return null;

    // Extract time-to-interactive for each embed
    const interactiveTimes = allEmbeds
      .map(e => e.measurements['component-mount-to-interactive'])
      .filter(t => t !== undefined);

    if (interactiveTimes.length === 0) return null;

    // Calculate statistics
    const sorted = interactiveTimes.sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];

    // Find slowest embed
    let slowestEmbedId = null;
    let slowestTime = 0;
    for (const [embedId, data] of this.embeds.entries()) {
      const time = data.measurements['component-mount-to-interactive'];
      if (time > slowestTime) {
        slowestTime = time;
        slowestEmbedId = embedId;
      }
    }

    return {
      totalEmbeds: allEmbeds.length,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      slowestEmbedId,
      slowestTime: slowestTime.toFixed(2)
    };
  }

  logAggregateSummary() {
    const stats = this.getStats();
    if (!stats) {
      console.log('[PERF-SUMMARY] No performance data collected yet');
      return;
    }

    console.group('[PERF-SUMMARY] Page Performance Report');
    console.log(`📊 Total Embeds: ${stats.totalEmbeds}`);
    console.log(`⚡ Time to Interactive (avg): ${stats.avg}ms`);
    console.log(`📈 Distribution: min=${stats.min}ms, p50=${stats.p50}ms, p95=${stats.p95}ms, max=${stats.max}ms`);
    console.log(`🐌 Slowest Embed: ${stats.slowestEmbedId} (${stats.slowestTime}ms)`);
    console.groupEnd();
  }

  clear() {
    this.embeds.clear();
  }
}

// Global singleton registry
export const PerformanceRegistry = new PerformanceRegistryClass();

// Make it available globally for easy debugging in console
if (typeof window !== 'undefined') {
  window.__BLUEPRINT_PERF__ = PerformanceRegistry;
}

export class PerformanceLogger {
  constructor(embedId, verbose = PERF_DEBUG_MODE) {
    this.embedId = embedId || 'unknown';
    this.verbose = verbose; // Only log to console if debug mode enabled
    this.marks = {};
    this.measurements = {};
    this.startTime = performance.now();

    // Use native Performance API for Chrome DevTools integration
    this.nativeMarkPrefix = `embed-${this.embedId}`;

    if (this.verbose) {
      console.log(`[PERF ${this.embedId}] Logger initialized at ${this.startTime.toFixed(2)}ms`);
    }
  }

  /**
   * Record a performance mark (timestamp)
   * @param {string} label - Name for this timing point
   */
  mark(label) {
    const timestamp = performance.now();
    this.marks[label] = timestamp;

    // Also use native Performance API for Chrome DevTools visibility
    try {
      performance.mark(`${this.nativeMarkPrefix}:${label}`);
    } catch (err) {
      // Ignore errors in environments without Performance API
    }

    // Only log if verbose mode enabled
    if (this.verbose) {
      const relativeTime = timestamp - this.startTime;
      console.log(`[PERF ${this.embedId}] ✓ ${label}: +${relativeTime.toFixed(2)}ms (abs: ${timestamp.toFixed(2)}ms)`);
    }
  }

  /**
   * Measure duration between two marks
   * @param {string} endLabel - End timing point
   * @param {string} startLabel - Start timing point
   * @returns {number} Duration in milliseconds
   */
  measure(endLabel, startLabel) {
    if (!this.marks[endLabel] || !this.marks[startLabel]) {
      if (this.verbose) {
        console.warn(`[PERF ${this.embedId}] Cannot measure: missing mark(s) ${startLabel} or ${endLabel}`);
      }
      return 0;
    }

    const duration = this.marks[endLabel] - this.marks[startLabel];
    const measurementKey = `${startLabel}-to-${endLabel}`;
    this.measurements[measurementKey] = duration;

    // Use native Performance API
    try {
      performance.measure(
        `${this.nativeMarkPrefix}:${measurementKey}`,
        `${this.nativeMarkPrefix}:${startLabel}`,
        `${this.nativeMarkPrefix}:${endLabel}`
      );
    } catch (err) {
      // Ignore errors
    }

    // Only log if verbose mode enabled
    if (this.verbose) {
      console.log(`[PERF ${this.embedId}] ⏱️  ${endLabel} (from ${startLabel}): ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  /**
   * Get duration from a specific mark to now
   * @param {string} startLabel - Start timing point
   * @returns {number} Duration in milliseconds
   */
  measureFromNow(startLabel) {
    if (!this.marks[startLabel]) {
      if (this.verbose) {
        console.warn(`[PERF ${this.embedId}] Cannot measure from now: missing mark ${startLabel}`);
      }
      return 0;
    }

    const duration = performance.now() - this.marks[startLabel];

    // Only log if verbose mode enabled
    if (this.verbose) {
      console.log(`[PERF ${this.embedId}] ⏱️  Current duration from ${startLabel}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  /**
   * Get a summary of all measurements
   * @returns {Object} Summary object with all marks and measurements
   */
  getSummary() {
    return {
      embedId: this.embedId,
      marks: { ...this.marks },
      measurements: { ...this.measurements },
      totalDuration: performance.now() - this.startTime
    };
  }

  /**
   * Log a formatted summary to console (always logs, even if not verbose)
   * Use this sparingly - typically only for debugging single embeds
   */
  logSummary() {
    console.group(`[PERF ${this.embedId}] Summary`);
    console.log('Marks:', this.marks);
    console.log('Measurements:', this.measurements);
    console.log(`Total duration: ${(performance.now() - this.startTime).toFixed(2)}ms`);
    console.groupEnd();
  }

  /**
   * Register this embed's performance data with the global registry
   * Call this when the embed reaches INTERACTIVE milestone
   */
  registerWithGlobalRegistry() {
    PerformanceRegistry.register(this.embedId, this.marks, this.measurements);
  }

  /**
   * Export summary as JSON string for reporting
   * @returns {string} JSON string of performance data
   */
  exportJSON() {
    return JSON.stringify(this.getSummary(), null, 2);
  }
}

/**
 * Debug mode toggle
 * Set to true during development to enable verbose console logging
 * Set to false in production to silence individual embed logs
 */
export const PERF_DEBUG_MODE = false;

/**
 * Create a new performance logger instance
 * @param {string} embedId - Identifier for this embed instance
 * @returns {PerformanceLogger} Logger instance
 */
export function createPerformanceLogger(embedId) {
  return new PerformanceLogger(embedId, PERF_DEBUG_MODE);
}

/**
 * Standard performance milestones for Embed lifecycle
 */
export const PERF_MILESTONES = {
  COMPONENT_MOUNT: 'component-mount',
  CONFIG_LOADED: 'config-loaded',
  EXCERPT_DATA_REQUESTED: 'excerpt-data-requested',
  EXCERPT_DATA_LOADED: 'excerpt-data-loaded',
  CACHED_CONTENT_REQUESTED: 'cached-content-requested',
  CACHED_CONTENT_LOADED: 'cached-content-loaded',
  CONTENT_PROCESSED: 'content-processed',
  FIRST_RENDER: 'first-render',
  STALENESS_CHECK_START: 'staleness-check-start',
  STALENESS_CHECK_COMPLETE: 'staleness-check-complete',
  INTERACTIVE: 'interactive'
};
