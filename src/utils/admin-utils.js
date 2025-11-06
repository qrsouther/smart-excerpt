/**
 * Admin Utility Functions
 *
 * Utility functions for the Blueprint Standards Admin page.
 * Includes CSV generation, data escaping, and other helper functions.
 *
 * Key functions:
 * - escapeCSV: Escape values for CSV format
 * - generateIncludesCSV: Generate CSV export for embed instances
 * - generateMultiExcerptCSV: Generate CSV for MultiExcerpt migration data
 */

import { extractTextFromAdf } from './adf-utils.js';

/**
 * Escape a value for CSV format
 *
 * Handles quotes, commas, and newlines according to CSV spec.
 * Wraps values in quotes if they contain special characters.
 *
 * @param {*} value - The value to escape
 * @returns {string} Escaped CSV value
 */
export const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Generate CSV export for embed instances
 *
 * Creates a CSV file with all embed data including:
 * - Page info (URL, title, anchor)
 * - Standard info (name, category, status)
 * - Variable values
 * - Toggle states
 * - Custom insertions
 * - Rendered content
 *
 * @param {Array} includesData - Array of embed instance objects
 * @returns {string} CSV string ready for download
 */
export const generateIncludesCSV = (includesData) => {
  if (!includesData || includesData.length === 0) {
    return '';
  }

  // Collect all unique variable names and toggle names
  const allVariableNames = new Set();
  const allToggleNames = new Set();

  includesData.forEach(inc => {
    if (inc.variables) {
      inc.variables.forEach(v => allVariableNames.add(v.name));
    }
    if (inc.toggles) {
      inc.toggles.forEach(t => allToggleNames.add(t.name));
    }
  });

  const variableColumns = Array.from(allVariableNames).sort();
  const toggleColumns = Array.from(allToggleNames).sort();

  // Build CSV header
  const headers = [
    'Page URL',
    'Page Title',
    'Heading Anchor',
    'Standard Name',
    'Standard Category',
    'Status',
    'Last Synced',
    'Standard Last Modified',
    ...variableColumns.map(v => `Variable: ${v}`),
    ...toggleColumns.map(t => `Toggle: ${t}`),
    'Custom Insertions',
    'Rendered Content (Plain Text)'
  ];

  // Build CSV rows
  const rows = includesData.map(inc => {
    const row = [
      escapeCSV(inc.pageUrl || ''),
      escapeCSV(inc.pageTitle || ''),
      escapeCSV(inc.headingAnchor || ''),
      escapeCSV(inc.excerptName || ''),
      escapeCSV(inc.excerptCategory || ''),
      escapeCSV(inc.status || ''),
      escapeCSV(inc.lastSynced || ''),
      escapeCSV(inc.excerptLastModified || '')
    ];

    // Add variable values
    variableColumns.forEach(varName => {
      const value = inc.variableValues?.[varName] || '';
      row.push(escapeCSV(value));
    });

    // Add toggle states
    toggleColumns.forEach(toggleName => {
      const state = inc.toggleStates?.[toggleName] || false;
      row.push(escapeCSV(state ? 'Enabled' : 'Disabled'));
    });

    // Add custom insertions text (concatenated with " | " delimiter)
    const customInsertionsText = (inc.customInsertions || [])
      .map(insertion => insertion.text || '')
      .filter(text => text.length > 0)
      .join(' | ');
    row.push(escapeCSV(customInsertionsText));

    // Add rendered content (convert ADF to plain text)
    let renderedText = '';
    if (inc.renderedContent) {
      // If renderedContent is an ADF object, extract text
      if (typeof inc.renderedContent === 'object') {
        renderedText = extractTextFromAdf(inc.renderedContent);
      } else {
        // If it's already a string, use it directly
        renderedText = inc.renderedContent;
      }
    }
    row.push(escapeCSV(renderedText));

    return row.join(',');
  });

  // Combine header and rows
  return [headers.join(','), ...rows].join('\n');
};

/**
 * Generate CSV export for MultiExcerpt migration data
 *
 * Creates a CSV file for legacy MultiExcerpt macro data to aid in migration.
 * Includes page info, macro name, source page, and variable values.
 *
 * @param {Array} includeData - Array of MultiExcerpt include objects
 * @returns {string} CSV string ready for download
 */
export const generateMultiExcerptCSV = (includeData) => {
  if (!includeData || includeData.length === 0) {
    return '';
  }

  // Collect all unique variable names across all includes
  const allVariables = new Set();
  includeData.forEach(inc => {
    if (inc.variableValues && Array.isArray(inc.variableValues)) {
      inc.variableValues.forEach(varObj => {
        if (varObj.k) {
          allVariables.add(varObj.k);
        }
      });
    }
  });

  const variableColumns = Array.from(allVariables).sort();

  // Build CSV header
  const baseHeaders = [
    'Page ID',
    'Page Title',
    'Page URL',
    'MultiStandard Name',
    'Source Page Title'
  ];

  // Add variable columns
  const variableHeaders = variableColumns.map(varName => `Variable: ${varName}`);

  const headers = [...baseHeaders, ...variableHeaders];

  // Build CSV rows
  const rows = includeData.map(inc => {
    const row = [
      escapeCSV(inc.pageId || ''),
      escapeCSV(inc.pageTitle || ''),
      escapeCSV(inc.pageUrl || ''),
      escapeCSV(inc.multiExcerptName || ''),
      escapeCSV(inc.sourcePageTitle || '')
    ];

    // Add variable values
    variableColumns.forEach(varName => {
      const varObj = inc.variableValues?.find(v => v.k === varName);
      const value = varObj?.v || '';
      row.push(escapeCSV(value));
    });

    return row.join(',');
  });

  // Combine header and rows
  return [headers.join(','), ...rows].join('\n');
};
