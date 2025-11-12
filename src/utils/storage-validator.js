/**
 * Storage Validator Utility
 *
 * Provides pre-flight validation for all storage writes to prevent data corruption.
 * Part of Phase 1 Safety Patch (v7.16.0) - Data Safety & Versioning System.
 *
 * Features:
 * - Pre-flight validation before storage writes
 * - Before/after CSV snapshots for manual recovery
 * - Structured Forge logging with success/failure indicators
 * - Comprehensive data integrity checks
 *
 * Usage:
 *   import { validateExcerptData, safeStorageSet } from './utils/storage-validator.js';
 *
 *   // Option 1: Validate before writing
 *   const validation = validateExcerptData(excerpt);
 *   if (!validation.valid) {
 *     console.error('Validation failed:', validation.errors);
 *     throw new Error(`Cannot save excerpt: ${validation.errors.join(', ')}`);
 *   }
 *   await storage.set(`excerpt:${excerpt.id}`, excerpt);
 *
 *   // Option 2: Use safe wrapper (validates automatically + CSV logging)
 *   await safeStorageSet(storage, `excerpt:${excerpt.id}`, excerpt, validateExcerptData);
 *
 * @module storage-validator
 */

import {
  logFunction,
  logValidation,
  logSnapshot,
  logStorageOp,
  logFailure,
  logSuccess
} from './forge-logger.js';

/**
 * Validates Blueprint Standard Source (excerpt) data structure and integrity
 *
 * @param {Object} excerpt - The excerpt object to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export function validateExcerptData(excerpt) {
  const errors = [];

  // Required fields
  if (!excerpt || typeof excerpt !== 'object') {
    return { valid: false, errors: ['Excerpt must be an object'] };
  }

  if (!excerpt.id || typeof excerpt.id !== 'string') {
    errors.push('Missing or invalid id (must be string)');
  }

  if (!excerpt.name || typeof excerpt.name !== 'string') {
    errors.push('Missing or invalid name (must be string)');
  }

  if (!excerpt.content) {
    errors.push('Missing content');
  }

  // Content validation (must be ADF object, not XML string)
  if (excerpt.content) {
    // Check if content is old Storage Format (XML string) - this should not happen after conversion
    if (typeof excerpt.content === 'string') {
      errors.push('Content is Storage Format (XML string) - must be ADF JSON object');
    }
    // Check if content is valid ADF structure
    else if (typeof excerpt.content === 'object') {
      const adfValidation = validateAdfStructure(excerpt.content);
      if (!adfValidation.valid) {
        errors.push(`Invalid ADF structure: ${adfValidation.errors.join(', ')}`);
      }
    } else {
      errors.push('Content must be ADF object or Storage Format string');
    }
  }

  // Variables array validation
  if (!excerpt.variables || !Array.isArray(excerpt.variables)) {
    errors.push('Missing or invalid variables array');
  } else {
    // Check if variables array is empty when content has variable placeholders
    if (excerpt.content && typeof excerpt.content === 'object') {
      const contentStr = JSON.stringify(excerpt.content);
      const hasVariablePlaceholders = contentStr.includes('{{') || contentStr.includes('variablePlaceholder');

      if (hasVariablePlaceholders && excerpt.variables.length === 0) {
        errors.push('Variables array is empty but content contains variable placeholders');
      }

      // Validate each variable object
      for (let i = 0; i < excerpt.variables.length; i++) {
        const variable = excerpt.variables[i];
        if (!variable.name || typeof variable.name !== 'string') {
          errors.push(`Variable at index ${i} missing or invalid name`);
        }
        if (variable.defaultValue !== undefined && typeof variable.defaultValue !== 'string') {
          errors.push(`Variable "${variable.name}" has non-string defaultValue`);
        }
      }

      // Check for duplicate variable names
      const variableNames = excerpt.variables.map(v => v.name);
      const duplicates = variableNames.filter((name, index) => variableNames.indexOf(name) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate variable names found: ${duplicates.join(', ')}`);
      }
    }
  }

  // Source page reference validation (required for orphan detection)
  if (!excerpt.sourcePageId || typeof excerpt.sourcePageId !== 'string') {
    errors.push('Missing or invalid sourcePageId (required for orphan detection)');
  }

  if (!excerpt.sourceLocalId || typeof excerpt.sourceLocalId !== 'string') {
    errors.push('Missing or invalid sourceLocalId (required for orphan detection)');
  }

  // Content hash validation
  if (excerpt.contentHash) {
    if (typeof excerpt.contentHash !== 'string') {
      errors.push('Invalid contentHash (must be string)');
    } else if (excerpt.contentHash.length !== 64) {
      errors.push('Invalid contentHash (must be 64-character SHA-256 hash)');
    }

    // Verify contentHash matches actual content
    if (excerpt.content && typeof excerpt.content === 'object') {
      const crypto = require('crypto');
      const actualHash = crypto.createHash('sha256').update(JSON.stringify(excerpt.content)).digest('hex');
      if (excerpt.contentHash !== actualHash) {
        errors.push(`contentHash mismatch (expected ${actualHash.substring(0, 16)}..., got ${excerpt.contentHash.substring(0, 16)}...)`);
      }
    }
  }

  // Category validation
  if (excerpt.category !== undefined && typeof excerpt.category !== 'string') {
    errors.push('Invalid category (must be string)');
  }

  // Timestamp validation
  const timestampFields = ['createdAt', 'updatedAt'];
  for (const field of timestampFields) {
    if (excerpt[field]) {
      const date = new Date(excerpt[field]);
      if (isNaN(date.getTime())) {
        errors.push(`Invalid ${field} timestamp`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates Embed (macro-vars) configuration data
 *
 * @param {Object} macroVars - The macro-vars object to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export function validateMacroVarsData(macroVars) {
  const errors = [];

  // Required fields
  if (!macroVars || typeof macroVars !== 'object') {
    return { valid: false, errors: ['macroVars must be an object'] };
  }

  // excerptId reference (critical - embeds must reference a Source)
  if (!macroVars.excerptId || typeof macroVars.excerptId !== 'string') {
    errors.push('Missing or invalid excerptId (Embed must reference a Source)');
  }

  // Variable values validation
  if (macroVars.variableValues !== undefined) {
    if (typeof macroVars.variableValues !== 'object' || Array.isArray(macroVars.variableValues)) {
      errors.push('variableValues must be an object (key-value pairs)');
    } else {
      // Validate each variable value is a string
      for (const [key, value] of Object.entries(macroVars.variableValues)) {
        if (typeof value !== 'string') {
          errors.push(`Variable value for "${key}" must be string (got ${typeof value})`);
        }
      }
    }
  }

  // Toggle states validation
  if (macroVars.toggleStates !== undefined) {
    if (typeof macroVars.toggleStates !== 'object' || Array.isArray(macroVars.toggleStates)) {
      errors.push('toggleStates must be an object (key-value pairs)');
    } else {
      // Validate each toggle state is a boolean
      for (const [key, value] of Object.entries(macroVars.toggleStates)) {
        if (typeof value !== 'boolean') {
          errors.push(`Toggle state for "${key}" must be boolean (got ${typeof value})`);
        }
      }
    }
  }

  // Custom insertions validation
  if (macroVars.customInsertions !== undefined) {
    if (!Array.isArray(macroVars.customInsertions)) {
      errors.push('customInsertions must be an array');
    } else {
      for (let i = 0; i < macroVars.customInsertions.length; i++) {
        const insertion = macroVars.customInsertions[i];
        if (insertion.index === undefined || typeof insertion.index !== 'number') {
          errors.push(`Custom insertion at index ${i} missing or invalid index`);
        }
        if (!insertion.text || typeof insertion.text !== 'string') {
          errors.push(`Custom insertion at index ${i} missing or invalid text`);
        }
      }
    }
  }

  // Internal notes validation (similar to custom insertions)
  if (macroVars.internalNotes !== undefined) {
    if (!Array.isArray(macroVars.internalNotes)) {
      errors.push('internalNotes must be an array');
    } else {
      for (let i = 0; i < macroVars.internalNotes.length; i++) {
        const note = macroVars.internalNotes[i];
        if (note.index === undefined || typeof note.index !== 'number') {
          errors.push(`Internal note at index ${i} missing or invalid index`);
        }
        if (!note.text || typeof note.text !== 'string') {
          errors.push(`Internal note at index ${i} missing or invalid text`);
        }
      }
    }
  }

  // Timestamp validation
  if (macroVars.lastSynced) {
    const date = new Date(macroVars.lastSynced);
    if (isNaN(date.getTime())) {
      errors.push('Invalid lastSynced timestamp');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates ADF (Atlassian Document Format) structure
 *
 * @param {Object} adf - The ADF document to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export function validateAdfStructure(adf) {
  const errors = [];

  // Top-level structure validation
  if (!adf || typeof adf !== 'object') {
    return { valid: false, errors: ['ADF must be an object'] };
  }

  if (adf.type !== 'doc') {
    errors.push('ADF root must have type: "doc"');
  }

  if (adf.version !== 1) {
    errors.push('ADF root must have version: 1');
  }

  if (!Array.isArray(adf.content)) {
    errors.push('ADF root must have content array');
  } else if (adf.content.length === 0) {
    errors.push('ADF content array is empty (document has no content)');
  }

  // Deep validation: check for malformed nodes
  if (adf.content && Array.isArray(adf.content)) {
    const validateNode = (node, path = 'root') => {
      if (!node || typeof node !== 'object') {
        errors.push(`Invalid node at ${path}: must be object`);
        return;
      }

      if (!node.type || typeof node.type !== 'string') {
        errors.push(`Missing or invalid type at ${path}`);
      }

      // If node has content, recursively validate
      if (node.content) {
        if (!Array.isArray(node.content)) {
          errors.push(`Invalid content at ${path}: must be array`);
        } else {
          for (let i = 0; i < node.content.length; i++) {
            validateNode(node.content[i], `${path}.content[${i}]`);
          }
        }
      }

      // If node has marks, validate them
      if (node.marks) {
        if (!Array.isArray(node.marks)) {
          errors.push(`Invalid marks at ${path}: must be array`);
        }
      }

      // If node has attrs, ensure it's an object
      if (node.attrs !== undefined && typeof node.attrs !== 'object') {
        errors.push(`Invalid attrs at ${path}: must be object`);
      }
    };

    for (let i = 0; i < adf.content.length; i++) {
      validateNode(adf.content[i], `content[${i}]`);
    }
  }

  // Limit deep validation errors to first 5 to avoid overwhelming output
  if (errors.length > 5) {
    const remaining = errors.length - 5;
    errors.splice(5);
    errors.push(`... and ${remaining} more validation errors`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Safe storage.set() wrapper with automatic validation and CSV logging
 *
 * Validates data before writing to storage. Throws error if validation fails.
 * Logs before/after snapshots in CSV format for manual recovery if needed.
 * Use this instead of storage.set() directly for critical data writes.
 *
 * @param {Object} storage - Forge storage instance
 * @param {string} key - Storage key
 * @param {Object} data - Data to write
 * @param {Function} validator - Validation function (validateExcerptData, validateMacroVarsData, etc.)
 * @returns {Promise<void>}
 * @throws {Error} If validation fails
 *
 * @example
 *   await safeStorageSet(storage, `excerpt:${excerpt.id}`, excerpt, validateExcerptData);
 */
export async function safeStorageSet(storage, key, data, validator) {
  const FUNCTION_NAME = 'safeStorageSet';
  logFunction(FUNCTION_NAME, 'START', { key });

  try {
    // Capture "before" data for CSV snapshot
    let beforeData = null;
    try {
      beforeData = await storage.get(key);
    } catch (readError) {
      logFailure(FUNCTION_NAME, `Failed to read before-data for key "${key}"`, readError);
      // Continue anyway - this is just for logging
    }

    // Run validation
    const validation = validator(data);
    logValidation(FUNCTION_NAME, 'data', validation, { key });

    if (!validation.valid) {
      const errorMessage = `Storage write validation failed for key "${key}": ${validation.errors.join(', ')}`;
      logFailure(FUNCTION_NAME, errorMessage, validation.errors.join('; '), { key });
      throw new Error(errorMessage);
    }

    // Log CSV snapshot BEFORE write (for manual recovery)
    logSnapshot(FUNCTION_NAME, 'WRITE', key, beforeData, data);

    // Proceed with write
    await storage.set(key, data);
    logStorageOp(FUNCTION_NAME, 'WRITE', key, true);

    logSuccess(FUNCTION_NAME, `Successfully wrote validated data to key "${key}"`);
    logFunction(FUNCTION_NAME, 'END', { key, success: true });
  } catch (error) {
    logFailure(FUNCTION_NAME, `Failed to write data to key "${key}"`, error, { key });
    logFunction(FUNCTION_NAME, 'END', { key, success: false });
    throw error;
  }
}

/**
 * Validates usage tracking data structure
 *
 * @param {Object} usageData - The usage tracking object to validate
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
export function validateUsageData(usageData) {
  const errors = [];

  if (!usageData || typeof usageData !== 'object') {
    return { valid: false, errors: ['usageData must be an object'] };
  }

  if (!usageData.excerptId || typeof usageData.excerptId !== 'string') {
    errors.push('Missing or invalid excerptId');
  }

  if (!Array.isArray(usageData.references)) {
    errors.push('Missing or invalid references array');
  } else {
    for (let i = 0; i < usageData.references.length; i++) {
      const ref = usageData.references[i];
      if (!ref.localId || typeof ref.localId !== 'string') {
        errors.push(`Reference at index ${i} missing or invalid localId`);
      }
      if (!ref.pageId || typeof ref.pageId !== 'string') {
        errors.push(`Reference at index ${i} missing or invalid pageId`);
      }
      if (!ref.excerptId || typeof ref.excerptId !== 'string') {
        errors.push(`Reference at index ${i} missing or invalid excerptId`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
