/**
 * ADF (Atlassian Document Format) Utility Functions
 *
 * This module provides utilities for parsing and extracting data from
 * Confluence's ADF (Atlassian Document Format) structure.
 */

/**
 * Extract plain text from an ADF (Atlassian Document Format) node
 *
 * Recursively traverses the ADF tree structure and concatenates all text nodes
 * into a single string. Used for content analysis, variable detection, and search.
 *
 * @param {Object} adfNode - The ADF node to extract text from
 * @returns {string} Concatenated plain text from all text nodes
 *
 * @example
 * const adfDoc = {
 *   type: 'doc',
 *   content: [
 *     { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
 *   ]
 * };
 * const text = extractTextFromAdf(adfDoc); // Returns: "Hello"
 */
export function extractTextFromAdf(adfNode) {
  if (!adfNode) return '';

  let text = '';

  // If it's a text node, return its text
  if (adfNode.text) {
    text += adfNode.text;
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    for (const child of adfNode.content) {
      text += extractTextFromAdf(child);
    }
  }

  return text;
}

/**
 * Find the heading that appears directly before a macro with a specific localId
 *
 * Traverses the ADF document to find the last heading that appears before the
 * target macro. Used for creating heading anchors in usage tracking and navigation.
 *
 * @param {Object} adfDoc - The complete ADF document structure
 * @param {string} targetLocalId - The localId of the macro to find
 * @returns {string|null} The text of the heading before the macro, or null if not found
 *
 * @example
 * const heading = findHeadingBeforeMacro(adfDoc, 'macro-123');
 * // Returns: "Section Title" or null
 */
export function findHeadingBeforeMacro(adfDoc, targetLocalId) {
  if (!adfDoc || !adfDoc.content) return null;

  let lastHeading = null;

  // Recursively traverse the ADF structure
  function traverse(nodes) {
    for (const node of nodes) {
      // Track the most recent heading
      if (node.type === 'heading' && node.content) {
        lastHeading = extractTextFromAdf(node);
      }

      // Check if this is the target macro (extension or bodiedExtension)
      if ((node.type === 'extension' || node.type === 'bodiedExtension') &&
          node.attrs?.localId === targetLocalId) {
        return lastHeading;
      }

      // Recursively check children
      if (node.content && Array.isArray(node.content)) {
        const result = traverse(node.content);
        if (result !== null && result !== undefined) {
          return result;
        }
      }
    }
    return null;
  }

  return traverse(adfDoc.content);
}
