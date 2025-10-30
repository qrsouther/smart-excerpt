/**
 * Storage Utility Functions
 *
 * This module provides utilities for managing Forge storage operations,
 * particularly maintaining the excerpt index for fast retrieval.
 */

import { storage } from '@forge/api';

/**
 * Update the excerpt index with a modified or new excerpt
 *
 * Maintains a lightweight index of all excerpts for fast listing without loading
 * full excerpt data. Removes old entry if it exists and adds the updated entry.
 * The index is used by getExcerpts() resolver and admin UI listing.
 *
 * @param {Object} excerpt - The excerpt object to add/update in the index
 * @param {string} excerpt.id - Unique excerpt ID
 * @param {string} excerpt.name - Excerpt name
 * @param {string} excerpt.category - Excerpt category
 * @param {string} excerpt.updatedAt - ISO timestamp of last update
 * @returns {Promise<void>}
 *
 * @example
 * const excerpt = {
 *   id: 'abc-123',
 *   name: 'My Excerpt',
 *   category: 'General',
 *   updatedAt: new Date().toISOString()
 * };
 * await updateExcerptIndex(excerpt);
 */
export async function updateExcerptIndex(excerpt) {
  const index = await storage.get('excerpt-index') || { excerpts: [] };

  // Remove old entry if exists
  index.excerpts = index.excerpts.filter(e => e.id !== excerpt.id);

  // Add updated entry
  index.excerpts.push({
    id: excerpt.id,
    name: excerpt.name,
    category: excerpt.category,
    updatedAt: excerpt.updatedAt
  });

  await storage.set('excerpt-index', index);
}
