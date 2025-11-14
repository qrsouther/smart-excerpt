/**
 * Verification Resolver Functions
 *
 * This module contains all health-check and verification operations for
 * Source and Include macros. These are production features used regularly
 * to maintain data integrity and clean up orphaned entries.
 *
 * Extracted during Phase 5 of index.js modularization.
 *
 * Functions:
 * - sourceHeartbeat: Update Source macro last-seen timestamp
 * - checkAllSources: Verify all Source macros exist on their pages
 * - checkAllIncludes: Comprehensive Include verification with progress tracking
 */

import { storage, startsWith } from '@forge/api';
import api, { route } from '@forge/api';
import { Queue } from '@forge/events';
import { generateUUID } from '../utils.js';
import { extractTextFromAdf } from '../utils/adf-utils.js';
import { saveVersion, restoreVersion } from '../utils/version-manager.js';
import { validateExcerptData } from '../utils/storage-validator.js';

/**
 * Helper function to extract variables from ADF content
 */
function extractVariablesFromAdf(adfDoc) {
  const variables = new Set();
  const variableRegex = /\{\{([^}]+)\}\}/g;

  const extractFromNode = (node) => {
    // Check text content
    if (node.text) {
      let match;
      while ((match = variableRegex.exec(node.text)) !== null) {
        variables.add(match[1]);
      }
    }

    // Recurse into content
    if (node.content) {
      for (const child of node.content) {
        extractFromNode(child);
      }
    }
  };

  extractFromNode(adfDoc);

  return Array.from(variables).map(name => ({
    name,
    defaultValue: '',
    description: ''
  }));
}

/**
 * Source macro heartbeat - tracks when a Source macro was last seen/active
 */
export async function sourceHeartbeat(req) {
  try {
    const { excerptId } = req.payload;

    // Load the excerpt
    const excerpt = await storage.get(`excerpt:${excerptId}`);
    if (!excerpt) {
      return { success: false, error: 'Excerpt not found' };
    }

    // Update lastSeenAt timestamp
    excerpt.lastSeenAt = new Date().toISOString();
    await storage.set(`excerpt:${excerptId}`, excerpt);

    return { success: true };
  } catch (error) {
    console.error('Error in sourceHeartbeat:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check all Sources - verify each Source macro still exists on its page
 * Also cleans up stale Include usage entries
 */
export async function checkAllSources(req) {
  const progressId = `sources-check-${Date.now()}`;

  try {
    console.log('🔍 ACTIVE CHECK: Checking all Sources against their pages...');

    // Initialize progress tracking
    await storage.set(`progress:${progressId}`, {
      phase: 'initializing',
      status: 'Loading excerpts...',
      percent: 0,
      total: 0,
      processed: 0,
      startTime: Date.now()
    });

    // Get all excerpts from the index
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    console.log('Total excerpts to check:', excerptIndex.excerpts.length);

    const orphanedSources = [];
    const checkedSources = [];
    let totalStaleEntriesRemoved = 0;
    let contentConversionsCount = 0; // Track how many Storage Format -> ADF conversions we do

    // Load all excerpts and group by page to minimize API calls
    const excerptsByPage = new Map(); // pageId -> [excerpts]
    const skippedExcerpts = [];

    await storage.set(`progress:${progressId}`, {
      phase: 'loading',
      status: 'Grouping excerpts by page...',
      percent: 10,
      total: excerptIndex.excerpts.length,
      processed: 0,
      startTime: Date.now()
    });

    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (!excerpt) continue;

      // Skip if this excerpt doesn't have page info
      if (!excerpt.sourcePageId || !excerpt.sourceLocalId) {
        console.log(`⚠️ Excerpt "${excerpt.name}" missing sourcePageId or sourceLocalId, skipping`);
        skippedExcerpts.push(excerpt.name);
        continue;
      }

      if (!excerptsByPage.has(excerpt.sourcePageId)) {
        excerptsByPage.set(excerpt.sourcePageId, []);
      }
      excerptsByPage.get(excerpt.sourcePageId).push(excerpt);
    }

    console.log(`Grouped excerpts into ${excerptsByPage.size} pages to check`);
    if (skippedExcerpts.length > 0) {
      console.log(`Skipped ${skippedExcerpts.length} excerpts with missing page info`);
    }

    await storage.set(`progress:${progressId}`, {
      phase: 'checking',
      status: `Checking ${excerptsByPage.size} pages...`,
      percent: 20,
      total: excerptIndex.excerpts.length,
      processed: 0,
      totalPages: excerptsByPage.size,
      currentPage: 0,
      startTime: Date.now()
    });

    // Check each page once
    let pageNumber = 0;
    for (const [pageId, pageExcerpts] of excerptsByPage.entries()) {
      pageNumber++;
      console.log(`Fetching page ${pageId} (${pageExcerpts.length} excerpts)...`);

      // Update progress
      const percentComplete = 20 + Math.floor((pageNumber / excerptsByPage.size) * 70);
      await storage.set(`progress:${progressId}`, {
        phase: 'checking',
        status: `Checking page ${pageNumber} of ${excerptsByPage.size}...`,
        percent: percentComplete,
        total: excerptIndex.excerpts.length,
        processed: checkedSources.length + orphanedSources.length,
        totalPages: excerptsByPage.size,
        currentPage: pageNumber,
        startTime: Date.now()
      });

      try {
        // STEP 1: Fetch in storage format for orphan detection (proven to work)
        const storageResponse = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!storageResponse.ok) {
          console.log(`❌ Page ${pageId} not accessible, marking ${pageExcerpts.length} Sources as orphaned`);
          pageExcerpts.forEach(excerpt => {
            orphanedSources.push({
              ...excerpt,
              orphanedReason: 'Source page not found or deleted'
            });
          });
          continue;
        }

        const storageData = await storageResponse.json();
        const storageBody = storageData?.body?.storage?.value || '';

        if (!storageBody) {
          console.warn(`⚠️ No storage body found for page ${pageId}`);
          pageExcerpts.forEach(excerpt => {
            orphanedSources.push({
              ...excerpt,
              orphanedReason: 'Unable to read page content'
            });
          });
          continue;
        }

        // STEP 2: Check which Sources exist on the page (string matching - works for all Sources)
        const sourcesToConvert = []; // Track Sources that need conversion

        for (const excerpt of pageExcerpts) {
          const macroExists = storageBody.includes(excerpt.sourceLocalId);

          if (!macroExists) {
            console.log(`❌ Source "${excerpt.name}" NOT found on page - ORPHANED`);
            orphanedSources.push({
              ...excerpt,
              orphanedReason: 'Macro deleted from source page'
            });
            continue;
          }

          // Source exists on page
          console.log(`✅ Source "${excerpt.name}" found on page`);
          checkedSources.push(excerpt.name);

          /*
           * ═══════════════════════════════════════════════════════════════════════
           * AUTO-CONVERSION RE-ENABLED (Phase 3 - v7.19.0)
           * ═══════════════════════════════════════════════════════════════════════
           *
           * The Storage Format (XML) → ADF JSON conversion is now SAFE with:
           *
           * ✅ Pre-conversion version snapshots (saveVersion)
           * ✅ Post-conversion validation (validateExcerptData)
           * ✅ Automatic rollback on corruption detection (restoreVersion)
           * ✅ Error handling with auto-rollback on conversion errors
           *
           * This prevents the data corruption issues that occurred in the past:
           * - Variables disappearing → Now detected by validation
           * - Content becoming malformed → Now detected by ADF structure validation
           * - Silent failures → Now logged and auto-rolled back
           *
           * Every conversion creates a version snapshot with 14-day retention.
           * If validation fails, the Source is immediately restored to its pre-conversion
           * state, and the conversion is cancelled.
           *
           * See: DATA-SAFETY-VERSIONING-PROPOSAL.md for full implementation details
           * ═══════════════════════════════════════════════════════════════════════
           */

          // Check if content needs conversion (Storage Format XML -> ADF JSON)
          const needsConversion = excerpt.content && typeof excerpt.content === 'string';
          if (needsConversion) {
            console.log(`🔄 Source "${excerpt.name}" needs Storage Format → ADF conversion (ENABLED with versioning protection)`);
            sourcesToConvert.push(excerpt);
          }
        }

        // STEP 3: If any Sources need conversion, fetch page in ADF format
        // PHASE 3 (v7.19.0): RE-ENABLED WITH VERSIONING PROTECTION
        if (sourcesToConvert.length > 0) {
          console.log(`🔄 ${sourcesToConvert.length} Sources need conversion, fetching ADF...`);

          const adfResponse = await api.asApp().requestConfluence(
            route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
            {
              headers: {
                'Accept': 'application/json'
              }
            }
          );

          if (!adfResponse.ok) {
            console.warn(`⚠️ Could not fetch ADF for page ${pageId}, skipping conversion`);
            continue;
          }

          const adfData = await adfResponse.json();
          const adfBody = adfData?.body?.atlas_doc_format?.value;

          if (!adfBody) {
            console.warn(`⚠️ No ADF body found for page ${pageId}, skipping conversion`);
            continue;
          }

          const adfDoc = typeof adfBody === 'string' ? JSON.parse(adfBody) : adfBody;

          // Find all bodiedExtension nodes
          const findExtensions = (node, extensions = []) => {
            if (node.type === 'bodiedExtension' && node.attrs?.extensionKey?.includes('blueprint-standard-source')) {
              extensions.push(node);
            }
            if (node.content) {
              for (const child of node.content) {
                findExtensions(child, extensions);
              }
            }
            return extensions;
          };

          const extensionNodes = findExtensions(adfDoc);
          console.log(`Found ${extensionNodes.length} Source macro extension nodes in ADF`);

          // Convert each Source that needs it (with versioning protection)
          for (const excerpt of sourcesToConvert) {
            const extensionNode = extensionNodes.find(node =>
              node.attrs?.localId === excerpt.sourceLocalId
            );

            if (!extensionNode || !extensionNode.content) {
              console.warn(`⚠️ Could not find ADF node for "${excerpt.name}", skipping conversion`);
              continue;
            }

            // ═══════════════════════════════════════════════════════════════════════
            // PHASE 3 VERSIONING PROTECTION
            // ═══════════════════════════════════════════════════════════════════════
            console.log(`🛡️ [PHASE 3] Creating version snapshot BEFORE converting "${excerpt.name}"...`);

            // STEP 1: Create pre-conversion version snapshot
            const versionResult = await saveVersion(
              storage,
              `excerpt:${excerpt.id}`,
              excerpt,
              {
                changeType: 'STORAGE_FORMAT_CONVERSION',
                changedBy: 'checkAllSources',
                trigger: 'automatic_conversion'
              }
            );

            if (!versionResult.success) {
              console.error(`❌ Failed to create version snapshot for "${excerpt.name}": ${versionResult.error}`);
              console.error(`⚠️ Skipping conversion for safety (cannot rollback without version snapshot)`);
              continue; // Skip conversion if we can't create backup
            }

            const backupVersionId = versionResult.versionId;
            console.log(`✅ Version snapshot created: ${backupVersionId}`);

            // STEP 2: Perform conversion
            console.log(`🔄 Converting "${excerpt.name}" from Storage Format to ADF JSON...`);

            try {
              // Extract ADF content from the bodiedExtension node
              const bodyContent = {
                type: 'doc',
                version: 1,
                content: extensionNode.content
              };

              // Extract variables from ADF content
              const variables = extractVariablesFromAdf(bodyContent);

              // Generate content hash
              const crypto = require('crypto');
              const contentHash = crypto.createHash('sha256').update(JSON.stringify(bodyContent)).digest('hex');

              // Create converted excerpt object
              const convertedExcerpt = {
                ...excerpt,
                content: bodyContent,
                variables: variables,
                contentHash: contentHash,
                updatedAt: new Date().toISOString()
              };

              // STEP 3: Post-conversion validation
              console.log(`🔍 [PHASE 3] Validating converted data for "${excerpt.name}"...`);
              const validation = validateExcerptData(convertedExcerpt);

              if (!validation.valid) {
                // VALIDATION FAILED - AUTO-ROLLBACK
                console.error(`❌ [PHASE 3] Validation FAILED for "${excerpt.name}": ${validation.errors.join(', ')}`);
                console.error(`🔄 [PHASE 3] AUTO-ROLLBACK: Restoring from version ${backupVersionId}...`);

                const rollbackResult = await restoreVersion(storage, backupVersionId);

                if (rollbackResult.success) {
                  console.error(`✅ [PHASE 3] AUTO-ROLLBACK SUCCESSFUL for "${excerpt.name}"`);
                  console.error(`⚠️ Conversion cancelled - Source remains in Storage Format`);
                } else {
                  console.error(`❌ [PHASE 3] AUTO-ROLLBACK FAILED: ${rollbackResult.error}`);
                  console.error(`⚠️ MANUAL INTERVENTION REQUIRED for "${excerpt.name}" (excerptId: ${excerpt.id})`);
                }

                continue; // Skip to next Source
              }

              // STEP 4: Validation passed - save converted data
              console.log(`✅ [PHASE 3] Validation passed for "${excerpt.name}"`);
              await storage.set(`excerpt:${excerpt.id}`, convertedExcerpt);
              console.log(`✅ Converted "${excerpt.name}" to ADF JSON (${variables.length} variables)`);
              contentConversionsCount++;

            } catch (conversionError) {
              // CONVERSION ERROR - AUTO-ROLLBACK
              console.error(`❌ [PHASE 3] Conversion ERROR for "${excerpt.name}": ${conversionError.message}`);
              console.error(`🔄 [PHASE 3] AUTO-ROLLBACK: Restoring from version ${backupVersionId}...`);

              const rollbackResult = await restoreVersion(storage, backupVersionId);

              if (rollbackResult.success) {
                console.error(`✅ [PHASE 3] AUTO-ROLLBACK SUCCESSFUL for "${excerpt.name}"`);
                console.error(`⚠️ Conversion cancelled - Source remains in Storage Format`);
              } else {
                console.error(`❌ [PHASE 3] AUTO-ROLLBACK FAILED: ${rollbackResult.error}`);
                console.error(`⚠️ MANUAL INTERVENTION REQUIRED for "${excerpt.name}" (excerptId: ${excerpt.id})`);
              }

              continue; // Skip to next Source
            }
          }
        }
      } catch (apiError) {
        console.error(`Error checking page ${pageId}:`, apiError);
        pageExcerpts.forEach(excerpt => {
          orphanedSources.push({
            ...excerpt,
            orphanedReason: `API error: ${apiError.message}`
          });
        });
      }
    }

    console.log(`✅ Source check complete: ${checkedSources.length} active, ${orphanedSources.length} orphaned`);
    if (contentConversionsCount > 0) {
      console.log(`🔄 Converted ${contentConversionsCount} Sources from Storage Format to ADF JSON`);
    }

    // Skip stale Include cleanup to avoid timeout (use "Check All Embeds" for that)
    console.log('ℹ️ Skipping stale Include cleanup (use "Check All Embeds" button for comprehensive Include verification)');
    totalStaleEntriesRemoved = 0; // Not running cleanup, so set to 0

    // Build completion status message
    let statusMessage = `Complete! ${checkedSources.length} active, ${orphanedSources.length} orphaned`;
    if (contentConversionsCount > 0) {
      statusMessage += `, ${contentConversionsCount} converted to ADF`;
    }

    // Mark as complete
    await storage.set(`progress:${progressId}`, {
      phase: 'complete',
      status: statusMessage,
      percent: 100,
      total: excerptIndex.excerpts.length,
      processed: checkedSources.length + orphanedSources.length,
      activeCount: checkedSources.length,
      orphanedCount: orphanedSources.length,
      contentConversionsCount,
      startTime: Date.now(),
      endTime: Date.now()
    });

    return {
      success: true,
      progressId,  // Return progressId for frontend polling
      orphanedSources,
      checkedCount: checkedSources.length + orphanedSources.length,
      activeCount: checkedSources.length,
      staleEntriesRemoved: totalStaleEntriesRemoved,
      contentConversionsCount
    };
  } catch (error) {
    console.error('Error in checkAllSources:', error);
    return {
      success: false,
      error: error.message,
      orphanedSources: [],
      staleEntriesRemoved: 0,
      contentConversionsCount: 0
    };
  }
}

// ============================================================================
// OLD SYNCHRONOUS CHECK ALL INCLUDES - COMMENTED OUT
// ============================================================================
// This function is being replaced by startCheckAllIncludes + async worker
// Keeping it here temporarily for reference until async version is proven stable
// TODO: Delete this entire commented section after async version is confirmed working

/*
export async function checkAllIncludes_OLD_SYNC_VERSION(req) {
  try {
    console.log('🔍 ACTIVE CHECK: Checking all Include instances...');

    // Accept progressId from frontend, or generate if not provided
    const progressId = req.payload?.progressId || generateUUID();
    const startTime = Date.now();

    // Get all macro-vars entries (each represents an Include instance)
    const allMacroVars = await storage.query().where('key', startsWith('macro-vars:')).getMany();
    const totalIncludes = allMacroVars.results.length;
    console.log('Total Include instances to check:', totalIncludes);

    // Initialize progress tracking
    await storage.set(`progress:${progressId}`, {
      phase: 'initializing',
      total: totalIncludes,
      processed: 0,
      percent: 0,
      startTime,
      status: 'Loading excerpts...'
    });

    // Get excerpt index for validation
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const existingExcerptIds = new Set(excerptIndex.excerpts.map(e => e.id));

    // Load all excerpts for metadata
    const excerptMap = new Map();
    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (excerpt) {
        excerptMap.set(excerpt.id, excerpt);
      }
    }

    const activeIncludes = [];
    const orphanedIncludes = [];
    const brokenReferences = [];
    const staleIncludes = [];
    let orphanedEntriesRemoved = 0;

    // Group includes by page to minimize API calls
    const pageMap = new Map(); // pageId -> [includes on that page]

    // Update progress
    await storage.set(`progress:${progressId}`, {
      phase: 'grouping',
      total: totalIncludes,
      processed: 0,
      percent: 5,
      startTime,
      status: 'Organizing Includes by page...'
    });

    for (const entry of allMacroVars.results) {
      const localId = entry.key.replace('macro-vars:', '');
      const macroVars = entry.value;

      // Get usage data to find which page this Include is on
      const excerptId = macroVars.excerptId;
      const usageKey = `usage:${excerptId}`;
      const usageData = await storage.get(usageKey) || { references: [] };
      const reference = usageData.references.find(ref => ref.localId === localId);

      if (!reference) {
        console.log(`⚠️ No usage reference found for localId ${localId}, marking as orphaned`);
        orphanedIncludes.push({
          localId,
          excerptId,
          reason: 'No usage tracking reference'
        });
        continue;
      }

      const pageId = reference.pageId;

      if (!pageMap.has(pageId)) {
        pageMap.set(pageId, []);
      }

      pageMap.get(pageId).push({
        localId,
        macroVars,
        reference
      });
    }

    // Update progress - grouping complete
    await storage.set(`progress:${progressId}`, {
      phase: 'checking',
      total: totalIncludes,
      processed: 0,
      percent: 10,
      startTime,
      status: `Checking ${pageMap.size} pages with Includes...`
    });

    // Check each page
    let processedIncludes = 0;
    const totalPages = pageMap.size;
    let processedPages = 0;

    for (const [pageId, includes] of pageMap.entries()) {
      try {
        // Update progress before checking page
        processedPages++;
        const percent = Math.min(10 + Math.floor((processedIncludes / totalIncludes) * 80), 95);
        await storage.set(`progress:${progressId}`, {
          phase: 'checking',
          total: totalIncludes,
          processed: processedIncludes,
          percent,
          startTime,
          currentPage: processedPages,
          totalPages,
          status: `Checking page ${processedPages}/${totalPages}...`
        });

        // Fetch page content
        const response = await api.asApp().requestConfluence(
          route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          console.log(`❌ Page ${pageId} not accessible, marking ${includes.length} Includes as orphaned`);
          includes.forEach(inc => {
            orphanedIncludes.push({
              localId: inc.localId,
              pageId,
              pageTitle: inc.reference.pageTitle,
              excerptId: inc.macroVars.excerptId,
              reason: 'Page not found or deleted'
            });
          });
          continue;
        }

        const pageData = await response.json();
        const pageBody = pageData?.body?.storage?.value || '';
        const pageTitle = pageData.title || 'Unknown Page';

        // Check each Include on this page
        for (const inc of includes) {
          const { localId, macroVars, reference } = inc;
          const excerptId = macroVars.excerptId;

          // Check if Include still exists on page
          if (!pageBody.includes(localId)) {
            console.log(`❌ Include ${localId} NOT found on page "${pageTitle}"`);
            orphanedIncludes.push({
              localId,
              pageId,
              pageTitle,
              excerptId,
              reason: 'Macro deleted from page'
            });
            continue;
          }

          // Check if excerpt still exists
          if (!existingExcerptIds.has(excerptId)) {
            console.log(`❌ Include ${localId} references non-existent excerpt ${excerptId}`);
            brokenReferences.push({
              localId,
              pageId,
              pageTitle,
              excerptId,
              reason: 'Referenced excerpt deleted'
            });
            continue;
          }

          // Get excerpt details
          const excerpt = excerptMap.get(excerptId);
          if (!excerpt) {
            console.log(`⚠️ Excerpt ${excerptId} not in map, skipping`);
            continue;
          }

          // Check staleness
          const excerptLastModified = new Date(excerpt.updatedAt || 0);
          const includeLastSynced = macroVars.lastSynced ? new Date(macroVars.lastSynced) : new Date(0);
          const isStale = excerptLastModified > includeLastSynced;

          // Generate rendered content for export
          let renderedContent = '';
          try {
            let content = excerpt.content;
            const isAdf = content && typeof content === 'object' && content.type === 'doc';

            if (isAdf) {
              // For ADF, extract plain text (simplified)
              renderedContent = extractTextFromAdf(content);
            } else {
              renderedContent = content || '';
            }

            // Perform variable substitution
            if (macroVars.variableValues) {
              Object.entries(macroVars.variableValues).forEach(([varName, value]) => {
                const regex = new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
                renderedContent = renderedContent.replace(regex, value || '');
              });
            }

            // Remove toggle markers (simplified - just remove the markers themselves)
            renderedContent = renderedContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
            renderedContent = renderedContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          } catch (err) {
            console.error(`Error rendering content for ${localId}:`, err);
            renderedContent = '[Error rendering content]';
          }

          // Build complete Include data
          const includeData = {
            localId,
            pageId,
            pageTitle,
            pageUrl: `/wiki/pages/viewpage.action?pageId=${pageId}`,
            headingAnchor: reference.headingAnchor || '',
            excerptId,
            excerptName: excerpt.name,
            excerptCategory: excerpt.category || 'General',
            status: isStale ? 'stale' : 'active',
            lastSynced: macroVars.lastSynced || null,
            excerptLastModified: excerpt.updatedAt || null,
            variableValues: macroVars.variableValues || {},
            toggleStates: macroVars.toggleStates || {},
            customInsertions: macroVars.customInsertions || [],
            renderedContent: renderedContent.trim(),
            variables: excerpt.variables || [],
            toggles: excerpt.toggles || []
          };

          if (isStale) {
            staleIncludes.push(includeData);
          }

          activeIncludes.push(includeData);
          console.log(`✅ Include "${excerpt.name}" on "${pageTitle}" - ${isStale ? 'STALE' : 'UP TO DATE'}`);

          // Increment processed count
          processedIncludes++;
        }

        // Update progress after processing all Includes on this page
        processedIncludes += includes.filter(inc => !pageBody || !pageBody.includes(inc.localId) || !existingExcerptIds.has(inc.macroVars.excerptId)).length;

      } catch (apiError) {
        console.error(`Error checking page ${pageId}:`, apiError);
        includes.forEach(inc => {
          orphanedIncludes.push({
            localId: inc.localId,
            pageId,
            pageTitle: inc.reference.pageTitle,
            excerptId: inc.macroVars.excerptId,
            reason: `API error: ${apiError.message}`
          });
        });
      }
    }

    // Clean up orphaned entries
    console.log('🧹 CLEANUP: Removing orphaned Include entries...');
    await storage.set(`progress:${progressId}`, {
      phase: 'cleanup',
      total: totalIncludes,
      processed: totalIncludes,
      percent: 95,
      startTime,
      status: `Cleaning up ${orphanedIncludes.length} orphaned entries...`
    });

    for (const orphaned of orphanedIncludes) {
      try {
        // Remove macro-vars entry
        await storage.delete(`macro-vars:${orphaned.localId}`);

        // Remove macro-cache entry
        await storage.delete(`macro-cache:${orphaned.localId}`);

        orphanedEntriesRemoved++;
        console.log(`🗑️ Removed orphaned entries for localId ${orphaned.localId}`);
      } catch (err) {
        console.error(`Error removing orphaned entry ${orphaned.localId}:`, err);
      }
    }

    // Clean up stale usage tracking references
    console.log('🧹 CLEANUP: Removing stale usage tracking references...');
    let staleUsageReferencesRemoved = 0;

    for (const orphaned of [...orphanedIncludes, ...brokenReferences]) {
      try {
        const usageKey = `usage:${orphaned.excerptId}`;
        const usageData = await storage.get(usageKey);

        if (usageData && Array.isArray(usageData.references)) {
          const originalLength = usageData.references.length;
          usageData.references = usageData.references.filter(ref => ref.localId !== orphaned.localId);

          if (usageData.references.length < originalLength) {
            staleUsageReferencesRemoved += (originalLength - usageData.references.length);

            if (usageData.references.length > 0) {
              await storage.set(usageKey, usageData);
              console.log(`🗑️ Removed stale usage reference for localId ${orphaned.localId} from excerpt ${orphaned.excerptId}`);
            } else {
              await storage.delete(usageKey);
              console.log(`🗑️ Deleted empty usage key for excerpt ${orphaned.excerptId}`);
            }
          }
        }
      } catch (err) {
        console.error(`Error cleaning usage data for ${orphaned.excerptId}:`, err);
      }
    }

    console.log(`✅ Cleanup complete: removed ${staleUsageReferencesRemoved} stale usage references`);

    // Final progress update
    await storage.set(`progress:${progressId}`, {
      phase: 'complete',
      total: totalIncludes,
      processed: totalIncludes,
      percent: 100,
      startTime,
      endTime: Date.now(),
      status: 'Complete!'
    });

    console.log(`✅ Check complete: ${activeIncludes.length} active, ${orphanedIncludes.length} orphaned, ${brokenReferences.length} broken references, ${staleIncludes.length} stale`);

    // Clean up progress data after a delay (frontend will have time to read it)
    setTimeout(async () => {
      try {
        await storage.delete(`progress:${progressId}`);
      } catch (err) {
        console.error('Error cleaning up progress data:', err);
      }
    }, 60000); // 1 minute

    return {
      success: true,
      progressId, // Return this so frontend can poll for progress
      summary: {
        totalChecked: allMacroVars.results.length,
        activeCount: activeIncludes.length,
        orphanedCount: orphanedIncludes.length,
        brokenReferenceCount: brokenReferences.length,
        staleCount: staleIncludes.length,
        orphanedEntriesRemoved
      },
      activeIncludes,
      orphanedIncludes,
      brokenReferences,
      staleIncludes
    };

  } catch (error) {
    console.error('Error in checkAllIncludes:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        totalChecked: 0,
        activeCount: 0,
        orphanedCount: 0,
        brokenReferenceCount: 0,
        staleCount: 0,
        orphanedEntriesRemoved: 0
      },
      activeIncludes: [],
      orphanedIncludes: [],
      brokenReferences: [],
      staleIncludes: []
    };
  }
}
*/

// ============================================================================
// NEW ASYNC CHECK ALL INCLUDES - USES FORGE ASYNC EVENTS API
// ============================================================================

/**
 * Start Check All Includes - Trigger resolver for async processing
 *
 * This replaces the old synchronous checkAllIncludes function with an async
 * queue-based approach that can handle large scale operations (3,000+ Includes)
 * with real-time progress tracking.
 *
 * Architecture:
 * 1. This trigger pushes event to queue and returns immediately with jobId + progressId
 * 2. Consumer worker (src/workers/checkIncludesWorker.js) processes asynchronously
 * 3. Frontend polls getCheckProgress for real-time updates
 *
 * Returns immediately with:
 * - success: boolean
 * - jobId: string (for Async Events API job tracking)
 * - progressId: string (for progress polling via getCheckProgress)
 */
export async function startCheckAllIncludes(req) {
  try {
    // Extract dryRun parameter from request (defaults to true for safety)
    const { dryRun = true } = req.payload || {};

    console.log(`[TRIGGER] Starting Check All Includes async operation (dryRun: ${dryRun})...`);

    // Generate progressId for frontend polling
    const progressId = generateUUID();

    // Initialize progress state (queued)
    await storage.set(`progress:${progressId}`, {
      phase: 'queued',
      percent: 0,
      status: dryRun ? '🛡️ Job queued (dry-run mode)...' : 'Job queued (live mode)...',
      total: 0,
      processed: 0,
      queuedAt: new Date().toISOString(),
      dryRun
    });

    // Create queue and push event (include dryRun in payload)
    const queue = new Queue({ key: 'check-includes-queue' });
    const { jobId } = await queue.push({
      body: { progressId, dryRun }
    });

    console.log(`[TRIGGER] Job queued: jobId=${jobId}, progressId=${progressId}, dryRun=${dryRun}`);

    // Return immediately - consumer will process in background
    return {
      success: true,
      jobId,
      progressId,
      dryRun,
      message: `Check All Includes job queued successfully (${dryRun ? 'dry-run' : 'live'} mode)`
    };

  } catch (error) {
    console.error('[TRIGGER] Error starting Check All Includes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check All Includes - wrapper for backwards compatibility
 * Redirects to startCheckAllIncludes
 */
export async function checkAllIncludes(req) {
  return startCheckAllIncludes(req);
}

/**
 * Helper: Fetch all pages from a storage query cursor
 */
async function getAllKeysWithPrefix(prefix) {
  const allKeys = [];
  let cursor = await storage.query().where('key', startsWith(prefix)).getMany();

  // Add first page
  allKeys.push(...(cursor.results || []));

  // Paginate through remaining pages
  while (cursor.nextCursor) {
    cursor = await storage.query().where('key', startsWith(prefix)).cursor(cursor.nextCursor).getMany();
    allKeys.push(...(cursor.results || []));
  }

  return allKeys;
}

/**
 * Get Storage Usage - Calculate total storage used across all keys
 *
 * Forge storage limit: 250MB per app
 * Returns usage in bytes, MB, and percentage of limit
 */
export async function getStorageUsage() {
  try {
    console.log('[STORAGE-USAGE] Calculating storage usage...');

    // Query all keys from storage (with pagination)
    const allKeys = [];

    // Get excerpts (paginated)
    const excerpts = await getAllKeysWithPrefix('excerpt:');
    allKeys.push(...excerpts);
    console.log(`[STORAGE-USAGE] Found ${excerpts.length} excerpt keys`);

    // Get usage data (paginated)
    const usage = await getAllKeysWithPrefix('usage:');
    allKeys.push(...usage);
    console.log(`[STORAGE-USAGE] Found ${usage.length} usage keys`);

    // Get categories
    const categories = await getAllKeysWithPrefix('categories');
    allKeys.push(...categories);
    console.log(`[STORAGE-USAGE] Found ${categories.length} category keys`);

    // Get versions (paginated)
    const versions = await getAllKeysWithPrefix('version:');
    allKeys.push(...versions);
    console.log(`[STORAGE-USAGE] Found ${versions.length} version keys`);

    // Get deleted (recovery namespace) (paginated)
    const deleted = await getAllKeysWithPrefix('deleted:');
    allKeys.push(...deleted);
    console.log(`[STORAGE-USAGE] Found ${deleted.length} deleted keys`);

    // Get metadata keys
    const metadata = await getAllKeysWithPrefix('meta:');
    allKeys.push(...metadata);
    console.log(`[STORAGE-USAGE] Found ${metadata.length} metadata keys`);

    // Calculate total size in bytes
    let totalBytes = 0;
    const breakdown = {
      excerpts: 0,
      usage: 0,
      categories: 0,
      versions: 0,
      deleted: 0,
      metadata: 0
    };

    for (const item of allKeys) {
      const key = item.key;
      const value = item.value;

      // Calculate size: key + value (as JSON string)
      const keySize = new Blob([key]).size;
      const valueSize = new Blob([JSON.stringify(value)]).size;
      const itemSize = keySize + valueSize;

      totalBytes += itemSize;

      // Categorize
      if (key.startsWith('excerpt:')) {
        breakdown.excerpts += itemSize;
      } else if (key.startsWith('usage:')) {
        breakdown.usage += itemSize;
      } else if (key.startsWith('categories')) {
        breakdown.categories += itemSize;
      } else if (key.startsWith('version:')) {
        breakdown.versions += itemSize;
      } else if (key.startsWith('deleted:')) {
        breakdown.deleted += itemSize;
      } else if (key.startsWith('meta:')) {
        breakdown.metadata += itemSize;
      }
    }

    // Convert to MB
    const totalMB = totalBytes / (1024 * 1024);
    const limitMB = 250;
    const percentUsed = (totalMB / limitMB) * 100;

    // Convert breakdown to MB
    const breakdownMB = {
      excerpts: breakdown.excerpts / (1024 * 1024),
      usage: breakdown.usage / (1024 * 1024),
      categories: breakdown.categories / (1024 * 1024),
      versions: breakdown.versions / (1024 * 1024),
      deleted: breakdown.deleted / (1024 * 1024),
      metadata: breakdown.metadata / (1024 * 1024)
    };

    console.log(`[STORAGE-USAGE] Total: ${totalMB.toFixed(2)} MB / ${limitMB} MB (${percentUsed.toFixed(1)}%)`);
    console.log('[STORAGE-USAGE] Breakdown:', breakdownMB);

    // Count Sources (excerpts) and Embeds (usage references)
    const sourcesCount = excerpts.length;
    let embedsCount = 0;

    // Count total embeds by summing all usage references
    // Usage data structure: { excerptId, references: [...] }
    for (const usageItem of usage) {
      if (usageItem.value && usageItem.value.references && Array.isArray(usageItem.value.references)) {
        embedsCount += usageItem.value.references.length;
      }
    }

    console.log(`[STORAGE-USAGE] Sources: ${sourcesCount}, Embeds: ${embedsCount}`);

    return {
      success: true,
      totalBytes,
      totalMB: parseFloat(totalMB.toFixed(2)),
      limitMB,
      percentUsed: parseFloat(percentUsed.toFixed(1)),
      keyCount: allKeys.length,
      sourcesCount,
      embedsCount,
      breakdown: {
        bytes: breakdown,
        mb: breakdownMB
      }
    };

  } catch (error) {
    console.error('[STORAGE-USAGE] Error calculating storage usage:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
