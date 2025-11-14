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
import { listVersions } from '../utils/version-manager.js';

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
          console.log(`[saveVariableValues] AUTO-TRANSITION: Embed ${localId} content changed after approval`);
          console.log(`[saveVariableValues] Previous hash: ${existingConfig.approvedContentHash}`);
          console.log(`[saveVariableValues] Current hash: ${currentContentHash}`);

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

          console.log(`[saveVariableValues] ✅ Auto-transitioned Embed ${localId}: approved → needs-revision`);
        } else {
          console.log(`[saveVariableValues] Embed ${localId} approved and unchanged (contentHash match)`);
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
          console.error('Error fetching page data:', apiError);
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
      console.error('Error updating usage tracking:', trackingError);
    }

    return {
      success: true
    };
  } catch (error) {
    console.error('Error saving variable values:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
