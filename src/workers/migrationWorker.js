/**
 * Migration Worker - Handles bulk import with 900s timeout
 * Runs asynchronously via Forge Events API queue
 */

import { storage } from '@forge/api';
import api, { route } from '@forge/api';
import { generateUUID } from '../utils.js';

export async function handler(event) {
  const { sources, deleteOldMigrations, spaceKey: providedSpaceKey, jobId } = event.payload;

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

      // Build page content (simplified - no full Source macros, just placeholders)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const pageTitle = `Blueprint Standards (Migrated ${timestamp})`;

      let pageContent = `<p><strong>Blueprint Standards - Migrated from MultiExcerpt</strong></p>`;
      pageContent += `<p>${imported.length} Blueprint Standards imported. Add Source macros to this page to edit them.</p>`;
      pageContent += `<hr /><h3>Imported Standards:</h3><ul>`;
      for (const item of imported) {
        pageContent += `<li><strong>${item.name}</strong> (ID: ${item.id})</li>`;
      }
      pageContent += `</ul>`;

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
