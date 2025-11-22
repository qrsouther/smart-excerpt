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
  const functionStartTime = Date.now();
  try {
    const { localId, excerptId, variableValues, toggleStates, customInsertions, internalNotes, pageId: explicitPageId } = req.payload;
    
    const functionStartTime = Date.now();
    logPhase('saveVariableValues', 'Function started', { localId, startTime: new Date().toISOString() });

    const key = `macro-vars:${localId}`;
    const now = new Date().toISOString();

    // OPTIMIZATION: Load excerpt and existing config in parallel (they're independent)
    const loadStartTime = Date.now();
    const [excerpt, existingConfig] = await Promise.all([
      storage.get(`excerpt:${excerptId}`),
      storage.get(key)
    ]);
    const loadDuration = Date.now() - loadStartTime;
    logPhase('saveVariableValues', 'Excerpt and config loaded in parallel', { localId, duration: `${loadDuration}ms` });
    
    const syncedContentHash = excerpt?.contentHash || null;
    const syncedContent = excerpt?.content || null;  // Store actual Source ADF for diff view

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

    const saveConfigStartTime = Date.now();
    await storage.set(key, newConfig);
    const saveConfigDuration = Date.now() - saveConfigStartTime;
    logPhase('saveVariableValues', 'Config saved', { localId, duration: `${saveConfigDuration}ms` });

    // AUTO-TRANSITION LOGIC: Check if approved Embed content has changed
    // OPTIMIZATION: Run asynchronously in background to avoid blocking the save response
    // This status transition is not critical for the save to complete
    if (existingConfig && existingConfig.redlineStatus === 'approved' && existingConfig.approvedContentHash) {
      const autoTransitionPromise = (async () => {
        const autoTransitionStartTime = Date.now();
        try {
          // Query version system for latest contentHash
          const versionsResult = await listVersions(storage, localId);

          if (versionsResult.success && versionsResult.versions.length > 0) {
            const latestVersion = versionsResult.versions[0];
            const currentContentHash = latestVersion.contentHash;

            // Compare with approved contentHash
            if (currentContentHash !== existingConfig.approvedContentHash) {
              logPhase('saveVariableValues', 'AUTO-TRANSITION: Embed content changed after approval (async)', {
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
                changedAt: new Date().toISOString(),
                reason: 'Content modified after approval (auto-transition)'
              });

              // Update redline fields
              const updatedConfig = { ...newConfig };
              updatedConfig.redlineStatus = 'needs-revision';
              updatedConfig.statusHistory = updatedStatusHistory;

              // Save updated config with new status
              await storage.set(key, updatedConfig);
              
              const autoTransitionDuration = Date.now() - autoTransitionStartTime;
              logSuccess('saveVariableValues', `Auto-transitioned Embed ${localId}: approved → needs-revision (async)`, { duration: `${autoTransitionDuration}ms` });
            } else {
              const autoTransitionDuration = Date.now() - autoTransitionStartTime;
              logPhase('saveVariableValues', `Embed ${localId} approved and unchanged (async)`, { contentHash: existingConfig.approvedContentHash, duration: `${autoTransitionDuration}ms` });
            }
          }
        } catch (autoTransitionError) {
          const autoTransitionDuration = Date.now() - autoTransitionStartTime;
          logFailure('saveVariableValues', 'Error in auto-transition logic (async)', autoTransitionError, { localId, duration: `${autoTransitionDuration}ms` });
        }
      })();
      
      // Don't await - let auto-transition run in the background
      autoTransitionPromise.catch(error => {
        logFailure('saveVariableValues', 'Unhandled error in async auto-transition', error, { localId });
      });
    }

    // Also update usage tracking with the latest toggle states
    // This ensures toggle states are always current in the usage data
    // OPTIMIZATION: Run usage tracking asynchronously in the background to avoid blocking the save
    // This significantly improves auto-save performance (removes ~500-1500ms Confluence API call latency)
    const usageTrackingPromise = (async () => {
      const usageTrackingStartTime = Date.now();
      try {
        // Get page context - use explicit pageId if provided (from Admin page), otherwise use context
        const pageId = explicitPageId || req.context?.extension?.content?.id;
        const spaceKey = req.context?.extension?.space?.key || 'Unknown Space';

        if (pageId && excerptId && localId) {
          // Fetch page title
          let pageTitle = 'Unknown Page';
          let headingAnchor = null;

          try {
            const apiCallStartTime = Date.now();
            const response = await api.asApp().requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`);
            const pageData = await response.json();
            const apiCallDuration = Date.now() - apiCallStartTime;
            logPhase('saveVariableValues', 'Confluence API call completed (async)', { localId, duration: `${apiCallDuration}ms` });
            
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
            logFailure('saveVariableValues', 'Error fetching page data (async)', apiError, { localId, pageId });
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
          const usageTrackingDuration = Date.now() - usageTrackingStartTime;
          logSuccess('saveVariableValues', `Usage tracking updated for ${localId} (async)`, { duration: `${usageTrackingDuration}ms` });
        }
      } catch (trackingError) {
        // Don't fail the save if tracking fails
        const usageTrackingDuration = Date.now() - usageTrackingStartTime;
        logFailure('saveVariableValues', 'Error updating usage tracking (async)', trackingError, { localId, excerptId, duration: `${usageTrackingDuration}ms` });
      }
    })();
    
    // Don't await - let it run in the background
    // Fire and forget, but log if it fails
    usageTrackingPromise.catch(error => {
      logFailure('saveVariableValues', 'Unhandled error in async usage tracking', error, { localId, excerptId });
    });

    // Generate and cache rendered content server-side
    // OPTIMIZATION: Run cache generation asynchronously in the background to avoid blocking the save
    // The config is already saved, so cache generation can happen after the response is sent
    const cacheGenerationPromise = (async () => {
      const cacheGenerationStartTime = Date.now();
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
            const adfProcessingStartTime = Date.now();
            previewContent = filterContentByToggles(previewContent, toggleStates || {});
            const filterDuration = Date.now() - adfProcessingStartTime;
            logPhase('saveVariableValues', 'After filterContentByToggles', { localId, duration: `${filterDuration}ms` });
            
            const substituteStartTime = Date.now();
            previewContent = substituteVariablesInAdf(previewContent, variableValues || {});
            const substituteDuration = Date.now() - substituteStartTime;
            logPhase('saveVariableValues', 'After substituteVariablesInAdf', { localId, duration: `${substituteDuration}ms` });
            
            const customInsertStartTime = Date.now();
            previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions || []);
            const customInsertDuration = Date.now() - customInsertStartTime;
            logPhase('saveVariableValues', 'After insertCustomParagraphsInAdf', { localId, duration: `${customInsertDuration}ms` });
            
            const notesStartTime = Date.now();
            previewContent = insertInternalNotesInAdf(previewContent, internalNotes || []);
            const notesDuration = Date.now() - notesStartTime;
            logPhase('saveVariableValues', 'After insertInternalNotesInAdf', { localId, duration: `${notesDuration}ms` });
            
            const cleanStartTime = Date.now();
            previewContent = cleanAdfForRenderer(previewContent);
            const cleanDuration = Date.now() - cleanStartTime;
            logPhase('saveVariableValues', 'After cleanAdfForRenderer', { localId, duration: `${cleanDuration}ms` });
            
            const totalAdfProcessingDuration = Date.now() - adfProcessingStartTime;
            logPhase('saveVariableValues', 'ADF processing complete', { localId, totalDuration: `${totalAdfProcessingDuration}ms` });
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
        const cacheSaveStartTime = Date.now();
        const cacheKey = `macro-cache:${localId}`;
        await storage.set(cacheKey, {
          content: previewContent,
          cachedAt: now
        });
        const cacheSaveDuration = Date.now() - cacheSaveStartTime;
        const totalCacheGenerationDuration = Date.now() - cacheGenerationStartTime;
        logSuccess('saveVariableValues', `Cached content saved for ${localId}`, { 
          cachedAt: now,
          cacheSaveDuration: `${cacheSaveDuration}ms`,
          totalCacheGenerationDuration: `${totalCacheGenerationDuration}ms`
        });
      } else {
        logWarning('saveVariableValues', `No excerpt content to cache for ${localId}`);
      }

      // Also update lastSynced, syncedContentHash, and syncedContent in macro-vars
      // (This was previously done in saveCachedContent, now consolidated here)
      const varsKey = `macro-vars:${localId}`;
      const existingVars = await storage.get(varsKey) || {};
      
      // Phase 3: Create version snapshot before modification (v7.17.0)
      if (existingVars && Object.keys(existingVars).length > 0) {
        const versionStartTime = Date.now();
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
        const versionDuration = Date.now() - versionStartTime;
        if (versionResult.success) {
          logSuccess('saveVariableValues', 'Version snapshot created (async)', { versionId: versionResult.versionId, localId, duration: `${versionDuration}ms` });
        } else if (versionResult.skipped) {
          logPhase('saveVariableValues', 'Version snapshot skipped (content unchanged, async)', { localId, duration: `${versionDuration}ms` });
        } else {
          logWarning('saveVariableValues', 'Version snapshot failed (async)', { localId, error: versionResult.error, duration: `${versionDuration}ms` });
        }
      }

      existingVars.lastSynced = now;
      if (syncedContentHash !== undefined) {
        existingVars.syncedContentHash = syncedContentHash;
      }
      if (syncedContent !== undefined) {
        existingVars.syncedContent = syncedContent;
      }

      const finalUpdateStartTime = Date.now();
      await storage.set(varsKey, existingVars);
      const finalUpdateDuration = Date.now() - finalUpdateStartTime;
      const totalCacheGenerationDuration = Date.now() - cacheGenerationStartTime;
      logSuccess('saveVariableValues', `Macro-vars updated for ${localId} (async)`, { 
        duration: `${finalUpdateDuration}ms`,
        totalCacheGenerationDuration: `${totalCacheGenerationDuration}ms`
      });
      } catch (cacheError) {
        // Don't fail the save if cache generation fails
        const cacheErrorDuration = Date.now() - cacheGenerationStartTime;
        logFailure('saveVariableValues', 'Error generating and caching preview content (async)', cacheError, { localId, duration: `${cacheErrorDuration}ms` });
      }
    })();
    
    // Don't await - let cache generation run in the background
    // Fire and forget, but log if it fails
    cacheGenerationPromise.catch(error => {
      logFailure('saveVariableValues', 'Unhandled error in async cache generation', error, { localId, excerptId });
    });

    // Return immediately after saving config - don't wait for cache generation
    const totalFunctionDuration = Date.now() - functionStartTime;
    logSuccess('saveVariableValues', 'Function completed successfully (config saved, cache generation in background)', { 
      localId,
      totalDuration: `${totalFunctionDuration}ms`
    });
    
    return {
      success: true
    };
  } catch (error) {
    const totalFunctionDuration = Date.now() - functionStartTime;
    logFailure('saveVariableValues', 'Error saving variable values', error, { 
      localId: req.payload?.localId,
      duration: `${totalFunctionDuration}ms`
    });
    return {
      success: false,
      error: error.message
    };
  }
}
