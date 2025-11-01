/**
 * Migration Resolver Functions
 *
 * ⚠️ ONE-TIME USE ONLY - READY FOR DELETION AFTER PRODUCTION MIGRATION ⚠️
 *
 * This module contains all one-time migration operations for converting from
 * MultiExcerpt to SmartExcerpt. These functions will be used ONCE during the
 * initial production setup, then can be safely deleted.
 *
 * DELETION CHECKLIST (after production migration complete):
 * 1. Delete this entire file (migration-resolvers.js)
 * 2. Remove imports from index.js (lines ~41-52)
 * 3. Remove resolver registrations from index.js (lines ~1067-1091)
 * 4. Remove getMigrationStatus and getMultiExcerptScanProgress from simple-resolvers.js
 * 5. Remove migration UI code from admin-page.jsx (search for SHOW_MIGRATION_TOOLS)
 * 6. Remove migration state variables from admin-page.jsx (lines ~126-138)
 *
 * Extracted during Phase 4 of index.js modularization.
 *
 * Functions in this file (all one-time use):
 * - importFromMultiExcerpt: Create SmartExcerpt from MultiExcerpt data
 * - trackMigration: Manually track migration status
 * - scanMultiExcerptIncludes: Scan pages for old MultiExcerpt include macros
 * - bulkImportSources: Import multiple sources from JSON export
 * - createSourceMacrosOnPage: Create Source macros on a destination page
 * - convertMultiExcerptsOnPage: Convert MultiExcerpt macros to SmartExcerpt
 * - bulkInitializeAllExcerpts: Initialize all 147 excerpts with hardcoded mappings
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from '../utils.js';
import { updateExcerptIndex } from '../utils/storage-utils.js';
import { storageToPlainText, cleanMultiExcerptMacros } from '../utils/migration-utils.js';

/**
 * Import a MultiExcerpt as a SmartExcerpt
 */
export async function importFromMultiExcerpt(req) {
  try {
    const { name, storageContent, sourcePageId, sourcePageTitle, sourcePageUrl, category } = req.payload;

    // Generate new excerpt ID
    const excerptId = generateUUID();

    // Convert storage format content to plain text for display/search
    const plainTextContent = storageToPlainText(storageContent);

    // Create the new excerpt
    const excerpt = {
      id: excerptId,
      name: name,
      category: category || 'Migrated from MultiExcerpt',
      content: plainTextContent, // Plain text for display/search
      originalStorageContent: storageContent, // Preserve original XML for macro bodies
      variables: [],
      toggles: [], // MultiExcerpt doesn't have toggles
      migratedFrom: {
        originalPageId: sourcePageId,
        originalPageTitle: sourcePageTitle,
        originalPageUrl: sourcePageUrl,
        importedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to storage
    await storage.set(`excerpt:${excerptId}`, excerpt);

    // Update index
    await updateExcerptIndex(excerpt);

    console.log('MultiExcerpt imported successfully:', name);

    // Track this migration
    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };
    tracker.multiExcerpts.push({
      name,
      excerptId,
      sourcePageId,
      sourcePageTitle,
      importedAt: new Date().toISOString()
    });
    await storage.set('migration-tracker', tracker);

    return {
      success: true,
      excerptId,
      name
    };
  } catch (error) {
    console.error('Error importing MultiExcerpt:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Track a migration manually (for planning purposes)
 */
export async function trackMigration(req) {
  try {
    const { name, excerptId, sourcePageId, sourcePageTitle } = req.payload;

    const tracker = await storage.get('migration-tracker') || { multiExcerpts: [] };
    tracker.multiExcerpts.push({
      name,
      excerptId,
      sourcePageId,
      sourcePageTitle,
      trackedAt: new Date().toISOString()
    });
    await storage.set('migration-tracker', tracker);

    console.log('Migration tracked:', name);

    return {
      success: true
    };
  } catch (error) {
    console.error('Error tracking migration:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Scan for MultiExcerpt Include macros across Confluence
 */
export async function scanMultiExcerptIncludes(req) {
  try {
    const progressId = generateUUID();

    // Initialize progress tracking
    await storage.set(`progress:${progressId}`, {
      status: 'running',
      currentPage: 0,
      totalPages: 0,
      pagesScanned: 0,
      includesFound: 0,
      startedAt: new Date().toISOString()
    });

    // Start async scan (don't await)
    (async () => {
      try {
        const includes = [];
        let start = 0;
        const limit = 25;
        let hasMore = true;
        let totalResults = 0;
        let pagesScanned = 0;

        // Use CQL to search for pages with multiexcerpt-include-macro
        while (hasMore) {
          const cqlQuery = `macro = multiexcerpt-include-macro`;
          const searchUrl = route`/wiki/rest/api/content/search?cql=${cqlQuery}&start=${start}&limit=${limit}&expand=body.storage,space,version`;

          const response = await api.asApp().requestConfluence(searchUrl);
          const data = await response.json();

          totalResults = data.size || 0;
          const results = data.results || [];

          for (const page of results) {
            pagesScanned++;

            // Update progress
            await storage.set(`progress:${progressId}`, {
              status: 'running',
              currentPage: start + results.indexOf(page) + 1,
              totalPages: totalResults,
              pagesScanned,
              includesFound: includes.length,
              lastPageScanned: page.title,
              startedAt: new Date().toISOString()
            });

            const pageId = page.id;
            const pageTitle = page.title;
            const spaceKey = page.space?.key || 'Unknown';
            const storageContent = page.body?.storage?.value || '';

            // Parse storage format to find multiexcerpt-include-macro instances
            const macroRegex = /<ac:structured-macro[^>]*ac:name="multiexcerpt-include-macro"[^>]*>(.*?)<\/ac:structured-macro>/gs;
            const matches = [...storageContent.matchAll(macroRegex)];

            for (const match of matches) {
              const macroContent = match[1];

              // Extract parameters
              const nameMatch = macroContent.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
              const spaceKeyMatch = macroContent.match(/<ac:parameter ac:name="SpaceKey">([^<]*)<\/ac:parameter>/);
              const pageNameMatch = macroContent.match(/<ac:parameter ac:name="PageName">([^<]*)<\/ac:parameter>/);

              const excerptName = nameMatch ? nameMatch[1] : 'Unknown';
              const sourceSpaceKey = spaceKeyMatch ? spaceKeyMatch[1] : spaceKey;
              const sourcePageName = pageNameMatch ? pageNameMatch[1] : pageTitle;

              includes.push({
                pageId,
                pageTitle,
                spaceKey,
                excerptName,
                sourceSpaceKey,
                sourcePageName
              });
            }
          }

          start += limit;
          hasMore = results.length === limit && start < totalResults;
        }

        // Save results
        await storage.set(`scan-results:${progressId}`, { includes });

        // Mark as complete
        await storage.set(`progress:${progressId}`, {
          status: 'complete',
          totalPages: totalResults,
          pagesScanned,
          includesFound: includes.length,
          completedAt: new Date().toISOString()
        });

        console.log(`Scan complete: Found ${includes.length} includes across ${pagesScanned} pages`);

      } catch (error) {
        console.error('Error during scan:', error);
        await storage.set(`progress:${progressId}`, {
          status: 'error',
          error: error.message
        });
      }
    })();

    return {
      success: true,
      progressId
    };

  } catch (error) {
    console.error('Error starting scan:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Bulk import sources from JSON export
 */
export async function bulkImportSources(req) {
  try {
    const { sources, destinationPageId } = req.payload;

    if (!sources || !Array.isArray(sources)) {
      return {
        success: false,
        error: 'Invalid sources data'
      };
    }

    console.log(`Starting bulk import of ${sources.length} sources...`);

    const imported = [];
    const errors = [];

    for (const source of sources) {
      try {
        // Generate new excerpt ID
        const excerptId = generateUUID();

        // Convert storage format content to plain text for display/search
        const plainTextContent = storageToPlainText(source.content);

        // Variables are already detected in the JSON
        const variables = source.variables || [];

        // Create excerpt entry
        const excerpt = {
          id: excerptId,
          name: source.name,
          category: 'Migrated from MultiExcerpt',
          content: plainTextContent, // Plain text for display/search
          originalStorageContent: source.content, // Preserve original XML for macro bodies
          variables: variables,
          toggles: [], // MultiExcerpt doesn't have toggles
          sourcePageId: destinationPageId || null,
          sourceSpaceKey: null,
          sourceLocalId: null,
          migratedFrom: {
            originalPageId: source.sourcePageId,
            originalPageTitle: source.sourcePageTitle,
            originalPageUrl: source.sourcePageUrl,
            importedAt: new Date().toISOString()
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Save to storage
        await storage.set(`excerpt:${excerptId}`, excerpt);

        // Update index
        await updateExcerptIndex(excerpt);

        console.log(`Imported: ${source.name}`);
        imported.push({
          name: source.name,
          excerptId: excerptId
        });

      } catch (error) {
        console.error(`Error importing "${source.name}":`, error);
        errors.push({
          name: source.name,
          error: error.message
        });
      }
    }

    console.log(`Bulk import complete: ${imported.length} imported, ${errors.length} errors`);

    return {
      success: true,
      summary: {
        total: sources.length,
        imported: imported.length,
        errors: errors.length
      },
      imported,
      errors
    };

  } catch (error) {
    console.error('Error in bulkImportSources:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        total: 0,
        imported: 0,
        errors: 0
      },
      imported: [],
      errors: []
    };
  }
}

/**
 * Create Source macros on a Confluence page for migrated excerpts
 */
export async function createSourceMacrosOnPage(req) {
  try {
    const { pageId, category } = req.payload;

    if (!pageId) {
      return {
        success: false,
        error: 'Page ID is required'
      };
    }

    const targetCategory = category || 'Migrated from MultiExcerpt';
    console.log(`Creating Source macros on page ${pageId} for category: ${targetCategory}`);

    // Get all excerpts from the target category
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const targetExcerpts = [];

    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (excerpt && excerpt.category === targetCategory) {
        targetExcerpts.push(excerpt);
      }
    }

    if (targetExcerpts.length === 0) {
      return {
        success: false,
        error: `No excerpts found in category "${targetCategory}"`
      };
    }

    console.log(`Found ${targetExcerpts.length} excerpts to create macros for`);

    // Sort alphabetically by name
    targetExcerpts.sort((a, b) => a.name.localeCompare(b.name));

    // Fetch the destination page
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const pageData = await pageResponse.json();
    const currentContent = pageData?.body?.storage?.value || '';
    const pageVersion = pageData.version.number;

    console.log(`Current page version: ${pageVersion}`);

    // Build new content with Source macros
    let newContent = currentContent;

    // Add a separator if page already has content
    if (currentContent.trim()) {
      newContent += '\n<hr />\n<h1>Migrated MultiExcerpt Sources</h1>\n';
    } else {
      newContent = '<h1>Migrated MultiExcerpt Sources</h1>\n';
    }

    const createdMacros = [];
    const skippedMacros = [];

    // Forge app IDs (from manifest and installation)
    const appId = 'be1ff96b-d44d-4975-98d3-25b80a813bdd';
    const environmentId = 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9'; // Development environment

    for (const excerpt of targetExcerpts) {
      try {
        // Generate unique localId for this macro
        const localId = generateUUID();

        // Escape XML special characters in excerpt name for attributes
        const escapedName = (excerpt.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const escapedCategory = (excerpt.category || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // Use original storage format content if available, otherwise use plain text
        let macroBodyContent;
        if (excerpt.originalStorageContent) {
          // Clean MultiExcerpt-specific macros from the content
          const cleanedContent = cleanMultiExcerptMacros(excerpt.originalStorageContent);

          // Validate that the XML is well-formed after cleaning
          const structuredMacroOpen = (cleanedContent.match(/<ac:structured-macro/g) || []).length;
          const structuredMacroClose = (cleanedContent.match(/<\/ac:structured-macro>/g) || []).length;

          if (structuredMacroOpen !== structuredMacroClose) {
            console.warn(`Skipping excerpt "${excerpt.name}" - still has ${structuredMacroOpen} opening and ${structuredMacroClose} closing structured-macro tags after cleaning`);
            skippedMacros.push({
              name: excerpt.name,
              reason: `Malformed XML - ${structuredMacroOpen} opening, ${structuredMacroClose} closing tags (after cleaning)`
            });
            continue; // Skip this excerpt
          }

          macroBodyContent = cleanedContent;
        } else {
          macroBodyContent = `<p>${(excerpt.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
        }

        // Create heading
        newContent += `<h2>${escapedName}</h2>\n`;

        // Create Source macro in Forge ADF format
        newContent += `<ac:adf-extension><ac:adf-node type="bodied-extension">`;
        newContent += `<ac:adf-attribute key="extension-key">${appId}/${environmentId}/static/smart-excerpt-source</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="parameters">`;
        newContent += `<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="extension-id">ari:cloud:ecosystem::extension/${appId}/${environmentId}/static/smart-excerpt-source</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="extension-title">SmartExcerpt (Development)</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="layout">bodiedExtension</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="forge-environment">DEVELOPMENT</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="render">native</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="guest-params">`;
        newContent += `<ac:adf-parameter key="excerpt-id">${excerpt.id}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="excerpt-name">${escapedName}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="category">${escapedCategory}</ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="variables"><ac:adf-parameter-value /></ac:adf-parameter>`;
        newContent += `<ac:adf-parameter key="toggles"><ac:adf-parameter-value /></ac:adf-parameter>`;
        newContent += `</ac:adf-parameter>`;
        newContent += `</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="text">SmartExcerpt (Development)</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="layout">default</ac:adf-attribute>`;
        newContent += `<ac:adf-attribute key="local-id">${localId}</ac:adf-attribute>`;
        newContent += `<ac:adf-content>${macroBodyContent}</ac:adf-content>`;
        newContent += `</ac:adf-node></ac:adf-extension>\n\n`;

        // Update excerpt metadata with page info
        excerpt.sourcePageId = pageId;
        excerpt.sourceLocalId = localId;
        excerpt.updatedAt = new Date().toISOString();

        await storage.set(`excerpt:${excerpt.id}`, excerpt);

        createdMacros.push({
          name: excerpt.name,
          excerptId: excerpt.id,
          localId
        });

        console.log(`Created macro for: ${excerpt.name}`);

      } catch (macroError) {
        console.error(`Error creating macro for ${excerpt.name}:`, macroError);
      }
    }

    // Update the page with new content
    console.log('Updating page with new content...');

    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: pageId,
          status: 'current',
          title: pageData.title,
          body: {
            representation: 'storage',
            value: newContent
          },
          version: {
            number: pageVersion + 1,
            message: `Added ${createdMacros.length} SmartExcerpt Source macros`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log(`✅ Successfully created ${createdMacros.length} Source macros on page ${pageId}`);
    if (skippedMacros.length > 0) {
      console.log(`⚠️ Skipped ${skippedMacros.length} macros due to malformed XML`);
    }

    return {
      success: true,
      summary: {
        total: targetExcerpts.length,
        created: createdMacros.length,
        skipped: skippedMacros.length,
        pageId,
        pageVersion: pageVersion + 1
      },
      createdMacros,
      skippedMacros
    };

  } catch (error) {
    console.error('Error creating Source macros:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        total: 0,
        created: 0
      },
      createdMacros: []
    };
  }
}

/**
 * Convert MultiExcerpt macros to SmartExcerpt macros on a page
 */
export async function convertMultiExcerptsOnPage(req) {
  try {
    const { pageId } = req.payload;

    if (!pageId) {
      return {
        success: false,
        error: 'Page ID is required'
      };
    }

    console.log(`Converting MultiExcerpt macros to SmartExcerpt on page ${pageId}...`);

    // Fetch the page
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
    }

    const pageData = await pageResponse.json();
    const currentContent = pageData?.body?.storage?.value || '';
    const pageVersion = pageData.version.number;

    console.log(`Current page version: ${pageVersion}`);

    // Get all excerpts from "Migrated from MultiExcerpt" category
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const excerptsByName = {};

    for (const excerptSummary of excerptIndex.excerpts) {
      const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
      if (excerpt && excerpt.category === 'Migrated from MultiExcerpt') {
        excerptsByName[excerpt.name] = excerpt;
      }
    }

    console.log(`Loaded ${Object.keys(excerptsByName).length} excerpts from storage`);

    // Find all multiexcerpt-macro instances
    const multiexcerptRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>(.*?)<\/ac:structured-macro>/gs;
    const matches = [...currentContent.matchAll(multiexcerptRegex)];

    console.log(`Found ${matches.length} MultiExcerpt macros on page`);

    if (matches.length === 0) {
      return {
        success: false,
        error: 'No MultiExcerpt macros found on page'
      };
    }

    let newContent = currentContent;
    const converted = [];
    const skipped = [];

    // Forge app IDs
    const appId = 'be1ff96b-d44d-4975-98d3-25b80a813bdd';
    const environmentId = 'ae38f536-b4c8-4dfa-a1c9-62026d61b4f9';

    // Process each MultiExcerpt macro
    for (const match of matches) {
      try {
        const fullMacro = match[0];
        const macroContent = match[1];

        // Extract the name parameter
        const nameMatch = macroContent.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
        if (!nameMatch) {
          console.warn('Could not extract name from MultiExcerpt macro');
          skipped.push({ reason: 'No name parameter found' });
          continue;
        }

        const excerptName = nameMatch[1];
        console.log(`Processing: ${excerptName}`);

        // Decode HTML entities in the name for matching
        const decodedName = excerptName
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');

        // Find matching excerpt in storage (try both encoded and decoded names)
        let excerpt = excerptsByName[excerptName] || excerptsByName[decodedName];
        if (!excerpt) {
          console.warn(`No matching excerpt found in storage for: ${excerptName} (or decoded: ${decodedName})`);
          skipped.push({ name: excerptName, reason: 'Not found in storage' });
          continue;
        }

        // Extract the rich-text-body content
        // Try to find rich-text-body, if not found, macro might be empty
        const bodyMatch = macroContent.match(/<ac:rich-text-body>([\s\S]*)<\/ac:rich-text-body>/);
        let bodyContent;

        if (!bodyMatch) {
          // Check if macro is self-closing or has no body
          console.warn(`No rich-text-body found for: ${excerptName}, checking if empty...`);
          // If no rich-text-body, use empty paragraph
          bodyContent = '<p />';
        } else {
          bodyContent = bodyMatch[1];
        }

        // Generate unique localId
        const localId = generateUUID();

        // Escape XML special characters in excerpt name for attributes
        const escapedName = excerptName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const escapedCategory = 'Migrated from MultiExcerpt';

        // Build SmartExcerpt Source ADF macro
        let smartExcerptMacro = `<ac:adf-extension><ac:adf-node type="bodied-extension">`;
        smartExcerptMacro += `<ac:adf-attribute key="extension-key">${appId}/${environmentId}/static/smart-excerpt-source</ac:adf-attribute>`;
        smartExcerptMacro += `<ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>`;
        smartExcerptMacro += `<ac:adf-attribute key="parameters">`;
        smartExcerptMacro += `<ac:adf-parameter key="local-id">${localId}</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="extension-id">ari:cloud:ecosystem::extension/${appId}/${environmentId}/static/smart-excerpt-source</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="extension-title">SmartExcerpt (Development)</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="layout">bodiedExtension</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="forge-environment">DEVELOPMENT</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="render">native</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="guest-params">`;
        smartExcerptMacro += `<ac:adf-parameter key="excerpt-id">${excerpt.id}</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="excerpt-name">${escapedName}</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="category">${escapedCategory}</ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="variables"><ac:adf-parameter-value /></ac:adf-parameter>`;
        smartExcerptMacro += `<ac:adf-parameter key="toggles"><ac:adf-parameter-value /></ac:adf-parameter>`;
        smartExcerptMacro += `</ac:adf-parameter>`;
        smartExcerptMacro += `</ac:adf-attribute>`;
        smartExcerptMacro += `<ac:adf-attribute key="text">SmartExcerpt (Development)</ac:adf-attribute>`;
        smartExcerptMacro += `<ac:adf-attribute key="layout">default</ac:adf-attribute>`;
        smartExcerptMacro += `<ac:adf-attribute key="local-id">${localId}</ac:adf-attribute>`;
        smartExcerptMacro += `<ac:adf-content>${bodyContent}</ac:adf-content>`;
        smartExcerptMacro += `</ac:adf-node></ac:adf-extension>`;

        // Replace the MultiExcerpt macro with SmartExcerpt macro
        newContent = newContent.replace(fullMacro, smartExcerptMacro);

        // Update excerpt metadata with page info
        excerpt.sourcePageId = pageId;
        excerpt.sourceLocalId = localId;
        excerpt.updatedAt = new Date().toISOString();
        await storage.set(`excerpt:${excerpt.id}`, excerpt);

        converted.push({
          name: excerptName,
          excerptId: excerpt.id,
          localId
        });

        console.log(`✓ Converted: ${excerptName}`);

      } catch (macroError) {
        console.error(`Error converting macro:`, macroError);
        skipped.push({ reason: macroError.message });
      }
    }

    // Update the page with converted content
    console.log(`Updating page with ${converted.length} converted macros...`);

    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}`,
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: pageId,
          status: 'current',
          title: pageData.title,
          body: {
            representation: 'storage',
            value: newContent
          },
          version: {
            number: pageVersion + 1,
            message: `Converted ${converted.length} MultiExcerpt macros to SmartExcerpt`
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update page: ${updateResponse.status} - ${errorText}`);
    }

    console.log(`✅ Successfully converted ${converted.length} macros on page ${pageId}`);
    if (skipped.length > 0) {
      console.log(`⚠️ Skipped ${skipped.length} macros`);
    }

    return {
      success: true,
      summary: {
        total: matches.length,
        converted: converted.length,
        skipped: skipped.length,
        pageId,
        pageVersion: pageVersion + 1
      },
      converted,
      skipped
    };

  } catch (error) {
    console.error('Error converting MultiExcerpt macros:', error);
    return {
      success: false,
      error: error.message,
      summary: {
        total: 0,
        converted: 0,
        skipped: 0
      }
    };
  }
}

/**
 * Bulk initialize all excerpts with hardcoded name-UUID mappings
 * This is a one-time initialization function with 147 hardcoded mappings
 */
export async function bulkInitializeAllExcerpts(req) {
  console.log('🚀 Starting bulk initialization of all excerpts...');

  const mappings = [
  {
    "name": "[ALL] Fundamentals - Key dates, Stack model",
    "uuid": "a698f73f-c913-4350-988e-629181026bd8",
    "category": "General"
  },
  {
    "name": "[ALL] Fundamentals - Venues, Performers",
    "uuid": "258b1fb5-5bf0-4895-96b2-8da06fe95d81",
    "category": "General"
  },
  {
    "name": "[GOLF] Fundamentals - Venues, Performers",
    "uuid": "a66e17ee-e1c1-4cfe-961b-20864945b3e3",
    "category": "General"
  },
  {
    "name": "[ALL] Fundamentals - Infrastructure, Tenant ID, Weblink",
    "uuid": "5dd0d2e6-a90f-4e85-9c56-041b4f5d00d1",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [some eSRO, no tSRO, all Native AC]",
    "uuid": "b95e7e67-1cf7-4d23-b57f-c949149d3d12",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [no eSRO, no tSRO, all Native AC]",
    "uuid": "a95dab75-3b16-4501-8d24-18d57699eafa",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [no eSRO, no tSRO, some Native AC]",
    "uuid": "e3ef9319-7c7a-414d-839c-e3ab09adf65f",
    "category": "General"
  },
  {
    "name": "[ALL] Base platform utilization [no eSRO, no tSRO, no Native AC]",
    "uuid": "ac23dc1f-3d59-4dfb-96d5-5eb2445cc08e",
    "category": "General"
  },
  {
    "name": "[ALL] Organization units",
    "uuid": "41ce3c90-6665-4330-9fe8-ebd6d53e675b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Users &amp;lsqb;No client SSO&amp;rsqb;",
    "uuid": "dbd13acb-7558-4161-a59b-975816a7d52b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Users &amp;lsqb;With client SSO&amp;rsqb;",
    "uuid": "2b818cf6-14cc-4849-ab50-60ce36db7194",
    "category": "General"
  },
  {
    "name": "[ALL] Profiles, Security Tokens, and User Roles",
    "uuid": "feba88db-c0aa-4241-9613-92b69636d375",
    "category": "General"
  },
  {
    "name": "[GOLF] Translator (Captions)",
    "uuid": "c2f78b77-09a6-48b8-8d23-0731aef737ee",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;MLS&amp;rsqb; &amp;lsqb;NWSL&amp;rsqb; &amp;lsqb;USL&amp;rsqb; Translator &amp;lpar;Captions&amp;rpar;",
    "uuid": "2aad3300-debc-48e7-aefb-4ec2ade71d0e",
    "category": "General"
  },
  {
    "name": "[NBA] Translator (Captions)",
    "uuid": "f64cf589-72a4-4d4b-890a-98bf8236536e",
    "category": "General"
  },
  {
    "name": "[NFL] Translator (Captions)",
    "uuid": "fc3dd22e-3ee1-429a-8e4e-0cb79cc902ca",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Translator &amp;lpar;Captions&amp;rpar;",
    "uuid": "cdb11fd7-3e1d-4d51-887a-8c45701d1293",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;HORSE RACING&amp;rsqb; Translator &amp;lpar;Captions&amp;rpar;",
    "uuid": "bf1eb6ae-8e28-4955-bdd6-90055567a212",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;INTRO&amp;rsqb; Products &amp;lsqb;Overview&amp;rsqb;",
    "uuid": "16f7a05c-45eb-422b-b8d8-063c94314e86",
    "category": "General"
  },
  {
    "name": "[ALL] Single-event tickets",
    "uuid": "0e56dc61-91b3-4d61-a160-5dcae34b5919",
    "category": "General"
  },
  {
    "name": "[ALL] Third-party events",
    "uuid": "dead00d7-f0ea-4704-a7f2-6c0be733d1d5",
    "category": "General"
  },
  {
    "name": "[ALL] Season tickets",
    "uuid": "3565cfb1-9483-41f6-930b-85591dbf67d6",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Season tickets",
    "uuid": "19417ed6-c92c-4dc3-a298-ca9887639588",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Season tickets",
    "uuid": "d9685194-b97b-4f64-8252-57c579e93456",
    "category": "General"
  },
  {
    "name": "[MLS] Full season tickets",
    "uuid": "62f6068d-5460-4931-adb6-fb1de3b1c7ce",
    "category": "General"
  },
  {
    "name": "[NBA] Full season tickets",
    "uuid": "f2c85898-d7b5-4280-bd78-e038de4169af",
    "category": "General"
  },
  {
    "name": "[NFL] Full season tickets",
    "uuid": "7dfba599-7f5c-4f1e-9916-5f8f9dc15363",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Full season tickets",
    "uuid": "e4628f60-b151-4894-80a8-e30ee27b326b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NWSL&amp;rsqb; Full season tickets",
    "uuid": "7f085760-cc4e-44dc-ae69-888427abbf97",
    "category": "General"
  },
  {
    "name": "[USL] Full season tickets",
    "uuid": "06900bbf-12be-4b6f-b07b-1634b4832692",
    "category": "General"
  },
  {
    "name": "[TENNIS] Full season tickets",
    "uuid": "0344510c-d3de-4e7c-bcc4-f876db385560",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;BOWL&amp;rsqb; Full season tickets",
    "uuid": "f8733855-504c-4eef-b2bd-ec71fcc3b397",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Overview; 1 of 5]",
    "uuid": "871ae09c-9ed6-4590-8b7d-eaeae6fb07d5",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Partial season tickets &amp;lsqb;Overview&amp;semi; N&amp;sol;A&amp;rsqb;",
    "uuid": "6a1e28ba-86a8-4393-a224-7a4d4101326a",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Fixed; 2 of 5]",
    "uuid": "6af9ba0e-f118-413e-9555-258fc6251a5e",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Flex; 3 of 5]",
    "uuid": "0a0b0c5b-86f2-445e-a22c-d1623ef35b1d",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Mixed; 4 of 5]",
    "uuid": "691af237-a3e0-4071-b0fd-88c111bd5f63",
    "category": "General"
  },
  {
    "name": "[ALL] Partial season tickets [Buckets; 5 of 5]",
    "uuid": "cfba756a-2dc3-4afe-9918-c95d31c1ba74",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;Horse Racing&amp;rsqb; Combo Ticket Event Packages",
    "uuid": "0e5ad632-a1d4-487b-88e9-ad2bad39ba3f",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;MLS&amp;sol;USL&amp;rsqb; Season voucher packs",
    "uuid": "20cbea1a-e28f-400b-b4aa-2200df76a6bc",
    "category": "General"
  },
  {
    "name": "[ALL] Season ticket renewals [Method 1 of 3]",
    "uuid": "95ef6e54-3b06-49d6-85e3-1aa7f594ed32",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NBA&amp;rsqb; Season ticket renewals &amp;lsqb;Method 2 of 3&amp;rsqb;",
    "uuid": "c2580600-15ad-4fa4-9fc5-68c876447956",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Season ticket renewals &amp;lsqb;Method 2 of 3&amp;rsqb;",
    "uuid": "552fd645-62cd-47f0-888a-f52e30251363",
    "category": "General"
  },
  {
    "name": "[ALL] Season ticket renewals [Method 2 of 3]",
    "uuid": "ccdb1a3d-5da2-48f4-b449-0860e4c4f791",
    "category": "General"
  },
  {
    "name": "[ALL] Season ticket renewals [Method 3 of 3]",
    "uuid": "c6153550-d111-4fce-b6db-881bba661fb3",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;SEASONAL&amp;rsqb; Renewals not including &amp;quot;Season Ticket&amp;quot;",
    "uuid": "315ec2df-1a24-4186-ba54-f4122e1eee22",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Relocations &amp;lsqb;SeatGeek Native&amp;rsqb;",
    "uuid": "219cd955-d0ba-42e7-8822-697a075cde29",
    "category": "General"
  },
  {
    "name": "[ALL] Relocations [MMC]",
    "uuid": "28e3b18b-51f5-4f10-9ca7-500af8fe5267",
    "category": "General"
  },
  {
    "name": "[ALL] Exchanges [SeatGeek Exchanges]",
    "uuid": "d202c52e-ac09-4682-8395-5504812f3045",
    "category": "General"
  },
  {
    "name": "[MLS] Playoffs",
    "uuid": "3ec4ff53-ac5b-45d1-a007-7d1bc78b7936",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;MLS&amp;rsqb; Playoffs - Reservation Confirmation",
    "uuid": "bc8690b2-a75f-4802-b9f7-b1ea61a09f66",
    "category": "General"
  },
  {
    "name": "[NBA] Playoffs",
    "uuid": "24ddcf47-3a65-4c13-93a2-a6b4fb0c3a4f",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NHL&amp;rsqb; Playoffs",
    "uuid": "1ca88f04-3e33-4603-8563-29cb3555a452",
    "category": "General"
  },
  {
    "name": "[NFL] Playoffs",
    "uuid": "b5e83839-3741-4d8f-b518-20eed2685452",
    "category": "General"
  },
  {
    "name": "[USL] Playoffs",
    "uuid": "e19d3489-7326-4c52-979c-f3565fda91f1",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Premium tickets &amp;lpar;Suites and Clubs&amp;rpar; &amp;lsqb;Ancillary&amp;rsqb;",
    "uuid": "f60e2497-9a72-465f-86a1-0821fb85f689",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Premium tickets &amp;lpar;Suites and Clubs&amp;rpar; &amp;lsqb;Main-manifest&amp;rsqb;",
    "uuid": "8ad77989-03e6-4cac-9550-8a198fb61e1a",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Premium lift",
    "uuid": "40335076-b458-4019-b556-33140c6db6bd",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Deposits and Waitlists &amp;lsqb;Dummy Series&amp;rsqb;",
    "uuid": "34cf3654-84a4-4be0-bff4-4a334e15c3b1",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Deposits and Waitlists &amp;lsqb;Dummy Events&amp;rsqb;",
    "uuid": "3fa74eb6-d063-42bc-ac5d-e24c9544ff92",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Group sales",
    "uuid": "d31e0806-1cfa-4b4d-bb3d-55e4ed7eaed7",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Group sales &amp;lsqb;with Project Admission&amp;rsqb;",
    "uuid": "72d6e29a-de6d-4109-861f-2236538c70ac",
    "category": "General"
  },
  {
    "name": "[ALL] Parking",
    "uuid": "4df079f1-fd80-4bef-97f2-8131237591db",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; Parking",
    "uuid": "9b50224f-277c-4b0a-8961-1afc506068fd",
    "category": "General"
  },
  {
    "name": "[ALL] Merchandise",
    "uuid": "85b76a81-b168-4eaf-95da-9ddd3ddbacb0",
    "category": "General"
  },
  {
    "name": "[INTRO] Sales fundamentals",
    "uuid": "d0aa1e41-17b2-42b1-88b2-b9e27bc2a1da",
    "category": "General"
  },
  {
    "name": "[GOLF] Distribution partnerships",
    "uuid": "0fa2195b-5034-49c3-9ce9-84a2be637d55",
    "category": "General"
  },
  {
    "name": "[MLS] Distribution partnerships",
    "uuid": "c9167a43-008a-4c87-a069-560f3115085a",
    "category": "General"
  },
  {
    "name": "[NBA] Distribution partnerships",
    "uuid": "a616486e-ab46-4c50-899f-e1af05c35e13",
    "category": "General"
  },
  {
    "name": "[NFL] Distribution partnerships",
    "uuid": "32ebef00-1cd9-47de-a80a-d80e818081de",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;OTHER&amp;rsqb; Distribution partnerships",
    "uuid": "01a05070-de95-4a97-8230-1b2391e29384",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; NFL Ticket Exchange",
    "uuid": "0e1407e6-04af-4da5-981b-ff8bb98577ff",
    "category": "General"
  },
  {
    "name": "[ALL] Sales Period, Return Period rules",
    "uuid": "e0640f8a-b93c-40b5-96d6-e06d007cddaa",
    "category": "General"
  },
  {
    "name": "[ALL] Inventory management",
    "uuid": "71a19c1d-f26e-4c9d-95e7-64417229243b",
    "category": "General"
  },
  {
    "name": "[ALL] Locks and Allocations",
    "uuid": "95198f32-5ad8-41cc-b37b-7ba641c40cd0",
    "category": "General"
  },
  {
    "name": "[ENTERTAINMENT] Prime and VIP Locks and Allocations",
    "uuid": "07f38276-312d-4ea5-a2b0-d62148ff8dd7",
    "category": "General"
  },
  {
    "name": "[ALL] Seat-Level Pricing",
    "uuid": "fd135114-08d9-4fb6-b972-4009a7948cbb",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Seat-Level Pricing &amp;lsqb;with SeatGeekIQ&amp;rsqb;",
    "uuid": "861c2db0-bbc5-47dc-9852-e96eb4d7134f",
    "category": "General"
  },
  {
    "name": "[ENTERTAINMENT] Entertainment Unmanifested Seats",
    "uuid": "dbb749f3-5050-4130-8daa-1e2d03258596",
    "category": "General"
  },
  {
    "name": "[ALL] Extra Data rules",
    "uuid": "ad5b21e7-a9b8-415e-a723-afb71b9f534d",
    "category": "General"
  },
  {
    "name": "[ALL] Sale Modes",
    "uuid": "511f6b82-a674-4b42-9c07-60ee11e7c4d4",
    "category": "General"
  },
  {
    "name": "[ALL] Sale Points",
    "uuid": "ddffbf68-cd1c-454b-b875-8fdc4eaac0eb",
    "category": "General"
  },
  {
    "name": "[ALL] Sites",
    "uuid": "a99b5242-ffd9-4f3f-97fa-b4d5ae0ec930",
    "category": "General"
  },
  {
    "name": "[ALL] Venues, Halls (Venue Maps), Hall (Venue Map) Versions [Overview; 1 of 5]",
    "uuid": "39ff1161-45df-4487-9e7e-bc4076b0c38f",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [Stands; 2 of 5]",
    "uuid": "227f4aac-6500-4e6a-b8a3-9488c5e04c78",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [Areas and sections; 3 of 5]",
    "uuid": "ccdfb56b-fcca-448b-9260-a226f5cb3094",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [General Admission; 4 of 5]",
    "uuid": "4fe0ca19-bcb1-43a2-8507-22b04ca35387",
    "category": "General"
  },
  {
    "name": "[ALL] Halls (Venue Maps), Hall (Venue Map) Versions [Gates and Turnstiles (Fortress); 5 of 5]",
    "uuid": "36ba00f3-7723-4872-82b4-566b9e836410",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Halls &amp;lpar;Venue Maps&amp;rpar;&amp;comma; Hall &amp;lpar;Venue Map&amp;rpar; Versions &amp;lsqb;Gates and Turnstiles &amp;lpar;SRO Built-In Access Control&amp;rpar;&amp;semi; 5 of 5&amp;rsqb;",
    "uuid": "8a932c7c-6987-43ca-8dad-eb98c1e94d7f",
    "category": "General"
  },
  {
    "name": "[ALL] Seat Types",
    "uuid": "dbb193a2-6075-4a5d-8d07-3be07daa9c7c",
    "category": "General"
  },
  {
    "name": "[ALL] Custom Properties",
    "uuid": "b1379e9f-50f6-456a-8661-c3a84854fa81",
    "category": "General"
  },
  {
    "name": "[ALL] Pricing",
    "uuid": "47a80318-90a4-4e44-a184-c501e67ac1c0",
    "category": "General"
  },
  {
    "name": "[ALL] Price Lists",
    "uuid": "b442d573-ed60-4f2b-98ec-6ee04734a0b0",
    "category": "General"
  },
  {
    "name": "Prime and VIP Price Type to Allocations",
    "uuid": "c3db716c-9de1-42df-bff1-1276ebf071ce",
    "category": "General"
  },
  {
    "name": "[ALL] Price Type Availability rules",
    "uuid": "ea6cbc9d-bf2d-469b-9fbc-0d74d3a36229",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;USL&amp;rsqb; Price Type Availability rules",
    "uuid": "82c55cce-83fb-443d-8b32-45cf01e75c81",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Market-based pricing",
    "uuid": "c1320f2e-1bbf-4d82-bf04-ffebadbeebcc",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Dynamic pricing &amp;lsqb;PriceIQ&amp;rsqb;",
    "uuid": "321b7c44-792c-42be-ab5f-fa6c8938ffc7",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Dynamic pricing &amp;lsqb;ReachIQ&amp;rsqb;",
    "uuid": "277f01dd-5b7a-4626-aac1-89b7aea919d8",
    "category": "General"
  },
  {
    "name": "[ALL] Fees",
    "uuid": "d7646d13-3d11-44f1-b722-3c5af66d5b77",
    "category": "General"
  },
  {
    "name": "[NFL] Fees",
    "uuid": "52f93450-9cb0-429c-83f6-ef43ade09d0a",
    "category": "General"
  },
  {
    "name": "[ENTERTAINMENT] Entertainment Fee Bands",
    "uuid": "802376c4-7d34-407a-9f80-41c665379627",
    "category": "General"
  },
  {
    "name": "[ALL] Taxes",
    "uuid": "6b082bff-8bc6-44c3-9d1d-d733dd1d0268",
    "category": "General"
  },
  {
    "name": "[ALL] Coupons",
    "uuid": "ff427e45-2817-4eb3-9580-ed39971e16d0",
    "category": "General"
  },
  {
    "name": "[ALL] Packages",
    "uuid": "e9787f80-2ea4-4784-ab99-935ebb80cd75",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Bundles",
    "uuid": "1ea2a20d-98da-4a9d-a209-5f24c2f9c03f",
    "category": "General"
  },
  {
    "name": "[ALL] Prompts (Upsells)",
    "uuid": "0b6031b3-e58a-4c40-bb20-c2ce49e0342f",
    "category": "General"
  },
  {
    "name": "[ALL] CRM",
    "uuid": "dbb7598b-ef73-43f3-8769-8c1ca04636ef",
    "category": "General"
  },
  {
    "name": "[ALL] Customers",
    "uuid": "151fca8c-f93c-414b-afe8-cf02cf683074",
    "category": "General"
  },
  {
    "name": "[ALL] Client Types",
    "uuid": "ae92e108-87a4-4f56-b089-c8369b1ca20e",
    "category": "General"
  },
  {
    "name": "[ALL] Remarks",
    "uuid": "8e13da4d-0837-49c8-b8c1-6dbb4b5e0ab4",
    "category": "General"
  },
  {
    "name": "[ALL] Sales and Service Representatives",
    "uuid": "e5c6bbd1-6ca2-4073-bd16-a060f094dfbe",
    "category": "General"
  },
  {
    "name": "[ALL] Correspondence Processes, Communication Profiles",
    "uuid": "bd570b09-51bd-4ad0-bf5e-26849232eec3",
    "category": "General"
  },
  {
    "name": "[ALL] Delivery Methods",
    "uuid": "ccac001d-9b8e-4582-8143-e0fb1d4fbd1a",
    "category": "General"
  },
  {
    "name": "[ALL] Client Duplication rules",
    "uuid": "441d75f9-04d1-422e-a8a5-58f8f709c6aa",
    "category": "General"
  },
  {
    "name": "[ALL] Client Extra Data fields",
    "uuid": "ae7c83db-dfc0-4151-8447-191b2ecc517a",
    "category": "General"
  },
  {
    "name": "[ALL] Limit per Person rules",
    "uuid": "e3e028d0-f3b3-4139-b4c9-fba552865bb7",
    "category": "General"
  },
  {
    "name": "[ALL] Printing and Access Control",
    "uuid": "69a066d7-50fc-4d89-8d0d-176b0d0a965c",
    "category": "General"
  },
  {
    "name": "[ALL] Documents",
    "uuid": "909a7ad3-65e0-43b5-b874-5cac56cac414",
    "category": "General"
  },
  {
    "name": "[ALL] Printers",
    "uuid": "b4662343-984a-4b27-b07c-3701c852dbbd",
    "category": "General"
  },
  {
    "name": "[ALL] Printer Servers",
    "uuid": "f0a0507e-24de-41b1-8df8-effaaf205de0",
    "category": "General"
  },
  {
    "name": "[ALL] SMS Ticket Collection",
    "uuid": "0891c1bc-31b6-471c-b765-6bd03554dd6b",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Access Control &amp;lpar;SRO Native&amp;rpar;",
    "uuid": "f6ea9a3d-af56-4654-acb4-d94b316e873d",
    "category": "General"
  },
  {
    "name": "[ALL] Access Control (Fortress)",
    "uuid": "2386b76e-a42c-4893-a622-6aaaaabe2223",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Access Control &amp;lpar;Skidata&amp;rpar;",
    "uuid": "7a2cb3ef-0dbe-4712-bf32-1ef995829968",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Loaded Value &amp;lpar;Non-VenueNext&amp;rpar;",
    "uuid": "30c19f2e-49a4-42f0-87d8-b888162669f8",
    "category": "General"
  },
  {
    "name": "[ALL] Loaded Value (VenueNext)",
    "uuid": "8d58ee78-93da-45f3-acc8-87458d0fda81",
    "category": "General"
  },
  {
    "name": "[ALL] Payments",
    "uuid": "898bfa01-e8b3-4660-a3a2-9cb3a9afe2dc",
    "category": "General"
  },
  {
    "name": "[ALL] Payment Methods",
    "uuid": "399077fd-07b8-4212-a820-55d55d13eb1f",
    "category": "General"
  },
  {
    "name": "[ALL] Payment Plans",
    "uuid": "c1fee9c4-7fe0-40dc-a0b8-b7a889492fea",
    "category": "General"
  },
  {
    "name": "[ALL] Deposits (Account Credits)",
    "uuid": "d58d4b82-7539-4f84-affd-5d21e1eeb9f9",
    "category": "General"
  },
  {
    "name": "[ALL] Reports, Queries",
    "uuid": "581c58a8-c4db-4a8c-8d68-85b7771fa351",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;NFL&amp;rsqb; League reports",
    "uuid": "87967c7e-aff9-4b05-9765-cc8cf4101a12",
    "category": "General"
  },
  {
    "name": "[ALL] SeatGeek Open",
    "uuid": "81914b0a-563e-4e0f-8b4c-9ec65b845403",
    "category": "General"
  },
  {
    "name": "[ALL] [INTERNAL] Open Admin configurations",
    "uuid": "578a195f-2422-4d0c-8c32-2ea82e93f8fa",
    "category": "General"
  },
  {
    "name": "[ALL] [INTERNAL] Rufus configurations",
    "uuid": "36a95fd8-53b5-466f-a2ba-4a2482acfc0c",
    "category": "General"
  },
  {
    "name": "[ALL] [INTERNAL] Unleash feature flags",
    "uuid": "50bfcef1-9556-4ca7-b63f-dbb8ae569cb8",
    "category": "General"
  },
  {
    "name": "[ALL] Performer page",
    "uuid": "763c8da1-cf40-49cf-b13c-575510ead743",
    "category": "General"
  },
  {
    "name": "[ALL] Event page",
    "uuid": "1c31ca32-0a8d-4b48-8cbd-6c677eaca750",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Rally &amp;lsqb;Basic&amp;rsqb;",
    "uuid": "fb8428aa-3d4f-4e65-b8c0-8ac56d6ce570",
    "category": "General"
  },
  {
    "name": "&amp;lsqb;ALL&amp;rsqb; Rally &amp;lsqb;Detailed&amp;rsqb;",
    "uuid": "2d2ecaec-8a82-408a-8381-bed9594525d3",
    "category": "General"
  },
  {
    "name": "[ALL] Account Manager",
    "uuid": "81ae1232-b8bb-432d-84ae-eea8685ae9e3",
    "category": "General"
  },
  {
    "name": "[ALL] SeatGeek Online Ticket Management rules",
    "uuid": "90f6fdae-44ec-4679-abc1-9726df22f3f0",
    "category": "General"
  },
  {
    "name": "[ALL] Amplify",
    "uuid": "616a1345-ae5d-404d-8acc-a686d1fc208b",
    "category": "General"
  },
  {
    "name": "[ALL] Price Floors",
    "uuid": "6b0ba694-5954-4f64-813a-e64c6b0472de",
    "category": "General"
  },
  {
    "name": "[INTRO] Appendix - Integrations summary",
    "uuid": "6b6f2934-d72a-41f9-a7b9-87e1b184cae4",
    "category": "General"
  },
  {
    "name": "[INTRO] Appendix - External sources",
    "uuid": "9ea7f532-5bb9-4ba3-adb8-f7719b8fae68",
    "category": "General"
  }
];

  const results = [];

  for (const { uuid, name, category } of mappings) {
    try {
      // Get existing excerpt from Forge storage
      let excerpt = await storage.get(`excerpt:${uuid}`);

      if (!excerpt) {
        // Create new excerpt if it doesn't exist
        excerpt = {
          id: uuid,
          name: name,
          category: category || 'General',
          content: null,
          variables: [],
          toggles: [],
          sourcePageId: '80150529',  // All excerpts are on this page
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        console.log(`✓ Created new excerpt: ${name}`);
      } else {
        // Update existing excerpt
        excerpt.name = name;
        excerpt.category = category || excerpt.category || 'General';
        excerpt.sourcePageId = '80150529';  // All excerpts are on this page
        excerpt.updatedAt = new Date().toISOString();
        console.log(`✓ Updated existing excerpt: ${name}`);
      }

      // Save to storage
      await storage.set(`excerpt:${uuid}`, excerpt);
      results.push({ uuid, name, success: true });

    } catch (error) {
      console.error(`✗ Error initializing ${name}:`, error);
      results.push({ uuid, name, success: false, error: error.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`✅ Bulk initialization complete: ${successCount}/${results.length} successful`);

  // Build and save the excerpt-index so getExcerpts can list them
  const successfulExcerpts = results
    .filter(r => r.success)
    .map(r => {
      const mapping = mappings.find(m => m.uuid === r.uuid);
      return {
        id: r.uuid,
        name: r.name,
        category: mapping?.category || 'General'
      };
    });

  await storage.set('excerpt-index', { excerpts: successfulExcerpts });
  console.log(`✓ Updated excerpt-index with ${successfulExcerpts.length} excerpts`);

  return {
    success: true,
    total: results.length,
    successful: successCount,
    failed: results.length - successCount,
    results
  };
}
