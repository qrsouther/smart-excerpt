/**
 * Migration Worker - Handles bulk import with 900s timeout
 * Runs asynchronously via Forge Events API queue
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from '../utils.js';

/**
 * Extract Forge extension metadata template from a working Blueprint Standard Source page
 */
async function extractForgeMetadataTemplate(workingPageId) {
  try {
    const response = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${workingPageId}?body-format=atlas_doc_format`
    );
    const page = await response.json();
    const adf = JSON.parse(page.body.atlas_doc_format.value);

    const extension = adf.content.find(node => node.type === 'bodiedExtension');
    if (!extension || !extension.attrs) {
      throw new Error('No bodiedExtension found in working page');
    }

    return {
      extensionType: extension.attrs.extensionType,
      extensionKey: extension.attrs.extensionKey,
      extensionId: extension.attrs.parameters.extensionId,
      extensionTitle: extension.attrs.parameters.extensionTitle,
      text: extension.attrs.text,
      extensionProperties: extension.attrs.parameters.extensionProperties,
      forgeEnvironment: extension.attrs.parameters.forgeEnvironment,
      render: extension.attrs.parameters.render
    };
  } catch (error) {
    console.error('Failed to extract Forge metadata template:', error);
    throw error;
  }
}

/**
 * Transform MultiExcerpt ADF to Blueprint Standard Source ADF
 */
function transformToBlueprintStandardAdf(multiExcerptAdf, excerptId, excerptName, category, localId, forgeMetadata) {
  const innerContent = multiExcerptAdf.content[0].content;

  return {
    type: 'doc',
    content: [{
      type: 'bodiedExtension',
      attrs: {
        layout: 'default',
        extensionType: 'com.atlassian.ecosystem',
        extensionKey: forgeMetadata.extensionKey,
        text: forgeMetadata.text,
        parameters: {
          layout: 'bodiedExtension',
          guestParams: {
            variables: [],
            excerptId: excerptId,
            toggles: [],
            category: category || 'General',
            excerptName: excerptName
          },
          forgeEnvironment: forgeMetadata.forgeEnvironment,
          extensionProperties: forgeMetadata.extensionProperties,
          localId: localId,
          extensionId: forgeMetadata.extensionId,
          render: forgeMetadata.render,
          extensionTitle: forgeMetadata.extensionTitle
        },
        localId: localId
      },
      content: innerContent
    }],
    version: 1
  };
}

export async function handler(event) {
  // In @forge/events v2, payload is in event.body, not event.payload
  const payload = event.payload || event.body || event;
  const { jobType, sources, deleteOldMigrations, spaceKey: providedSpaceKey, jobId, sourcePageId } = payload;

  // Handle ADF migration (new approach)
  if (jobType === 'adf-migration') {
    console.log(`[ADF Migration Worker] Starting job ${jobId} for page ${sourcePageId}`);
    return await handleAdfMigration(jobId, sourcePageId, providedSpaceKey);
  }

  // Handle legacy migration (old approach)
  console.log(`[Migration Worker] Starting job ${jobId} with ${sources.length} sources`);

  try {
    // Step 1: Delete old migrations
    if (deleteOldMigrations) {
      console.log('[Migration Worker] Deleting old migrations...');
      const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
      const toDelete = [];

      for (const excerptSummary of excerptIndex.excerpts) {
        const excerpt = await storage.get(`excerpt:${excerptSummary.id}`);
        if (excerpt && excerpt.category === 'Migrated from MultiExcerpt') {
          toDelete.push(excerpt.id);
        }
      }

      for (const id of toDelete) {
        await storage.delete(`excerpt:${id}`);
      }

      const updatedIndex = {
        excerpts: excerptIndex.excerpts.filter(e => !toDelete.includes(e.id))
      };
      await storage.set('excerpt-index', updatedIndex);
      console.log(`[Migration Worker] Deleted ${toDelete.length} old excerpts`);
    }

    // Step 2: Create storage entries
    console.log('[Migration Worker] Creating storage entries...');
    const excerptIndex = await storage.get('excerpt-index') || { excerpts: [] };
    const imported = [];
    const skipped = [];
    const excerptsToCreate = [];

    for (const source of sources) {
      try {
        if (!source.name || !source.name.trim()) {
          skipped.push({ name: 'Unknown', reason: 'No name provided' });
          continue;
        }

        if (!source.content || source.content.trim().length === 0) {
          skipped.push({ name: source.name, reason: 'No content' });
          continue;
        }

        const excerptId = generateUUID();
        const localId = generateUUID();

        const newExcerpt = {
          id: excerptId,
          name: source.name,
          content: source.content,
          category: 'Migrated from MultiExcerpt',
          variables: source.variables || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await storage.set(`excerpt:${excerptId}`, newExcerpt);

        excerptIndex.excerpts.push({
          id: excerptId,
          name: source.name,
          category: 'Migrated from MultiExcerpt'
        });

        excerptsToCreate.push({
          excerptId,
          localId,
          name: source.name,
          content: source.content
        });

        imported.push({
          id: excerptId,
          name: source.name,
          localId
        });

      } catch (err) {
        console.error(`[Migration Worker] Error importing "${source.name}":`, err);
        skipped.push({ name: source.name, reason: err.message });
      }
    }

    await storage.set('excerpt-index', excerptIndex);
    console.log(`[Migration Worker] Storage complete: ${imported.length} imported, ${skipped.length} skipped`);

    // Step 3: Create page with all Source macros
    let newPageId = null;
    let pageUrl = null;

    if (imported.length > 0 && providedSpaceKey) {
      console.log(`[Migration Worker] Creating page with ${imported.length} Source macros...`);

      // Lookup or use space ID
      let spaceId;
      if (/^\d+$/.test(providedSpaceKey)) {
        spaceId = providedSpaceKey;
      } else {
        const spaceResponse = await api.asApp().requestConfluence(route`/wiki/api/v2/spaces?keys=${providedSpaceKey}`);
        if (spaceResponse.ok) {
          const spaceData = await spaceResponse.json();
          if (spaceData.results && spaceData.results.length > 0) {
            spaceId = spaceData.results[0].id;
          }
        }
      }

      if (!spaceId) {
        throw new Error(`Could not resolve space ID from: ${providedSpaceKey}`);
      }

      // Build page content with actual Source macros
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const pageTitle = `Blueprint Standards (Migrated ${timestamp})`;

      let pageContent = `<p><strong>Blueprint Standards - Migrated from MultiExcerpt</strong></p>`;
      pageContent += `<p>${imported.length} Blueprint Standards imported.</p><hr />`;

      // Create actual Source macros with content
      for (const item of imported) {
        const excerpt = await storage.get(`excerpt:${item.id}`);
        if (excerpt && excerpt.content) {
          pageContent += `<h3>${item.name}</h3>`;
          pageContent += `<ac:structured-macro ac:name="blueprint-standard-source" ac:schema-version="1" ac:macro-id="${item.localId}">`;
          pageContent += `<ac:parameter ac:name="excerptId">${item.id}</ac:parameter>`;
          pageContent += `<ac:rich-text-body>${excerpt.content}</ac:rich-text-body>`;
          pageContent += `</ac:structured-macro>`;
        }
      }

      // Create page
      const createPageResponse = await api.asApp().requestConfluence(route`/wiki/api/v2/pages`, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId: spaceId,
          status: 'current',
          title: pageTitle,
          body: { representation: 'storage', value: pageContent }
        })
      });

      if (createPageResponse.ok) {
        const newPage = await createPageResponse.json();
        newPageId = newPage.id;
        pageUrl = `/wiki/spaces/${providedSpaceKey}/pages/${newPageId}`;
        console.log(`[Migration Worker] Page created: ${newPageId}`);
      } else {
        console.error('[Migration Worker] Failed to create page:', await createPageResponse.text());
      }
    }

    // Save result
    await storage.set(`migration-job:${jobId}`, {
      status: 'completed',
      success: true,
      summary: {
        total: sources.length,
        imported: imported.length,
        skipped: skipped.length,
        pageId: newPageId
      },
      imported,
      skipped,
      pageUrl,
      completedAt: new Date().toISOString()
    });

    console.log(`[Migration Worker] Job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`[Migration Worker] Job ${jobId} failed:`, error);

    await storage.set(`migration-job:${jobId}`, {
      status: 'failed',
      success: false,
      error: error.message,
      completedAt: new Date().toISOString()
    });
  }
}

/**
 * Handle ADF Migration: Fetch page, extract MultiExcerpt macros, convert to ADF, create pages
 */
async function handleAdfMigration(jobId, sourcePageId, providedSpaceKey) {
  try {
    console.log(`[ADF Migration] Fetching page ${sourcePageId}...`);

    // Step 1: Extract Forge metadata template from a working Blueprint Standard Source page
    const TEMPLATE_PAGE_ID = '65437697';
    console.log(`[ADF Migration] Extracting Forge metadata from template page ${TEMPLATE_PAGE_ID}...`);
    const forgeMetadata = await extractForgeMetadataTemplate(TEMPLATE_PAGE_ID);
    console.log(`[ADF Migration] Forge metadata extracted:`, JSON.stringify(forgeMetadata, null, 2));

    // Step 2: Fetch source page (using REST API v2 for better permissions)
    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${sourcePageId}?body-format=storage`
    );

    if (!pageResponse.ok) {
      const errorText = await pageResponse.text();
      throw new Error(`Failed to fetch page ${sourcePageId}: ${pageResponse.status} - ${errorText}`);
    }

    const pageData = await pageResponse.json();
    const storageContent = pageData.body.storage.value;

    console.log(`[ADF Migration] Page fetched. Storage content length: ${storageContent.length}`);

    console.log(`[ADF Migration] Page fetched, extracting MultiExcerpt macros...`);

    // Step 2: Extract MultiExcerpt macros with proper nesting support
    const macros = [];
    const macroStartRegex = /<ac:structured-macro ac:name="multiexcerpt-macro"[^>]*>/g;

    let startMatch;
    while ((startMatch = macroStartRegex.exec(storageContent)) !== null) {
      const startIndex = startMatch.index;

      // Find the matching closing tag by counting nested macros
      let depth = 1;
      let currentIndex = startIndex + startMatch[0].length;
      let endIndex = -1;

      while (depth > 0 && currentIndex < storageContent.length) {
        const nextOpen = storageContent.indexOf('<ac:structured-macro', currentIndex);
        const nextClose = storageContent.indexOf('</ac:structured-macro>', currentIndex);

        if (nextClose === -1) break;

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          currentIndex = nextOpen + 20; // Length of '<ac:structured-macro'
        } else {
          depth--;
          if (depth === 0) {
            endIndex = nextClose + 22; // Include '</ac:structured-macro>'
          }
          currentIndex = nextClose + 22;
        }
      }

      if (endIndex !== -1) {
        const fullMacro = storageContent.substring(startIndex, endIndex);

        // Extract name from parameter
        const nameMatch = fullMacro.match(/<ac:parameter ac:name="name">([^<]+)<\/ac:parameter>/);
        if (nameMatch) {
          const name = nameMatch[1].trim();

          // Extract rich-text-body content
          const bodyMatch = fullMacro.match(/<ac:rich-text-body>([\s\S]*)<\/ac:rich-text-body>/);
          const innerContent = bodyMatch ? bodyMatch[1] : '';

          if (name && innerContent) {
            macros.push({
              name,
              fullMacro,
              innerContent
            });
          }
        }
      }
    }

    console.log(`[ADF Migration] Extracted ${macros.length} MultiExcerpt macros`);

    if (macros.length === 0) {
      throw new Error('No MultiExcerpt macros found on page');
    }

    // Step 3: Determine space ID
    let spaceId;
    if (providedSpaceKey) {
      if (/^\d+$/.test(providedSpaceKey)) {
        spaceId = providedSpaceKey;
      } else {
        const spaceResponse = await api.asApp().requestConfluence(route`/wiki/api/v2/spaces?keys=${providedSpaceKey}`);
        if (spaceResponse.ok) {
          const spaceData = await spaceResponse.json();
          if (spaceData.results && spaceData.results.length > 0) {
            spaceId = spaceData.results[0].id;
          }
        }
      }
    } else {
      // Use space from source page
      spaceId = pageData.space.id;
    }

    if (!spaceId) {
      throw new Error('Could not determine space ID');
    }

    console.log(`[ADF Migration] Using space ID: ${spaceId}`);

    // Step 4: Build ONE page with all Blueprint Standard Source macros in ADF format
    console.log(`[ADF Migration] Converting ${macros.length} MultiExcerpt macros to ADF format...`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pageTitle = `Blueprint Standards (Migrated ${timestamp})`;

    const results = {
      created: [],
      errors: []
    };

    const adfContent = [];

    // Add header
    adfContent.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: `Blueprint Standards - Migrated from MultiExcerpt (${macros.length} total)`,
        marks: [{ type: 'strong' }]
      }]
    });

    adfContent.push({ type: 'rule' });

    // Convert each MultiExcerpt to Blueprint Standard Source macro
    for (const macro of macros) {
      try {
        const excerptId = generateUUID();
        const localId = generateUUID();

        console.log(`[ADF Migration] Converting ${macro.name} to ADF...`);

        // Convert storage content to ADF using Confluence API
        const conversionResponse = await api.asApp().requestConfluence(
          route`/wiki/rest/api/contentbody/convert/storage`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              value: macro.innerContent,
              representation: 'atlas_doc_format'
            })
          }
        );

        if (!conversionResponse.ok) {
          throw new Error(`Conversion failed: ${conversionResponse.status}`);
        }

        const conversionData = await conversionResponse.json();
        const adf = JSON.parse(conversionData.value);
        const innerContent = adf.content || [];

        // Add heading
        adfContent.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{
            type: 'text',
            text: macro.name
          }]
        });

        // Build Forge bodiedExtension node
        const bodiedExtension = {
          type: 'bodiedExtension',
          attrs: {
            layout: 'default',
            extensionType: forgeMetadata.extensionType,
            extensionKey: forgeMetadata.extensionKey,
            text: forgeMetadata.text,
            parameters: {
              layout: 'bodiedExtension',
              guestParams: {
                variables: [],
                excerptId: excerptId,
                toggles: [],
                category: 'Migrated from MultiExcerpt',
                excerptName: macro.name
              },
              forgeEnvironment: forgeMetadata.forgeEnvironment,
              extensionProperties: forgeMetadata.extensionProperties,
              localId: localId,
              extensionId: forgeMetadata.extensionId,
              render: forgeMetadata.render,
              extensionTitle: forgeMetadata.extensionTitle
            },
            localId: localId
          },
          content: innerContent
        };

        adfContent.push(bodiedExtension);

        results.created.push({
          name: macro.name,
          excerptId: excerptId,
          localId: localId
        });

        console.log(`[ADF Migration] ✓ Converted ${macro.name}`);

      } catch (error) {
        console.error(`[ADF Migration] ✗ Failed to convert ${macro.name}:`, error);
        results.errors.push({
          name: macro.name,
          error: error.message
        });
      }
    }

    // Build final ADF document
    const adfDocument = {
      version: 1,
      type: 'doc',
      content: adfContent
    };

    // Create the page with ADF format
    console.log(`[ADF Migration] Creating page with ${results.created.length} Source macros (${results.errors.length} errors)...`);

    const createPageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          spaceId: spaceId,
          status: 'current',
          title: pageTitle,
          body: {
            representation: 'atlas_doc_format',
            value: JSON.stringify(adfDocument)
          }
        })
      }
    );

    if (!createPageResponse.ok) {
      const errorText = await createPageResponse.text();
      throw new Error(`Page creation failed: ${createPageResponse.status} - ${errorText}`);
    }

    const newPage = await createPageResponse.json();
    console.log(`[ADF Migration] Page created: ${newPage.id}`);

    // Save result
    await storage.set(`migration-job:${jobId}`, {
      status: 'completed',
      success: true,
      summary: {
        total: macros.length,
        created: results.created.length,
        errors: results.errors.length,
        pageId: newPage.id
      },
      results,
      pageUrl: `/wiki/spaces/${providedSpaceKey || pageData.space.key}/pages/${newPage.id}`,
      completedAt: new Date().toISOString()
    });

    console.log(`[ADF Migration] Job ${jobId} completed: ${results.created.length} Source macros on page ${newPage.id}, ${results.errors.length} errors`);

  } catch (error) {
    console.error(`[ADF Migration] Job ${jobId} failed:`, error);

    await storage.set(`migration-job:${jobId}`, {
      status: 'failed',
      success: false,
      error: error.message,
      completedAt: new Date().toISOString()
    });
  }
}
