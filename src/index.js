import Resolver from '@forge/resolver';
import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from './utils.js';

// Import utility functions from modular files
import { extractTextFromAdf, findHeadingBeforeMacro } from './utils/adf-utils.js';
import { detectVariables, detectToggles } from './utils/detection-utils.js';
import { updateExcerptIndex } from './utils/storage-utils.js';
import { decodeTemplateData, storageToPlainText, cleanMultiExcerptMacros } from './utils/migration-utils.js';

// Import simple resolver functions (Phase 2 modularization)
import {
  detectVariablesFromContent as detectVariablesResolver,
  detectTogglesFromContent as detectTogglesResolver,
  getExcerpts as getExcerptsResolver,
  getExcerpt as getExcerptResolver,
  getPageTitle as getPageTitleResolver,
  getVariableValues as getVariableValuesResolver,
  getCachedContent as getCachedContentResolver,
  saveCachedContent as saveCachedContentResolver,
  getCategories as getCategoriesResolver,
  saveCategories as saveCategoriesResolver,
  getCheckProgress as getCheckProgressResolver,
  getMigrationStatus as getMigrationStatusResolver,
  getMultiExcerptScanProgress as getMultiExcerptScanProgressResolver,
  checkVersionStaleness as checkVersionStalenessResolver,
  getOrphanedUsage as getOrphanedUsageResolver
} from './resolvers/simple-resolvers.js';

// Import excerpt CRUD resolver functions (Phase 3 modularization)
import {
  saveExcerpt as saveExcerptResolver,
  updateExcerptContent as updateExcerptContentResolver,
  getAllExcerpts as getAllExcerptsResolver,
  deleteExcerpt as deleteExcerptResolver,
  updateExcerptMetadata as updateExcerptMetadataResolver,
  massUpdateExcerpts as massUpdateExcerptsResolver
} from './resolvers/excerpt-resolvers.js';

// Import verification resolver functions (Phase 5 modularization)
import {
  sourceHeartbeat as sourceHeartbeatResolver,
  checkAllSources as checkAllSourcesResolver,
  checkAllIncludes as checkAllIncludesResolver
} from './resolvers/verification-resolvers.js';

// Import usage tracking and update resolver functions (Phase 6 modularization)
import {
  trackExcerptUsage as trackExcerptUsageResolver,
  removeExcerptUsage as removeExcerptUsageResolver,
  getExcerptUsage as getExcerptUsageResolver,
  pushUpdatesToAll as pushUpdatesToAllResolver,
  pushUpdatesToPage as pushUpdatesToPageResolver
} from './resolvers/usage-resolvers.js';

// Import Include instance configuration resolver functions (Phase 7 modularization)
import {
  saveVariableValues as saveVariableValuesResolver
} from './resolvers/include-resolvers.js';

// ⚠️ ONE-TIME USE MIGRATION FUNCTIONS - DELETE AFTER PRODUCTION MIGRATION ⚠️
// Import migration resolver functions (Phase 4 modularization)
// These are one-time use functions for migrating from MultiExcerpt to SmartExcerpt
// Will be used ONCE during initial production setup, then can be safely deleted
// See migration-resolvers.js header for full deletion checklist
import {
  importFromMultiExcerpt as importFromMultiExcerptResolver,
  trackMigration as trackMigrationResolver,
  scanMultiExcerptIncludes as scanMultiExcerptIncludesResolver,
  bulkImportSources as bulkImportSourcesResolver,
  createSourceMacrosOnPage as createSourceMacrosOnPageResolver,
  convertMultiExcerptsOnPage as convertMultiExcerptsOnPageResolver,
  bulkInitializeAllExcerpts as bulkInitializeAllExcerptsResolver
} from './resolvers/migration-resolvers.js';

const resolver = new Resolver();

// Detect variables from content (for UI to call)
resolver.define('detectVariablesFromContent', detectVariablesResolver);

// Detect toggles from content (for UI to call)
resolver.define('detectTogglesFromContent', detectTogglesResolver);

// Save excerpt
resolver.define('saveExcerpt', saveExcerptResolver);

// Get all excerpts
resolver.define('getExcerpts', getExcerptsResolver);

// Get specific excerpt
resolver.define('getExcerpt', getExcerptResolver);

// Update excerpt content only (called automatically when Source macro body changes)
resolver.define('updateExcerptContent', updateExcerptContentResolver);

// Save variable values and toggle states for a specific macro instance
// We'll store this keyed by localId (unique ID for each macro instance)
resolver.define('saveVariableValues', saveVariableValuesResolver);

// Save cached rendered content for an Include instance
resolver.define('saveCachedContent', saveCachedContentResolver);

// Get cached rendered content for an Include instance (view mode)
resolver.define('getCachedContent', getCachedContentResolver);

// Check if Include instance has stale content (update available)
resolver.define('checkVersionStaleness', checkVersionStalenessResolver);

// Push updates to all Include instances of a specific excerpt (Admin function)
resolver.define('pushUpdatesToAll', pushUpdatesToAllResolver);

// Push updates to a specific page's Include instances (Admin function)
resolver.define('pushUpdatesToPage', pushUpdatesToPageResolver);

// Get page title via Confluence API
resolver.define('getPageTitle', getPageTitleResolver);

// Get variable values and toggle states for a specific macro instance
resolver.define('getVariableValues', getVariableValuesResolver);

// Get all excerpts with full details (for admin page)
resolver.define('getAllExcerpts', getAllExcerptsResolver);

// Delete an excerpt
resolver.define('deleteExcerpt', deleteExcerptResolver);

// Update excerpt metadata (name, category)
resolver.define('updateExcerptMetadata', updateExcerptMetadataResolver);

// Mass update excerpts (e.g., change category for multiple excerpts)
resolver.define('massUpdateExcerpts', massUpdateExcerptsResolver);

// Track usage of an excerpt (called when Include macro is saved)
resolver.define('trackExcerptUsage', trackExcerptUsageResolver);

// Remove usage tracking (called when Include macro is deleted)
resolver.define('removeExcerptUsage', removeExcerptUsageResolver);

// Get excerpt usage (which Include macros reference this excerpt)
resolver.define('getExcerptUsage', getExcerptUsageResolver);

// Source heartbeat: Update lastSeenAt timestamp when Source macro is rendered
resolver.define('sourceHeartbeat', sourceHeartbeatResolver);

// Get orphaned Sources (Sources that haven't checked in recently or were deleted)
// Active check: Verify each Source still exists on its page
resolver.define('checkAllSources', checkAllSourcesResolver);

// Get all orphaned usage entries (usage data for excerpts that no longer exist)
resolver.define('getOrphanedUsage', getOrphanedUsageResolver);

// Check all Include instances (verify they exist, clean up orphans, generate export data)
resolver.define('checkAllIncludes', checkAllIncludesResolver);

// Get progress for checkAllIncludes operation
resolver.define('getCheckProgress', getCheckProgressResolver);

// ============================================================================
// MIGRATION RESOLVERS (Phase 4 modularization)
// ⚠️ ONE-TIME USE ONLY - DELETE ENTIRE SECTION AFTER PRODUCTION MIGRATION ⚠️
// ============================================================================
// These are one-time use functions for migrating from MultiExcerpt to SmartExcerpt
// Will be used ONCE during initial production setup, then this entire section can be deleted
// See migration-resolvers.js header for full deletion checklist

// Import from MultiExcerpt and create SmartExcerpt (ONE-TIME USE)
resolver.define('importFromMultiExcerpt', importFromMultiExcerptResolver);

// Track migration status manually (ONE-TIME USE)
resolver.define('trackMigration', trackMigrationResolver);

// Get migration status (ONE-TIME USE)
resolver.define('getMigrationStatus', getMigrationStatusResolver);

// Scan for old MultiExcerpt Include macros (ONE-TIME USE)
resolver.define('scanMultiExcerptIncludes', scanMultiExcerptIncludesResolver);

// Get progress for scanMultiExcerptIncludes operation (ONE-TIME USE)
resolver.define('getMultiExcerptScanProgress', getMultiExcerptScanProgressResolver);

// Bulk import MultiExcerpt Sources from JSON export (ONE-TIME USE)
resolver.define('bulkImportSources', bulkImportSourcesResolver);

// Create Source macros on a Confluence page for migrated excerpts (ONE-TIME USE)
resolver.define('createSourceMacrosOnPage', createSourceMacrosOnPageResolver);

// Convert MultiExcerpt macros to SmartExcerpt macros on a page (ONE-TIME USE)
resolver.define('convertMultiExcerptsOnPage', convertMultiExcerptsOnPageResolver);

// Bulk initialize all excerpts with hardcoded name-UUID mappings (ONE-TIME USE)
resolver.define('bulkInitializeAllExcerpts', bulkInitializeAllExcerptsResolver);

// ============================================================================
// END OF MIGRATION RESOLVERS - DELETE ABOVE SECTION AFTER PRODUCTION MIGRATION
// ============================================================================

// Save categories to storage
resolver.define('saveCategories', saveCategoriesResolver);

// Get categories from storage
resolver.define('getCategories', getCategoriesResolver);

export const handler = resolver.getDefinitions();
