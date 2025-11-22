/**
 * Embed Instance Configuration Resolver Functions
 *
 * This module contains operations for managing Embed macro instances.
 * Each Embed instance has its own configuration (variable values, toggle states,
 * custom insertions) that's stored separately from the source excerpt.
 *
 * Think of this like individual reader preferences for the same book chapter:
 * the chapter (excerpt) is the same, but each reader (Embed instance) can
 * have their own bookmarks, highlights, and notes.
 *
 * Extracted during Phase 7 of index.js modularization.
 *
 * Functions:
 * - saveVariableValues: Save Embed instance configuration
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { findHeadingBeforeMacro } from '../utils/adf-utils.js';
import { listVersions, saveVersion } from '../utils/version-manager.js';
import {
  cleanAdfForRenderer,
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf
} from '../utils/adf-rendering-utils.js';
import { logPhase, logSuccess, logWarning, logFailure } from '../utils/forge-logger.js';

/**
 * Save variable values, toggle states, and custom insertions for a specific Include instance
 * Also updates usage tracking to keep it synchronized
 */
export async function saveVariableValues(req) {
  try {
    const { localId, excerptId, variableValues, toggleStates, customInsertions, internalNotes, pageId: explicitPageId } = req.payload;

    // Get the excerpt to retrieve its current contentHash and content
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    const syncedContentHash = excerpt?.contentHash || null;
    const syncedContent = excerpt?.content || null;  // Store actual Source ADF for diff view

    const key = `macro-vars:${localId}`;
    const now = new Date().toISOString();

    // Load existing config to preserve redline fields (if any)
    const existingConfig = await storage.get(key);

    // Initialize redline fields for new Embeds
    const redlineStatus = existingConfig?.redlineStatus || 'reviewable';
    const approvedContentHash = existingConfig?.approvedContentHash || null;
    const approvedBy = existingConfig?.approvedBy || null;
    const approvedAt = existingConfig?.approvedAt || null;
    const statusHistory = existingConfig?.statusHistory || [];

    // Build the new config object
    const newConfig = {
      excerptId,
      variableValues,
      toggleStates: toggleStates || {},
      customInsertions: customInsertions || [],
      internalNotes: internalNotes || [],
      updatedAt: now,
      lastSynced: now,  // Track when this Include instance last synced with Source
      syncedContentHash,  // Store hash of the content at sync time for staleness detection
      syncedContent,  // Store Source ADF at sync time for diff comparison

      // Redline fields (initialized on first save, preserved on updates)
      redlineStatus,
      approvedContentHash,
      approvedBy,
      approvedAt,
      statusHistory,
      pageId: explicitPageId || req.context?.extension?.content?.id  // Store for redline queue
    };

    await storage.set(key, newConfig);

    // AUTO-TRANSITION LOGIC: Check if approved Embed content has changed
    if (existingConfig && existingConfig.redlineStatus === 'approved' && existingConfig.approvedContentHash) {
      // Query version system for latest contentHash
      const versionsResult = await listVersions(storage, localId);

      if (versionsResult.success && versionsResult.versions.length > 0) {
        const latestVersion = versionsResult.versions[0];
        const currentContentHash = latestVersion.contentHash;

        // Compare with approved contentHash
        if (currentContentHash !== existingConfig.approvedContentHash) {
          logPhase('saveVariableValues', 'AUTO-TRANSITION: Embed content changed after approval', {
            localId,
            previousHash: existingConfig.approvedContentHash,
            currentHash: currentContentHash
          });

          // Auto-transition status to "needs-revision"
          const updatedStatusHistory = existingConfig.statusHistory || [];
          updatedStatusHistory.push({
            status: 'needs-revision',
            previousStatus: 'approved',
            changedBy: 'system',
            changedAt: now,
            reason: 'Content modified after approval (auto-transition)'
          });

          // Update redline fields
          newConfig.redlineStatus = 'needs-revision';
          newConfig.statusHistory = updatedStatusHistory;

          // Save updated config with new status
          await storage.set(key, newConfig);

          logSuccess('saveVariableValues', `Auto-transitioned Embed ${localId}: approved → needs-revision`);
        } else {
          logPhase('saveVariableValues', `Embed ${localId} approved and unchanged`, { contentHash: existingConfig.approvedContentHash });
        }
      }
    }

    // Also update usage tracking with the latest toggle states
    // This ensures toggle states are always current in the usage data
    try {
      // Get page context - use explicit pageId if provided (from Admin page), otherwise use context
      const pageId = explicitPageId || req.context?.extension?.content?.id;
      const spaceKey = req.context?.extension?.space?.key || 'Unknown Space';

      if (pageId && excerptId && localId) {
        // Fetch page title
        let pageTitle = 'Unknown Page';
        let headingAnchor = null;

        try {
          const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`);
          const pageData = await response.json();
          pageTitle = pageData.title || 'Unknown Page';

          // Parse the ADF to find the heading above this Include macro
          if (pageData.body?.atlas_doc_format?.value) {
            const adfContent = JSON.parse(pageData.body.atlas_doc_format.value);
            const headingText = findHeadingBeforeMacro(adfContent, localId);
            // Format heading for Confluence URL anchor (spaces → hyphens)
            if (headingText) {
              headingAnchor = headingText.replace(/\s+/g, '-');
            }
          }
        } catch (apiError) {
          logFailure('saveVariableValues', 'Error fetching page data', apiError, { localId, pageId });
          pageTitle = req.context?.extension?.content?.title || 'Unknown Page';
        }

        // Update usage data
        const usageKey = `usage:${excerptId}`;
        const usageData = await storage.get(usageKey) || { excerptId, references: [] };

        const existingIndex = usageData.references.findIndex(r => r.localId === localId);

        const reference = {
          localId,
          pageId,
          pageTitle,
          spaceKey,
          headingAnchor,
          toggleStates: toggleStates || {},
          variableValues: variableValues || {},
          updatedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
          usageData.references[existingIndex] = reference;
        } else {
          usageData.references.push(reference);
        }

        await storage.set(usageKey, usageData);
      }
    } catch (trackingError) {
      // Don't fail the save if tracking fails
      logFailure('saveVariableValues', 'Error updating usage tracking', trackingError, { localId, excerptId });
    }

    // Generate and cache rendered content server-side
    // This ensures the cache is always up-to-date even if the client component unmounts
    try {
      if (excerpt && excerpt.content) {
        let previewContent = excerpt.content;
        const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

        // Debug logging to verify variable values are being passed
        logPhase('saveVariableValues', 'Generating cache', {
          localId,
          hasVariableValues: !!variableValues,
          variableCount: variableValues ? Object.keys(variableValues).length : 0,
          variableKeys: variableValues ? Object.keys(variableValues) : [],
          isAdf
        });

        if (isAdf) {
          // Process ADF content: filter toggles, substitute variables, insert custom content
          // Note: Using current (buggy) behavior to match client-side for consistency
          // TODO: Fix for GitHub issue #2 - Insert custom paragraphs BEFORE toggle filtering
          try {
            previewContent = filterContentByToggles(previewContent, toggleStates || {});
            logPhase('saveVariableValues', 'After filterContentByToggles', { localId });
            
            previewContent = substituteVariablesInAdf(previewContent, variableValues || {});
            logPhase('saveVariableValues', 'After substituteVariablesInAdf', { localId });
            
            previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions || []);
            logPhase('saveVariableValues', 'After insertCustomParagraphsInAdf', { localId });
            
            previewContent = insertInternalNotesInAdf(previewContent, internalNotes || []);
            logPhase('saveVariableValues', 'After insertInternalNotesInAdf', { localId });
            
            previewContent = cleanAdfForRenderer(previewContent);
            logPhase('saveVariableValues', 'After cleanAdfForRenderer', { localId });
          } catch (processingError) {
            logFailure('saveVariableValues', 'Error during ADF processing', processingError, {
              localId,
              step: 'ADF processing',
              hasVariableValues: !!variableValues,
              variableCount: variableValues ? Object.keys(variableValues).length : 0
            });
            // Don't re-throw - allow save to continue even if cache generation fails
            // The config will still be saved, just without cached content
            previewContent = excerpt.content; // Use original content as fallback
          }
        } else {
          // For plain text, filter toggles first
          const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
          previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
            const trimmedName = toggleName.trim();
            return (toggleStates || {})[trimmedName] === true ? content : '';
          });

          // Strip any remaining markers
          previewContent = previewContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
          previewContent = previewContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          // Then substitute variables
          const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (excerpt.variables) {
            excerpt.variables.forEach(variable => {
              const value = (variableValues || {})[variable.name] || `{{${variable.name}}}`;
              const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
              previewContent = previewContent.replace(regex, value);
            });
          }
        }

        // Save cached content
        const cacheKey = `macro-cache:${localId}`;
        await storage.set(cacheKey, {
          content: previewContent,
          cachedAt: now
        });
        
        logSuccess('saveVariableValues', `Cached content saved for ${localId}`, { cachedAt: now });
      } else {
        logWarning('saveVariableValues', `No excerpt content to cache for ${localId}`);
      }

      // Also update lastSynced, syncedContentHash, and syncedContent in macro-vars
      // (This was previously done in saveCachedContent, now consolidated here)
      const varsKey = `macro-vars:${localId}`;
      const existingVars = await storage.get(varsKey) || {};
      
      // Phase 3: Create version snapshot before modification (v7.17.0)
      if (existingVars && Object.keys(existingVars).length > 0) {
        const versionResult = await saveVersion(
          storage,
          varsKey,
          existingVars,
          {
            changeType: 'UPDATE',
            changedBy: 'saveVariableValues',
            userAccountId: req.context?.accountId,
            localId: localId
          }
        );
        if (versionResult.success) {
          logSuccess('saveVariableValues', 'Version snapshot created', { versionId: versionResult.versionId, localId });
        } else if (versionResult.skipped) {
          logPhase('saveVariableValues', 'Version snapshot skipped (content unchanged)', { localId });
        } else {
          logWarning('saveVariableValues', 'Version snapshot failed', { localId, error: versionResult.error });
        }
      }

      existingVars.lastSynced = now;
      if (syncedContentHash !== undefined) {
        existingVars.syncedContentHash = syncedContentHash;
      }
      if (syncedContent !== undefined) {
        existingVars.syncedContent = syncedContent;
      }

      await storage.set(varsKey, existingVars);
    } catch (cacheError) {
      // Don't fail the save if cache generation fails
      logFailure('saveVariableValues', 'Error generating and caching preview content', cacheError, { localId });
    }

    return {
      success: true
    };
  } catch (error) {
    logFailure('saveVariableValues', 'Error saving variable values', error, { localId: req.payload?.localId });
    return {
      success: false,
      error: error.message
    };
  }
}
