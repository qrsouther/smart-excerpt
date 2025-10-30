/**
 * Content Detection Utility Functions
 *
 * This module provides utilities for detecting variables and toggles
 * within excerpt content using regex pattern matching.
 */

import { extractTextFromAdf } from './adf-utils.js';

/**
 * Detect variables in content using {{variable}} syntax
 *
 * Searches for variable placeholders in the format {{variable-name}} and returns
 * an array of unique variables found. Excludes toggle markers ({{toggle:...}}).
 * Supports both plain text strings and ADF format objects.
 *
 * @param {string|Object} content - The content to scan (plain text or ADF object)
 * @returns {Array<Object>} Array of variable objects with name, description, and example
 *
 * @example
 * const content = "Hello {{name}}, your {{role}} is important.";
 * const vars = detectVariables(content);
 * // Returns: [
 * //   { name: 'name', description: '', example: '' },
 * //   { name: 'role', description: '', example: '' }
 * // ]
 */
export function detectVariables(content) {
  const variables = [];
  const variableRegex = /\{\{([^}]+)\}\}/g;
  let match;

  // Extract text from content (handle both string and ADF object)
  let textContent = '';
  if (typeof content === 'string') {
    textContent = content;
  } else if (content && typeof content === 'object') {
    // ADF format
    textContent = extractTextFromAdf(content);
  }

  while ((match = variableRegex.exec(textContent)) !== null) {
    const varName = match[1].trim();
    // Skip toggle markers (they start with "toggle:" or "/toggle:")
    if (varName.startsWith('toggle:') || varName.startsWith('/toggle:')) {
      continue;
    }
    if (!variables.find(v => v.name === varName)) {
      variables.push({
        name: varName,
        description: '',
        example: ''
      });
    }
  }

  return variables;
}

/**
 * Detect toggle blocks in content using {{toggle:name}} syntax
 *
 * Searches for toggle markers in the format {{toggle:name}} and returns an array
 * of unique toggles found. Toggles allow show/hide sections within excerpts.
 * Supports both plain text strings and ADF format objects.
 *
 * @param {string|Object} content - The content to scan (plain text or ADF object)
 * @returns {Array<Object>} Array of toggle objects with name and description
 *
 * @example
 * const content = "{{toggle:advanced}}Advanced content here{{/toggle:advanced}}";
 * const toggles = detectToggles(content);
 * // Returns: [
 * //   { name: 'advanced', description: '' }
 * // ]
 */
export function detectToggles(content) {
  const toggles = [];
  const toggleRegex = /\{\{toggle:([^}]+)\}\}/g;
  let match;

  // Extract text from content (handle both string and ADF object)
  let textContent = '';
  if (typeof content === 'string') {
    textContent = content;
  } else if (content && typeof content === 'object') {
    // ADF format
    textContent = extractTextFromAdf(content);
  }

  while ((match = toggleRegex.exec(textContent)) !== null) {
    const toggleName = match[1].trim();
    if (!toggles.find(t => t.name === toggleName)) {
      toggles.push({
        name: toggleName,
        description: ''
      });
    }
  }

  return toggles;
}
