/**
 * ADF Rendering Utilities
 *
 * Utility functions for manipulating and processing Atlassian Document Format (ADF) content.
 * These functions handle cleaning, filtering, variable substitution, and content insertion
 * for the Blueprint Standard (SmartExcerpt) application.
 *
 * Key operations:
 * - Cleaning ADF for Forge's AdfRenderer compatibility
 * - Toggle-based conditional content filtering
 * - Variable substitution with visual indicators for unset variables
 * - Custom paragraph and internal note insertions
 */

/**
 * Clean ADF for Forge's AdfRenderer
 *
 * Removes unsupported attributes and normalizes ADF structure for rendering.
 * Handles:
 * - localId removal (not supported by Forge)
 * - Null panel attributes
 * - Null table cell attributes
 * - Unsupported table attributes
 *
 * @param {Object} adfNode - ADF node to clean
 * @returns {Object} Cleaned ADF node
 */
export const cleanAdfForRenderer = (adfNode) => {
  if (!adfNode || typeof adfNode !== 'object') return adfNode;

  const cleaned = { ...adfNode };

  if (cleaned.attrs) {
    const cleanedAttrs = { ...cleaned.attrs };

    // Remove localId (not supported by Forge AdfRenderer)
    delete cleanedAttrs.localId;

    // Handle panels - remove null attributes
    if (cleaned.type === 'panel') {
      if (cleanedAttrs.panelIconId === null) delete cleanedAttrs.panelIconId;
      if (cleanedAttrs.panelIcon === null) delete cleanedAttrs.panelIcon;
      if (cleanedAttrs.panelIconText === null) delete cleanedAttrs.panelIconText;
      if (cleanedAttrs.panelColor === null) delete cleanedAttrs.panelColor;
    }

    // Remove null-valued table cell attributes
    if (cleaned.type === 'tableCell' || cleaned.type === 'tableHeader') {
      if (cleanedAttrs.background === null) delete cleanedAttrs.background;
      if (cleanedAttrs.colwidth === null) delete cleanedAttrs.colwidth;
    }

    // Remove unsupported table attributes
    if (cleaned.type === 'table') {
      if (cleanedAttrs.displayMode === null) delete cleanedAttrs.displayMode;
      delete cleanedAttrs.width;
      delete cleanedAttrs.__autoSize;
      delete cleanedAttrs.isNumberColumnEnabled;
      delete cleanedAttrs.layout;
    }

    cleaned.attrs = cleanedAttrs;
  }

  // Recursively clean content array
  if (cleaned.content && Array.isArray(cleaned.content)) {
    cleaned.content = cleaned.content.map(child => cleanAdfForRenderer(child));
  }

  return cleaned;
};

/**
 * Clean up empty or invalid nodes
 *
 * Removes empty text nodes and nodes with no content after toggle filtering.
 * Preserves certain node types that should remain even when empty (hardBreak, etc.).
 *
 * @param {Object} adfNode - ADF node to clean up
 * @returns {Object|null} Cleaned node or null if should be removed
 */
export const cleanupEmptyNodes = (adfNode) => {
  if (!adfNode) return null;

  // If it's a text node with empty text, remove it
  if (adfNode.type === 'text' && (!adfNode.text || adfNode.text.trim() === '')) {
    return null;
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    const cleanedContent = adfNode.content
      .map(child => cleanupEmptyNodes(child))
      .filter(child => child !== null);  // Remove null nodes

    // If this node has no content left after cleanup, remove it
    // Exception: Keep certain nodes even if empty (like hardBreak, etc)
    const keepEvenIfEmpty = ['hardBreak', 'rule', 'emoji', 'mention', 'date'];
    if (cleanedContent.length === 0 && !keepEvenIfEmpty.includes(adfNode.type)) {
      return null;
    }

    return {
      ...adfNode,
      content: cleanedContent
    };
  }

  return adfNode;
};

/**
 * Filter content based on toggle states
 *
 * Handles rich text formatting by processing toggle ranges across multiple nodes.
 * Removes content within disabled toggle ranges and strips toggle markers from enabled content.
 *
 * Toggle syntax: {{toggle:name}}content{{/toggle:name}}
 *
 * @param {Object} adfNode - ADF node to filter
 * @param {Object} toggleStates - Map of toggle names to boolean states
 * @returns {Object|null} Filtered ADF node
 */
export const filterContentByToggles = (adfNode, toggleStates) => {
  if (!adfNode) return null;

  // For container nodes (paragraph, doc, etc.), process toggle ranges across all children
  if (adfNode.content && Array.isArray(adfNode.content)) {
    // First pass: Flatten and extract all text with node references
    const flattenNodes = (nodes, path = []) => {
      const flattened = [];
      let textPosition = 0;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const currentPath = [...path, i];

        if (node.type === 'text' && node.text) {
          flattened.push({
            node,
            path: currentPath,
            textStart: textPosition,
            textEnd: textPosition + node.text.length,
            text: node.text
          });
          textPosition += node.text.length;
        } else if (node.content && Array.isArray(node.content)) {
          // Recursively flatten nested content
          const nested = flattenNodes(node.content, currentPath);
          flattened.push({
            node,
            path: currentPath,
            textStart: textPosition,
            textEnd: textPosition + nested.totalText.length,
            isContainer: true,
            children: nested.flattened
          });
          textPosition += nested.totalText.length;
        } else {
          // Non-text, non-container nodes (images, etc.)
          flattened.push({
            node,
            path: currentPath,
            textStart: textPosition,
            textEnd: textPosition,
            isLeaf: true
          });
        }
      }

      const totalText = flattened
        .map(f => f.text || '')
        .join('');

      return { flattened, totalText, textPosition };
    };

    const { flattened, totalText } = flattenNodes(adfNode.content);

    // Find all toggle ranges
    const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
    const toggleRanges = [];
    let match;

    while ((match = toggleRegex.exec(totalText)) !== null) {
      const toggleName = match[1].trim();
      const isEnabled = toggleStates?.[toggleName] === true;

      const openMarker = `{{toggle:${match[1]}}}`;
      const closeMarker = `{{/toggle:${match[1]}}}`;

      toggleRanges.push({
        name: toggleName,
        enabled: isEnabled,
        fullStart: match.index,
        fullEnd: match.index + match[0].length,
        contentStart: match.index + openMarker.length,
        contentEnd: match.index + match[0].length - closeMarker.length
      });
    }

    // Second pass: Filter and process nodes
    const processFlattened = () => {
      const newContent = [];

      for (const item of flattened) {
        // Check if node overlaps with any toggle range
        let inDisabledToggle = false;
        let textModifications = [];

        for (const range of toggleRanges) {
          if (!range.enabled) {
            // Node overlaps with disabled toggle - remove entire node
            // Check if node has ANY overlap with the full toggle range (including markers)
            if (item.textEnd > range.fullStart && item.textStart < range.fullEnd) {
              inDisabledToggle = true;
              break;
            }
          }
        }

        if (inDisabledToggle) {
          continue; // Skip this node
        }

        // For text nodes, strip toggle markers if present
        if (item.node.type === 'text' && item.text) {
          let newText = item.text;

          // Remove any toggle markers from this text node
          newText = newText.replace(/\{\{toggle:[^}]+\}\}/g, '');
          newText = newText.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          if (newText.trim() === '') {
            continue; // Skip empty nodes
          }

          newContent.push({ ...item.node, text: newText });
        } else if (item.isContainer) {
          // Recursively process container
          const processed = filterContentByToggles({ ...item.node }, toggleStates);
          if (processed) {
            newContent.push(processed);
          }
        } else {
          // Keep other nodes as-is
          newContent.push(item.node);
        }
      }

      return newContent;
    };

    const newContent = processFlattened();

    if (newContent.length === 0 && adfNode.type !== 'doc') {
      return null;
    }

    return {
      ...adfNode,
      content: newContent
    };
  }

  return adfNode;
};

/**
 * Strip toggle markers from text nodes
 *
 * Removes {{toggle:name}} and {{/toggle:name}} markers from rendered content.
 * This is applied AFTER filterContentByToggles to ensure markers are never visible.
 *
 * @param {Object} adfNode - ADF node to process
 * @returns {Object} ADF node with markers removed
 */
export const stripToggleMarkers = (adfNode) => {
  if (!adfNode) return adfNode;

  // If it's a text node, strip markers
  if (adfNode.type === 'text' && adfNode.text) {
    let text = adfNode.text;
    // Remove opening toggle markers
    text = text.replace(/\{\{toggle:[^}]+\}\}/g, '');
    // Remove closing toggle markers
    text = text.replace(/\{\{\/toggle:[^}]+\}\}/g, '');
    return { ...adfNode, text };
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    return {
      ...adfNode,
      content: adfNode.content.map(child => stripToggleMarkers(child))
    };
  }

  return adfNode;
};

/**
 * Perform variable substitution in ADF content
 *
 * Replaces {{variableName}} placeholders with actual values.
 * Unset variables (empty values) are wrapped in code marks for visual distinction.
 *
 * @param {Object} adfNode - ADF node to process
 * @param {Object} variableValues - Map of variable names to values
 * @returns {Object} ADF node with variables substituted
 */
export const substituteVariablesInAdf = (adfNode, variableValues) => {
  if (!adfNode) return adfNode;

  // If it's a text node, perform substitution
  if (adfNode.type === 'text' && adfNode.text) {
    let text = adfNode.text;
    const regex = /\{\{([^}]+)\}\}/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          text: text.substring(lastIndex, match.index)
        });
      }

      const varName = match[1].trim();
      const value = variableValues?.[varName];

      if (value) {
        // Variable has a value - substitute it
        parts.push({
          type: 'text',
          text: value
        });
      } else {
        // Variable is unset - keep as code/monospace
        parts.push({
          type: 'text',
          text: match[0],
          marks: [{ type: 'code' }]
        });
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        text: text.substring(lastIndex)
      });
    }

    // If we found variables, return a content array, otherwise return the original node
    if (parts.length === 0) {
      return adfNode;
    } else if (parts.length === 1 && !parts[0].marks) {
      return { ...adfNode, text: parts[0].text };
    } else {
      // Need to return multiple text nodes - caller must handle this
      return { ...adfNode, _parts: parts };
    }
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    const newContent = [];
    adfNode.content.forEach(child => {
      const processed = substituteVariablesInAdf(child, variableValues);
      if (processed._parts) {
        // Expand parts into multiple text nodes
        newContent.push(...processed._parts);
        delete processed._parts;
      } else {
        newContent.push(processed);
      }
    });
    return {
      ...adfNode,
      content: newContent
    };
  }

  return adfNode;
};

/**
 * Insert custom paragraphs into ADF content
 *
 * Inserts custom paragraph nodes at specified positions in the content.
 * Recursively traverses nested structures (panels, tables, etc.) to match
 * how extractParagraphsFromAdf counts paragraphs.
 *
 * @param {Object} adfNode - ADF node to process
 * @param {Array} customInsertions - Array of {position: number, text: string}
 * @returns {Object} ADF node with custom paragraphs inserted
 */
export const insertCustomParagraphsInAdf = (adfNode, customInsertions) => {
  if (!adfNode || !adfNode.content || !customInsertions || customInsertions.length === 0) {
    return adfNode;
  }

  // Use a shared counter object so it persists across recursive calls
  const paragraphIndex = { value: 0 };

  /**
   * Recursively process nodes and insert custom paragraphs
   * @param {Object} node - Current ADF node
   * @returns {Object} Processed node with insertions
   */
  const processNode = (node) => {
    if (!node) return node;

    // Create a copy of the node
    const processedNode = { ...node };

    // If this node has content array, recursively process it
    if (processedNode.content && Array.isArray(processedNode.content)) {
      const newContent = [];

      processedNode.content.forEach(childNode => {
        // Process the child node recursively first
        const processedChild = processNode(childNode);
        newContent.push(processedChild);

        // If the child is a paragraph, check if we need to insert custom content after it
        if (childNode.type === 'paragraph') {
          // Find all insertions for this position
          const insertionsHere = customInsertions.filter(ins => ins.position === paragraphIndex.value);

          insertionsHere.forEach(insertion => {
            // Create a new paragraph node with the custom text
            newContent.push({
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: insertion.text
                }
              ]
            });
          });

          paragraphIndex.value++;
        }
      });

      processedNode.content = newContent;
    }

    return processedNode;
  };

  return processNode(adfNode);
};

/**
 * Insert internal note markers inline in ADF content
 *
 * Uses footnote-style numbering with content collected at the bottom.
 * Recursively traverses nested structures (panels, tables, etc.) to match
 * how extractParagraphsFromAdf counts paragraphs.
 *
 * All internal note elements use distinctive purple color (#6554C0) for:
 * 1. CSS styling in Confluence (distinctive appearance)
 * 2. External filtering (hide from external users)
 *
 * @param {Object} adfNode - ADF node to process
 * @param {Array} internalNotes - Array of {position: number, content: string}
 * @returns {Object} ADF node with internal notes inserted
 */
export const insertInternalNotesInAdf = (adfNode, internalNotes) => {
  if (!adfNode || !adfNode.content || !internalNotes || internalNotes.length === 0) {
    return adfNode;
  }

  // Sort notes by position to assign sequential footnote numbers
  const sortedNotes = [...internalNotes].sort((a, b) => a.position - b.position);

  // Create a map of position -> footnote number
  const positionToNumber = {};
  sortedNotes.forEach((note, index) => {
    positionToNumber[note.position] = index + 1;
  });

  // Unicode superscript numbers
  const superscriptNumbers = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  const toSuperscript = (num) => {
    return num.toString().split('').map(digit => superscriptNumbers[parseInt(digit)]).join('');
  };

  // Use a shared counter object so it persists across recursive calls
  const paragraphIndex = { value: 0 };

  /**
   * Recursively process nodes and add inline note markers to paragraphs
   * @param {Object} node - Current ADF node
   * @returns {Object} Processed node with markers
   */
  const processNode = (node) => {
    if (!node) return node;

    // Create a copy of the node
    const processedNode = { ...node };

    // If this is a paragraph, check if we need to add a note marker
    if (node.type === 'paragraph') {
      const noteNumber = positionToNumber[paragraphIndex.value];

      if (noteNumber) {
        // Add the paragraph with an inline footnote marker at the end
        const paragraphContent = [...(node.content || [])];

        // Add inline marker with distinctive purple color for internal notes
        // External filtering app should remove text nodes with color #6554C0 (purple)
        paragraphContent.push({
          type: 'text',
          text: toSuperscript(noteNumber),
          marks: [
            {
              type: 'textColor',
              attrs: {
                color: '#6554C0' // Purple marks internal note references
              }
            },
            {
              type: 'strong'
            }
          ]
        });

        processedNode.content = paragraphContent;
      }

      paragraphIndex.value++;
    }

    // If this node has content array, recursively process it
    if (node.content && Array.isArray(node.content)) {
      processedNode.content = node.content.map(childNode => processNode(childNode));
    }

    return processedNode;
  };

  // Process the entire tree recursively
  const processedAdf = processNode(adfNode);
  const newContent = [...processedAdf.content];

  // Add footnotes section at the bottom wrapped in an expand node
  if (sortedNotes.length > 0) {
    // Wrap entire footnotes section in an expandable/collapsible section
    // External filtering app will hide all expand nodes
    const footnotesContent = [];

    // Add "Internal Notes" heading with lock icon
    footnotesContent.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '🔒 Internal Notes',
          marks: [
            {
              type: 'strong'
            },
            {
              type: 'em'
            }
          ]
        }
      ]
    });

    // Add each footnote with its number
    sortedNotes.forEach((note, index) => {
      const footnoteNumber = index + 1;
      footnotesContent.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `${toSuperscript(footnoteNumber)} `,
            marks: [
              {
                type: 'strong'
              }
            ]
          },
          {
            type: 'text',
            text: note.content,
            marks: [
              {
                type: 'em'
              }
            ]
          }
        ]
      });
    });

    // Use an expand (collapsible section) for internal notes
    // This gives us a cleaner appearance without forced panel icons
    // External filtering app should hide expand nodes with title '🔒 Internal Notes'
    newContent.push({
      type: 'expand',
      attrs: {
        title: '🔒 Internal Notes'
      },
      content: footnotesContent.slice(1) // Skip the heading since expand already has a title
    });
  }

  return {
    ...adfNode,
    content: newContent
  };
};

/**
 * Extract paragraphs from ADF content
 *
 * Returns array of paragraph metadata for UI display and position selection.
 *
 * @param {Object} adfNode - ADF node to process
 * @returns {Array} Array of {index, lastSentence, fullText}
 */
export const extractParagraphsFromAdf = (adfNode) => {
  const paragraphs = [];

  if (!adfNode || !adfNode.content) return paragraphs;

  const traverseContent = (node, paragraphIndex = { value: 0 }) => {
    if (!node) return;

    // If this is a paragraph node, extract text
    if (node.type === 'paragraph') {
      let fullText = '';

      // Recursively extract text from paragraph content
      const extractText = (contentNode) => {
        if (!contentNode) return '';

        if (contentNode.type === 'text') {
          return contentNode.text || '';
        }

        if (contentNode.content && Array.isArray(contentNode.content)) {
          return contentNode.content.map(child => extractText(child)).join('');
        }

        return '';
      };

      if (node.content && Array.isArray(node.content)) {
        fullText = node.content.map(child => extractText(child)).join('');
      }

      // Extract last sentence (rough heuristic: split by period/question/exclamation)
      const sentences = fullText.split(/[.!?]+/).filter(s => s.trim());
      const lastSentence = sentences.length > 0 ? sentences[sentences.length - 1].trim() : fullText.trim();

      if (fullText.trim()) {
        paragraphs.push({
          index: paragraphIndex.value,
          lastSentence: lastSentence.substring(0, 60) + (lastSentence.length > 60 ? '...' : ''),
          fullText: fullText
        });
        paragraphIndex.value++;
      }
    }

    // Recursively traverse content
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(child => traverseContent(child, paragraphIndex));
    }
  };

  traverseContent(adfNode);
  return paragraphs;
};
