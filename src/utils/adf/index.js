/**
 * ADF Utilities - Barrel Export
 *
 * Central export point for all ADF utility functions.
 * Organized by domain for better code organization while maintaining
 * backwards compatibility with single import statements.
 *
 * Import examples:
 * - Named imports: import { cleanAdfForRenderer, filterContentByToggles } from '../utils/adf';
 * - Domain-specific: import * as cleaners from '../utils/adf/adf-cleaners';
 * - Direct: import { cleanAdfForRenderer } from '../utils/adf/adf-cleaners';
 */

// Cleaners - Document cleaning and sanitization
export {
  cleanAdfForRenderer,
  cleanupEmptyNodes
} from './adf-cleaners.js';

// Filters - Toggle-based conditional content filtering
export {
  filterContentByToggles,
  stripToggleMarkers,
  extractTextWithToggleMarkers
} from './adf-filters.js';

// Transformers - Content transformation and injection
export {
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from './adf-transformers.js';

// Extractors - Content extraction and specialized rendering
export {
  extractParagraphsFromAdf,
  renderContentWithGhostToggles
} from './adf-extractors.js';
