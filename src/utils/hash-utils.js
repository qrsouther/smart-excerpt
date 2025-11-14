/**
 * Hash Utility Functions
 *
 * Provides content hashing functionality for detecting actual content changes
 * (vs timestamp changes from just viewing pages).
 */

import crypto from 'crypto';

/**
 * Recursively normalize a JSON object by sorting all keys at every level
 * This ensures consistent serialization regardless of how Confluence orders keys
 *
 * @param {any} obj - The object to normalize
 * @returns {any} - Normalized object with sorted keys
 */
function normalizeJSON(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => normalizeJSON(item));
  }

  if (typeof obj === 'object') {
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = normalizeJSON(obj[key]);
    });
    return sorted;
  }

  return obj;
}

/**
 * Calculate a content hash for an excerpt
 *
 * This hash represents the "semantic content" of an excerpt - if any of these
 * fields change, the hash changes, indicating the excerpt has been meaningfully modified.
 *
 * Included in hash:
 * - content (ADF document)
 * - name
 * - category
 * - variables (array of {name, description, example, required})
 * - toggles (array of {name, description})
 * - documentationLinks (array of {anchor, url})
 *
 * NOT included in hash:
 * - id (immutable)
 * - timestamps (createdAt, updatedAt)
 * - source metadata (sourcePageId, sourceSpaceKey, sourceLocalId)
 *
 * @param {Object} excerpt - The excerpt object
 * @returns {string} - SHA256 hash of the content
 */
export function calculateContentHash(excerpt) {
  // Create a stable object with only the fields that matter for content comparison
  const hashableContent = {
    content: excerpt.content,
    name: excerpt.name,
    category: excerpt.category,
    variables: excerpt.variables || [],
    toggles: excerpt.toggles || [],
    documentationLinks: excerpt.documentationLinks || []
  };

  // Normalize the JSON to ensure consistent key ordering at all levels
  const normalized = normalizeJSON(hashableContent);

  // Convert to JSON string
  const jsonString = JSON.stringify(normalized);

  // Calculate SHA256 hash
  const hash = crypto.createHash('sha256').update(jsonString).digest('hex');

  return hash;
}

/**
 * Check if two content hashes are different
 *
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @returns {boolean} - True if hashes are different (content changed)
 */
export function hasContentChanged(hash1, hash2) {
  // Handle null/undefined cases
  if (!hash1 || !hash2) {
    return true; // If either hash is missing, assume content changed
  }

  return hash1 !== hash2;
}

/**
 * NOTE: Embed content hashing is handled by the version system's calculateContentHash()
 * in version-manager.js, which automatically excludes timestamps and metadata fields.
 *
 * The redlining system uses contentHash from version snapshots rather than calculating
 * it separately, ensuring consistency across the application and avoiding duplicate
 * hash calculation logic.
 *
 * See: src/utils/version-manager.js -> calculateContentHash()
 */
