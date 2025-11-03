import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Em,
  Code,
  Heading,
  Textfield,
  Toggle,
  Button,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Stack,
  Inline,
  Tooltip,
  Icon,
  DynamicTable,
  Box,
  Spinner,
  SectionMessage,
  Select,
  Lozenge,
  xcss,
  useConfig,
  useProductContext,
  AdfRenderer
} from '@forge/react';
import { invoke, router, view } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Style for preview border
const previewBoxStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200'
});

// Style for full-width variable table container
const variableBoxStyle = xcss({
  width: '100%',
  backgroundColor: 'color.background.neutral',
  paddingBlockStart: 'space.200',
  paddingBlockEnd: 'space.100',
  paddingInline: 'space.100'
});

// Style for required field warning border
const requiredFieldStyle = xcss({
  borderColor: 'color.border.warning',
  borderWidth: 'border.width.outline',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.050'
});

// Diff view styles for current version (gray border)
const diffCurrentVersionStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.150',
  backgroundColor: 'color.background.neutral.subtle'
});

// Diff view styles for new version (green border)
const diffNewVersionStyle = xcss({
  borderColor: 'color.border.success',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.150',
  backgroundColor: 'color.background.success.subtle'
});

// Style for Update Available banner
const updateBannerStyle = xcss({
  padding: 'space.100',
  marginBottom: 'space.200'
});

// Style for View Diff button with border
const viewDiffButtonStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  paddingInline: 'space.050'
});


// Helper function to clean ADF for Forge's AdfRenderer
const cleanAdfForRenderer = (adfNode) => {
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

// Helper function to clean up empty or invalid nodes after toggle filtering
const cleanupEmptyNodes = (adfNode) => {
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

// Helper function to filter content based on toggle states
// Handles rich text formatting by processing toggle ranges across multiple nodes
const filterContentByToggles = (adfNode, toggleStates) => {
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

// Helper function to strip toggle markers from text nodes
// Removes {{toggle:name}} and {{/toggle:name}} markers from rendered content
// This is applied AFTER filterContentByToggles to ensure markers are never visible
const stripToggleMarkers = (adfNode) => {
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

// Helper function to perform variable substitution in ADF content
// Unset variables (empty values) are wrapped in code marks for visual distinction
const substituteVariablesInAdf = (adfNode, variableValues) => {
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

// Helper function to insert custom paragraphs into ADF content
// customInsertions is an array of { position: number, text: string }
const insertCustomParagraphsInAdf = (adfNode, customInsertions) => {
  if (!adfNode || !adfNode.content || !customInsertions || customInsertions.length === 0) {
    return adfNode;
  }

  const newContent = [];
  let paragraphIndex = 0;

  // Traverse content and insert custom paragraphs after specified positions
  adfNode.content.forEach(node => {
    // Add the original node
    newContent.push(node);

    // If this is a paragraph, check if we need to insert custom content after it
    if (node.type === 'paragraph') {
      // Find all insertions for this position
      const insertionsHere = customInsertions.filter(ins => ins.position === paragraphIndex);

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

      paragraphIndex++;
    }
  });

  return {
    ...adfNode,
    content: newContent
  };
};

// Helper function to insert internal note markers inline in ADF content
// Uses footnote-style numbering with content collected at the bottom
// All internal note elements use 'internal-note-marker' class for:
// 1. CSS styling in Confluence (distinctive appearance)
// 2. External filtering (hide from external users)
// internalNotes is an array of { position: number, content: string }
const insertInternalNotesInAdf = (adfNode, internalNotes) => {
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

  const newContent = [];
  let paragraphIndex = 0;

  // Traverse content and insert inline markers at the end of specified paragraphs
  adfNode.content.forEach(node => {
    if (node.type === 'paragraph') {
      // Check if there's an internal note for this position
      const noteNumber = positionToNumber[paragraphIndex];

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

        newContent.push({
          ...node,
          content: paragraphContent
        });
      } else {
        // No note at this position, keep the paragraph as is
        newContent.push(node);
      }

      paragraphIndex++;
    } else {
      // Not a paragraph, keep as is
      newContent.push(node);
    }
  });

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

// Helper function to extract paragraphs from ADF content
// Returns array of { index, lastSentence, fullText }
const extractParagraphsFromAdf = (adfNode) => {
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

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// Custom hook for fetching excerpt data with React Query
const useExcerptData = (excerptId, enabled) => {
  return useQuery({
    queryKey: ['excerpt', excerptId],
    queryFn: async () => {
      // This shouldn't run when excerptId is null due to enabled check,
      // but React Query may still initialize - just skip silently
      if (!excerptId) {
        return null;
      }

      console.log('[REACT-QUERY] Fetching excerpt:', excerptId);
      const result = await invoke('getExcerpt', { excerptId });

      if (!result.success || !result.excerpt) {
        throw new Error('Failed to load excerpt');
      }

      console.log('[REACT-QUERY] Excerpt fetched successfully:', {
        id: result.excerpt.id,
        name: result.excerpt.name,
        cached: false
      });

      return result.excerpt;
    },
    enabled: enabled && !!excerptId,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes (renamed from cacheTime in v5)
  });
};

// Custom hook for saving variable values with React Query mutation
const useSaveVariableValues = () => {
  return useMutation({
    mutationFn: async ({ localId, excerptId, variableValues, toggleStates, customInsertions, internalNotes }) => {
      console.log('[REACT-QUERY-MUTATION] Saving variable values:', {
        localId,
        excerptId,
        variableCount: Object.keys(variableValues || {}).length,
        toggleCount: Object.keys(toggleStates || {}).length,
        insertionCount: (customInsertions || []).length,
        noteCount: (internalNotes || []).length
      });

      const result = await invoke('saveVariableValues', {
        localId,
        excerptId,
        variableValues,
        toggleStates,
        customInsertions,
        internalNotes
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save variable values');
      }

      console.log('[REACT-QUERY-MUTATION] Save successful!');
      return result;
    },
    onSuccess: (data) => {
      console.log('[REACT-QUERY-MUTATION] onSuccess callback - data saved to backend');
    },
    onError: (error) => {
      console.error('[REACT-QUERY-MUTATION] Save failed:', error);
    }
  });
};

// Custom hook for fetching available excerpts list with React Query
const useAvailableExcerpts = (enabled) => {
  return useQuery({
    queryKey: ['excerpts', 'list'],
    queryFn: async () => {
      console.log('[REACT-QUERY] Fetching available excerpts list');
      const result = await invoke('getExcerpts');

      if (!result.success) {
        throw new Error('Failed to load excerpts');
      }

      console.log('[REACT-QUERY] Available excerpts loaded:', {
        count: (result.excerpts || []).length,
        cached: false
      });

      return result.excerpts || [];
    },
    enabled: enabled,
    staleTime: 1000 * 60 * 2, // 2 minutes - excerpt list doesn't change often
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
};

// Custom hook for fetching variable values with React Query
const useVariableValues = (localId, enabled) => {
  return useQuery({
    queryKey: ['variableValues', localId],
    queryFn: async () => {
      console.log('[REACT-QUERY] Fetching variable values for localId:', localId);
      const result = await invoke('getVariableValues', { localId });

      if (!result.success) {
        throw new Error('Failed to load variable values');
      }

      console.log('[REACT-QUERY] Variable values loaded:', {
        excerptId: result.excerptId || null,
        variableCount: Object.keys(result.variableValues || {}).length,
        toggleCount: Object.keys(result.toggleStates || {}).length,
        insertionCount: (result.customInsertions || []).length,
        noteCount: (result.internalNotes || []).length
      });

      return result;
    },
    enabled: enabled && !!localId,
    staleTime: 1000 * 30, // 30 seconds - this changes frequently during editing
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

// Custom hook for fetching cached content in view mode with React Query
const useCachedContent = (localId, excerptId, enabled, context, setVariableValues, setToggleStates, setCustomInsertions, setInternalNotes, setExcerptForViewMode) => {
  return useQuery({
    queryKey: ['cachedContent', localId],
    queryFn: async () => {
      console.log('[REACT-QUERY] Fetching cached content for localId:', localId);

      // First, try to get cached content
      const cachedResult = await invoke('getCachedContent', { localId });

      if (cachedResult && cachedResult.content) {
        console.log('[REACT-QUERY] Cached content found');
        return { content: cachedResult.content, fromCache: true };
      }

      // No cached content - fetch fresh and process
      console.log('[REACT-QUERY] No cached content found, fetching fresh content to populate cache');

      const excerptResult = await invoke('getExcerpt', { excerptId });
      if (!excerptResult.success || !excerptResult.excerpt) {
        throw new Error('Failed to load excerpt');
      }

      setExcerptForViewMode(excerptResult.excerpt);

      // Load variable values and check for orphaned data
      console.log(`[REACT-QUERY] Loading vars for localId: ${localId}`);
      let varsResult = await invoke('getVariableValues', { localId });
      console.log(`[REACT-QUERY] getVariableValues result:`, varsResult);

      // CRITICAL: Check if data is missing - attempt recovery from drag-to-move
      const hasNoData = !varsResult.lastSynced &&
                        Object.keys(varsResult.variableValues || {}).length === 0 &&
                        Object.keys(varsResult.toggleStates || {}).length === 0 &&
                        (varsResult.customInsertions || []).length === 0 &&
                        (varsResult.internalNotes || []).length === 0;

      console.log(`[REACT-QUERY] hasNoData: ${hasNoData}, excerptId: ${excerptId}`);

      if (varsResult.success && hasNoData && excerptId) {
        console.log('[REACT-QUERY] Attempting recovery in view mode...');
        const pageId = context?.contentId || context?.extension?.content?.id;

        const recoveryResult = await invoke('recoverOrphanedData', {
          pageId: pageId,
          excerptId: excerptId,
          currentLocalId: context.localId
        });

        console.log('[REACT-QUERY] Recovery result:', recoveryResult);

        if (recoveryResult.success && recoveryResult.recovered) {
          console.log(`[REACT-QUERY] Data recovered from ${recoveryResult.migratedFrom}!`);
          // Reload the data
          varsResult = await invoke('getVariableValues', { localId });
          console.log('[REACT-QUERY] Reloaded data after recovery:', varsResult);
        }
      }

      const loadedVariableValues = varsResult.success ? varsResult.variableValues : {};
      const loadedToggleStates = varsResult.success ? varsResult.toggleStates : {};
      const loadedCustomInsertions = varsResult.success ? varsResult.customInsertions : [];
      const loadedInternalNotes = varsResult.success ? varsResult.internalNotes : [];

      setVariableValues(loadedVariableValues);
      setToggleStates(loadedToggleStates);
      setCustomInsertions(loadedCustomInsertions);
      setInternalNotes(loadedInternalNotes);

      // Generate and cache the content
      let freshContent = excerptResult.excerpt.content;
      const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

      if (isAdf) {
        freshContent = filterContentByToggles(freshContent, loadedToggleStates);
        freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
        freshContent = insertCustomParagraphsInAdf(freshContent, loadedCustomInsertions);
        freshContent = insertInternalNotesInAdf(freshContent, loadedInternalNotes);
      } else {
        // For plain text, filter toggles
        const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
        freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
          const trimmedName = toggleName.trim();
          return loadedToggleStates?.[trimmedName] === true ? content : '';
        });
        // Strip any remaining markers
        freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
        freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

        // Substitute variables
        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (excerptResult.excerpt.variables) {
          excerptResult.excerpt.variables.forEach(variable => {
            const value = loadedVariableValues[variable.name] || `{{${variable.name}}}`;
            const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
            freshContent = freshContent.replace(regex, value);
          });
        }
      }

      // Cache it for next time
      await invoke('saveCachedContent', {
        localId,
        renderedContent: freshContent
      });

      console.log('[REACT-QUERY] Fresh content generated and cached');
      return { content: freshContent, fromCache: false };
    },
    enabled: enabled && !!localId && !!excerptId,
    staleTime: 1000 * 60 * 5, // 5 minutes - cached content should be stable
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
};

const App = () => {
  const config = useConfig();
  const context = useProductContext();
  const queryClient = useQueryClient();
  const isEditing = context?.extension?.isEditing;  // Fixed: it's on extension, not extensionContext!

  // Use context.localId directly - recovery happens lazily only when data is missing
  const effectiveLocalId = context?.localId;

  // NEW: Inline excerpt selection state (will be loaded from backend storage)
  const [selectedExcerptId, setSelectedExcerptId] = useState(null);
  // availableExcerpts state removed - now managed by React Query
  const [isInitializing, setIsInitializing] = useState(true);

  const [content, setContent] = useState(null);
  // excerpt state removed - now managed by React Query
  const [excerptForViewMode, setExcerptForViewMode] = useState(null);
  const [variableValues, setVariableValues] = useState(config?.variableValues || {});
  const [toggleStates, setToggleStates] = useState(config?.toggleStates || {});
  const [customInsertions, setCustomInsertions] = useState(config?.customInsertions || []);
  const [internalNotes, setInternalNotes] = useState(config?.internalNotes || []);
  const [insertionType, setInsertionType] = useState('body'); // 'body' or 'note'
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [customText, setCustomText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', or 'error'
  const [selectedTabIndex, setSelectedTabIndex] = useState(0); // Track active tab (0=Write, 1=Alternatives, 2=Free Write)
  // View mode staleness detection state
  const [isStale, setIsStale] = useState(false);
  const [sourceLastModified, setSourceLastModified] = useState(null);
  const [includeLastSynced, setIncludeLastSynced] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDiffView, setShowDiffView] = useState(false);
  const [latestRenderedContent, setLatestRenderedContent] = useState(null);

  // Use React Query to fetch excerpt data (only in edit mode)
  const {
    data: excerptFromQuery,
    isLoading: isLoadingExcerpt,
    error: excerptError,
    isFetching: isFetchingExcerpt
  } = useExcerptData(selectedExcerptId, isEditing);

  // Use React Query mutation for saving variable values
  const {
    mutate: saveVariableValuesMutation,
    isPending: isSavingVariables,
    isSuccess: isSaveSuccess,
    isError: isSaveError
  } = useSaveVariableValues();

  // Use React Query to fetch available excerpts list (only in edit mode)
  const {
    data: availableExcerpts = [],
    isLoading: isLoadingExcerpts,
    error: excerptsError
  } = useAvailableExcerpts(isEditing);

  // Use React Query to fetch variable values (always, both edit and view mode)
  const {
    data: variableValuesData,
    isLoading: isLoadingVariableValues,
    error: variableValuesError
  } = useVariableValues(effectiveLocalId, true);

  // Use React Query to fetch cached content (view mode only)
  const {
    data: cachedContentData,
    isLoading: isLoadingCachedContent,
    error: cachedContentError
  } = useCachedContent(
    effectiveLocalId,
    selectedExcerptId,
    !isEditing, // Only fetch in view mode
    context,
    setVariableValues,
    setToggleStates,
    setCustomInsertions,
    setInternalNotes,
    setExcerptForViewMode
  );

  // Use excerptFromQuery when available (edit mode), fallback to manual state for view mode
  const excerpt = isEditing ? excerptFromQuery : excerptForViewMode;

  // Load excerptId from React Query data
  useEffect(() => {
    if (variableValuesData && variableValuesData.excerptId) {
      setSelectedExcerptId(variableValuesData.excerptId);
    }
    if (!isLoadingVariableValues) {
      setIsInitializing(false);
    }
  }, [variableValuesData, isLoadingVariableValues]);

  // Set content from React Query cached content data (view mode)
  useEffect(() => {
    if (!isEditing && cachedContentData) {
      console.log('[REACT-QUERY] Setting content from cached data:', {
        fromCache: cachedContentData.fromCache
      });
      setContent(cachedContentData.content);
    }
  }, [isEditing, cachedContentData]);

  // In edit mode, process excerpt data from React Query
  useEffect(() => {
    if (!isEditing || !selectedExcerptId || !effectiveLocalId) {
      return;
    }

    const loadContent = async () => {
      // Wait for React Query to load the excerpt
      if (!excerptFromQuery) {
        console.log('[REACT-QUERY] Waiting for excerpt data...');
        return;
      }

      setIsRefreshing(true);

      try {
        console.log('[REACT-QUERY] Processing loaded excerpt:', {
          id: excerptFromQuery.id,
          name: excerptFromQuery.name,
          sourcePageId: excerptFromQuery.sourcePageId,
          sourceSpaceKey: excerptFromQuery.sourceSpaceKey,
          fromCache: !isFetchingExcerpt
        });

        // Load saved variable values, toggle states, custom insertions, and internal notes from storage
        console.log(`[DRAG-DEBUG] Loading data for localId: ${context.localId}`);
        let varsResultForLoading = await invoke('getVariableValues', { localId: effectiveLocalId });
        console.log(`[DRAG-DEBUG] getVariableValues result:`, varsResultForLoading);

        // CRITICAL: Check if data is missing - if so, attempt recovery from drag-to-move scenario
        // When a macro is dragged in Confluence, it may get a new localId, orphaning the data
        const hasNoData = !varsResultForLoading.lastSynced &&
                          Object.keys(varsResultForLoading.variableValues || {}).length === 0 &&
                          Object.keys(varsResultForLoading.toggleStates || {}).length === 0 &&
                          (varsResultForLoading.customInsertions || []).length === 0 &&
                          (varsResultForLoading.internalNotes || []).length === 0;

        console.log(`[DRAG-DEBUG] hasNoData: ${hasNoData}, excerptId: ${selectedExcerptId}`);

        if (varsResultForLoading.success && hasNoData && selectedExcerptId) {
          console.log('[DRAG-DEBUG] No data found for localId, attempting recovery...');
          const pageId = context?.contentId || context?.extension?.content?.id;
          console.log(`[DRAG-DEBUG] Recovery params - pageId: ${pageId}, excerptId: ${selectedExcerptId}, currentLocalId: ${context.localId}`);

          const recoveryResult = await invoke('recoverOrphanedData', {
            pageId: pageId,
            excerptId: selectedExcerptId,
            currentLocalId: context.localId
          });

          console.log('[DRAG-DEBUG] Recovery result:', recoveryResult);

          if (recoveryResult.success && recoveryResult.recovered) {
            console.log(`[DRAG-DEBUG] Data recovered from ${recoveryResult.migratedFrom}!`);
            // Reload the data now that it's been migrated
            varsResultForLoading = await invoke('getVariableValues', { localId: effectiveLocalId });
            console.log('[DRAG-DEBUG] Reloaded data after recovery:', varsResultForLoading);
          } else if (recoveryResult.success) {
            console.log(`[DRAG-DEBUG] Recovery attempted but no data found: ${recoveryResult.reason}`);
            if (recoveryResult.candidateCount) {
              console.log(`[DRAG-DEBUG] Found ${recoveryResult.candidateCount} candidates (ambiguous)`);
            }
          }
        }

        const loadedVariableValues = varsResultForLoading.success ? varsResultForLoading.variableValues : {};
        const loadedToggleStates = varsResultForLoading.success ? varsResultForLoading.toggleStates : {};
        const loadedCustomInsertions = varsResultForLoading.success ? varsResultForLoading.customInsertions : [];
        const loadedInternalNotes = varsResultForLoading.success ? varsResultForLoading.internalNotes : [];

        // Auto-infer "client" variable from page title if it follows "Blueprint: [Client Name]" pattern
        let pageTitle = '';
        const contentId = context?.contentId || context?.extension?.content?.id;

        if (contentId) {
          try {
            const titleResult = await invoke('getPageTitle', { contentId });
            if (titleResult.success) {
              pageTitle = titleResult.title;
            }
          } catch (err) {
            console.error('Error fetching page title:', err);
          }
        }

        // Only auto-infer if client is undefined, null, or empty string
        const clientIsEmpty = !loadedVariableValues['client'] || loadedVariableValues['client'].trim() === '';

        // Check if title contains "Blueprint:" and extract client name
        if (pageTitle.includes('Blueprint:') && clientIsEmpty) {
          const blueprintIndex = pageTitle.indexOf('Blueprint:');
          const afterBlueprint = pageTitle.substring(blueprintIndex + 'Blueprint:'.length).trim();
          if (afterBlueprint) {
            loadedVariableValues['client'] = afterBlueprint;
          }
        }

        console.log('[DRAG-DEBUG] Setting state with recovered values:');
        console.log('[DRAG-DEBUG] - variableValues:', loadedVariableValues);
        console.log('[DRAG-DEBUG] - toggleStates:', loadedToggleStates);
        console.log('[DRAG-DEBUG] - customInsertions:', loadedCustomInsertions);
        console.log('[DRAG-DEBUG] - internalNotes:', loadedInternalNotes);

        setVariableValues(loadedVariableValues);
        setToggleStates(loadedToggleStates);
        setCustomInsertions(loadedCustomInsertions || []);
        setInternalNotes(loadedInternalNotes || []);

        // NOW: Generate the fresh rendered content with loaded settings
        let freshContent = excerptFromQuery.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

        if (isAdf) {
          // First filter toggles, then substitute variables, insert custom paragraphs, then internal notes
          freshContent = filterContentByToggles(freshContent, loadedToggleStates);
          freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
          freshContent = insertCustomParagraphsInAdf(freshContent, loadedCustomInsertions);
          freshContent = insertInternalNotesInAdf(freshContent, loadedInternalNotes);
        } else {
          // For plain text, filter toggles first
          const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
          freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
            const trimmedName = toggleName.trim();
            return loadedToggleStates?.[trimmedName] === true ? content : '';
          });

          // Strip any remaining markers
          freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
          freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          // Then substitute variables
          const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (excerptFromQuery.variables) {
            excerptFromQuery.variables.forEach(variable => {
              const value = loadedVariableValues[variable.name] || `{{${variable.name}}}`;
              const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
              freshContent = freshContent.replace(regex, value);
            });
          }
        }

        setContent(freshContent);
      } catch (err) {
        console.error('Error loading content:', err);
      } finally {
        setIsRefreshing(false);
      }
    };

    loadContent();
  }, [excerptFromQuery, effectiveLocalId, isEditing, isFetchingExcerpt]);

  // Auto-save effect with debouncing (saves variable values AND caches rendered content)
  // Now uses React Query mutation for better state management
  useEffect(() => {
    if (!isEditing || !effectiveLocalId || !selectedExcerptId || !excerpt) {
      return;
    }

    setSaveStatus('saving');

    const timeoutId = setTimeout(async () => {
      try {
        // Use React Query mutation to save variable values
        saveVariableValuesMutation({
          localId: effectiveLocalId,
          excerptId: selectedExcerptId,
          variableValues,
          toggleStates,
          customInsertions,
          internalNotes
        }, {
          onSuccess: async () => {
            // Also cache the rendered content for view mode
            const previewContent = getPreviewContent();
            await invoke('saveCachedContent', {
              localId: effectiveLocalId,
              renderedContent: previewContent
            });

            setSaveStatus('saved');
            console.log('[REACT-QUERY-MUTATION] Auto-save complete with cache update');
          },
          onError: (error) => {
            console.error('[REACT-QUERY-MUTATION] Auto-save failed:', error);
            setSaveStatus('error');
          }
        });
      } catch (error) {
        console.error('Error during auto-save:', error);
        setSaveStatus('error');
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [variableValues, toggleStates, customInsertions, internalNotes, isEditing, effectiveLocalId, selectedExcerptId, excerpt]);

  // Check for staleness in view mode
  useEffect(() => {
    if (isEditing || !content || !selectedExcerptId || !effectiveLocalId) {
      return;
    }

    const checkStaleness = async () => {
      try {
        // Get excerpt metadata to check updatedAt
        const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
        if (!excerptResult.success || !excerptResult.excerpt) {
          return;
        }

        // Get variable values to check lastSynced
        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        if (!varsResult.success) {
          return;
        }

        const sourceUpdatedAt = excerptResult.excerpt.updatedAt;
        const lastSynced = varsResult.lastSynced;

        if (sourceUpdatedAt && lastSynced) {
          const sourceDate = new Date(sourceUpdatedAt);
          const syncedDate = new Date(lastSynced);
          const stale = sourceDate > syncedDate;

          setIsStale(stale);
          setSourceLastModified(sourceUpdatedAt);
          setIncludeLastSynced(lastSynced);

          // If stale, store the raw latest content for diff view
          // Show raw content with all toggle tags and variable placeholders visible
          if (stale) {
            // Store raw content without any processing
            setLatestRenderedContent(excerptResult.excerpt.content);
          }

          console.log('Staleness check:', {
            sourceUpdatedAt,
            lastSynced,
            isStale: stale
          });
        }
      } catch (err) {
        console.error('Error checking staleness:', err);
      }
    };

    checkStaleness();
  }, [content, isEditing, selectedExcerptId, effectiveLocalId]);

  // Handler for excerpt selection from Select (must be defined before early returns)
  const handleExcerptSelection = async (selectedOption) => {
    if (!selectedOption || !effectiveLocalId) return;

    // Select component passes the entire option object
    const newExcerptId = selectedOption.value;
    console.log('[REACT-QUERY] Excerpt selection changed to:', newExcerptId);

    setSelectedExcerptId(newExcerptId);
    setIsRefreshing(true);

    // Save the selection via backend storage using React Query mutation
    const pageId = context?.contentId || context?.extension?.content?.id;

    // Use mutation to save the selection
    saveVariableValuesMutation({
      localId: effectiveLocalId,
      excerptId: newExcerptId,
      variableValues: {},
      toggleStates: {},
      customInsertions: [],
      internalNotes: []
    });

    // Track usage
    if (pageId) {
      await invoke('trackExcerptUsage', {
        excerptId: newExcerptId,
        pageId: pageId,
        localId: effectiveLocalId
      });
    }

    // Invalidate relevant caches to force refetch
    console.log('[REACT-QUERY] Invalidating caches after excerpt selection');
    await queryClient.invalidateQueries({ queryKey: ['excerpt', newExcerptId] });
    await queryClient.invalidateQueries({ queryKey: ['variableValues', effectiveLocalId] });
  };

  // NEW: Handle missing excerpt selection
  if (!selectedExcerptId) {
    if (isEditing) {
      // In edit mode: Show the excerpt selector immediately
      return (
        <Stack space="space.200">
          <Heading size="medium">Select an Excerpt to Include</Heading>
          <Text>Choose a SmartExcerpt to display on this page:</Text>
          {isLoadingExcerpts ? (
            <Spinner size="medium" label="Loading excerpts..." />
          ) : (
            <Select
              options={availableExcerpts.map(ex => ({
                label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
                value: ex.id
              }))}
              onChange={handleExcerptSelection}
              placeholder="Choose an excerpt..."
            />
          )}
        </Stack>
      );
    } else {
      // In view mode: Show simple message
      return <Text>No excerpt selected. Edit this macro to choose one.</Text>;
    }
  }

  // Show spinner while loading in view mode
  if (!content && !isEditing) {
    return <Spinner />;
  }

  // Helper function to get preview content with current variable and toggle values
  const getPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // First filter toggles, substitute variables, insert custom paragraphs, then internal notes
      previewContent = filterContentByToggles(previewContent, toggleStates);
      previewContent = substituteVariablesInAdf(previewContent, variableValues);
      previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions);
      previewContent = insertInternalNotesInAdf(previewContent, internalNotes);
      return cleanAdfForRenderer(previewContent);
    } else {
      // For plain text, filter toggles first
      const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
      previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
        const trimmedName = toggleName.trim();
        return toggleStates?.[trimmedName] === true ? content : '';
      });

      // Strip any remaining markers (in case regex didn't match full pattern)
      previewContent = previewContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
      previewContent = previewContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

      // Then substitute variables
      excerpt.variables?.forEach(variable => {
        const value = variableValues[variable.name] || `{{${variable.name}}}`;
        const regex = new RegExp(`\\{\\{${variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
        previewContent = previewContent.replace(regex, value);
      });
      return previewContent;
    }
  };

  // Get raw preview content for Alternatives and Free Write tabs (keeps toggle markers visible)
  const getRawPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // Filter toggles (removes disabled content) but DON'T strip markers
      previewContent = filterContentByToggles(previewContent, toggleStates);
      previewContent = substituteVariablesInAdf(previewContent, variableValues);
      previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions);
      previewContent = insertInternalNotesInAdf(previewContent, internalNotes);
      return cleanAdfForRenderer(previewContent);
    } else {
      // For plain text
      const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
      previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
        const trimmedName = toggleName.trim();
        // Keep full match (including markers) if enabled, remove everything if disabled
        return toggleStates?.[trimmedName] === true ? match : '';
      });

      // Then substitute variables
      excerpt.variables?.forEach(variable => {
        const value = variableValues[variable.name] || `{{${variable.name}}}`;
        const regex = new RegExp(`\\{\\{${variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
        previewContent = previewContent.replace(regex, value);
      });
      return previewContent;
    }
  };

  // Handler for updating to latest version (defined before edit mode rendering)
  const handleUpdateToLatest = async () => {
    if (!selectedExcerptId || !effectiveLocalId) {
      return;
    }

    setIsUpdating(true);

    try {
      // Fetch fresh excerpt
      const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
      if (!excerptResult.success || !excerptResult.excerpt) {
        alert('Failed to fetch latest excerpt content');
        return;
      }

      // Get current variable values, toggle states, custom insertions, and internal notes
      const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
      const currentVariableValues = varsResult.success ? varsResult.variableValues : {};
      const currentToggleStates = varsResult.success ? varsResult.toggleStates : {};
      const currentCustomInsertions = varsResult.success ? varsResult.customInsertions : [];
      const currentInternalNotes = varsResult.success ? varsResult.internalNotes : [];

      // Generate fresh content with current settings
      let freshContent = excerptResult.excerpt.content;
      const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

      if (isAdf) {
        freshContent = filterContentByToggles(freshContent, currentToggleStates);
        freshContent = substituteVariablesInAdf(freshContent, currentVariableValues);
        freshContent = insertCustomParagraphsInAdf(freshContent, currentCustomInsertions);
        freshContent = insertInternalNotesInAdf(freshContent, currentInternalNotes);
      } else {
        // For plain text, filter toggles first
        const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
        freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
          const trimmedName = toggleName.trim();
          return currentToggleStates?.[trimmedName] === true ? content : '';
        });

        // Strip any remaining markers
        freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
        freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

        // Substitute variables
        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (excerptResult.excerpt.variables) {
          excerptResult.excerpt.variables.forEach(variable => {
            const value = currentVariableValues[variable.name] || `{{${variable.name}}}`;
            const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
            freshContent = freshContent.replace(regex, value);
          });
        }
      }

      // Update the displayed content
      setContent(freshContent);

      // Cache the updated content
      await invoke('saveCachedContent', {
        localId: effectiveLocalId,
        renderedContent: freshContent
      });

      // Clear staleness flags
      setIsStale(false);

      alert('Successfully updated! Click the Edit button to customize variables, toggles, and other settings.');
    } catch (err) {
      console.error('Error updating to latest:', err);
      alert('Error updating to latest version');
    } finally {
      setIsUpdating(false);
    }
  };

  // EDIT MODE: Show variable inputs and preview
  if (isEditing && excerpt) {
    // Use different preview based on selected tab
    // Write tab (0): Rendered without markers
    // Alternatives tab (1): Raw with markers
    // Free Write tab (2): Raw with markers
    const previewContent = (selectedTabIndex === 1 || selectedTabIndex === 2)
      ? getRawPreviewContent()
      : getPreviewContent();
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    // Format timestamps for display
    const formatTimestamp = (dateStr) => {
      if (!dateStr) return 'Unknown';
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${month}/${day}/${year} ${hours}:${minutes}`;
    };

    return (
      <Stack space="space.100">
        {/* Excerpt Selector - always visible at top of edit mode */}
        <Box xcss={xcss({ paddingBlock: 'space.100', paddingInline: 'space.100', backgroundColor: 'color.background.neutral.subtle' })}>
          {isLoadingExcerpts ? (
            <Spinner size="small" label="Loading..." />
          ) : (
            <Select
              options={availableExcerpts.map(ex => ({
                label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
                value: ex.id
              }))}
              value={availableExcerpts.map(ex => ({
                label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
                value: ex.id
              })).find(opt => opt.value === selectedExcerptId)}
              onChange={handleExcerptSelection}
              placeholder="Choose an excerpt..."
            />
          )}
        </Box>

        <Inline space="space.300" alignBlock="center" spread="space-between">
          <Inline space="space.100" alignBlock="center">
            <Heading size="large">{excerpt.name}</Heading>
            <Button
              appearance="link"
              onClick={async () => {
                try {
                  // Navigate to the source page where this excerpt is defined
                  const pageId = excerpt.sourcePageId || excerpt.pageId;
                  // Use excerpt's space key, or fallback to current space key
                  const spaceKey = excerpt.sourceSpaceKey || context?.extension?.space?.key || productContext?.spaceKey;

                  console.log('[VIEW-SOURCE] Navigating to page:', { pageId, spaceKey, excerptSpaceKey: excerpt.sourceSpaceKey, currentSpaceKey: context?.extension?.space?.key });

                  if (pageId && spaceKey) {
                    // Build the URL manually since we have both pageId and spaceKey
                    const url = `/wiki/spaces/${spaceKey}/pages/${pageId}`;
                    console.log('[VIEW-SOURCE] Opening URL:', url);
                    await router.open(url);
                  } else if (pageId) {
                    // Fallback: Try using view.createContentLink if we only have pageId
                    console.log('[VIEW-SOURCE] Trying createContentLink fallback');
                    const contentLink = await view.createContentLink({
                      contentType: 'page',
                      contentId: pageId
                    });
                    console.log('[VIEW-SOURCE] Generated content link:', contentLink);
                    await router.open(contentLink);
                  } else {
                    console.warn('[VIEW-SOURCE] No pageId found for excerpt');
                  }
                } catch (err) {
                  console.error('[VIEW-SOURCE] Navigation error:', err);
                }
              }}
            >
              View Source
            </Button>
          </Inline>
          <Inline space="space.100" alignBlock="center">
            {saveStatus === 'saving' && (
              <Fragment>
                <Spinner size="small" label="Saving" />
                <Text><Em>Saving...</Em></Text>
              </Fragment>
            )}
            {saveStatus === 'saved' && (
              <Fragment>
                <Icon glyph="check-circle" size="small" label="Saved" />
                <Text><Em>Saved</Em></Text>
              </Fragment>
            )}
          </Inline>
        </Inline>

        <Tabs onChange={(index) => setSelectedTabIndex(index)}>
        <TabList>
          <Tab>Write</Tab>
          <Tab>Alternatives</Tab>
          <Tab>Custom</Tab>
        </TabList>
        {/* Write Tab - Variables */}
        <TabPanel>
          {excerpt.variables && excerpt.variables.length > 0 && (
            <Box xcss={variableBoxStyle}>
              <DynamicTable
                  head={{
                    cells: [
                      {
                        key: 'variable',
                        content: 'Variable',
                        width: 20
                      },
                      {
                        key: 'value',
                        content: 'Value',
                        width: 75
                      },
                      {
                        key: 'status',
                        content: 'Status',
                        width: 5
                      }
                    ]
                  }}
                  rows={excerpt.variables.map(variable => {
                    const isRequired = variable.required || false;
                    const isEmpty = !variableValues[variable.name] || variableValues[variable.name].trim() === '';
                    const showWarning = isRequired && isEmpty;

                    return {
                      key: variable.name,
                      cells: [
                        {
                          key: 'variable',
                          content: (
                            <Inline space="space.050" alignBlock="center">
                              {isRequired && <Text><Strong>*</Strong></Text>}
                              <Text><Code>{variable.name}</Code></Text>
                              {variable.description && (
                                <Tooltip content={variable.description} position="right">
                                  <Icon glyph="question-circle" size="small" label="" />
                                </Tooltip>
                              )}
                              {showWarning && (
                                <Tooltip content="This field is required. Please provide a value." position="right">
                                  <Icon glyph="warning" size="small" label="Required field" color="color.icon.warning" />
                                </Tooltip>
                              )}
                            </Inline>
                          )
                        },
                        {
                          key: 'value',
                          content: (
                            <Box xcss={showWarning ? requiredFieldStyle : undefined}>
                              <Textfield
                                placeholder={variable.example ? `e.g., ${variable.example}` : `Enter value for ${variable.name}`}
                                value={variableValues[variable.name] || ''}
                                onChange={(e) => {
                                  setVariableValues({
                                    ...variableValues,
                                    [variable.name]: e.target.value
                                  });
                                }}
                              />
                            </Box>
                          )
                        },
                        {
                          key: 'status',
                          content: (
                            isEmpty ? (
                              isRequired ? (
                                <Icon glyph="checkbox-unchecked" label="Required - Empty" color="color.icon.danger" />
                              ) : (
                                <Icon glyph="checkbox-unchecked" label="Optional - Empty" color="color.icon.subtle" />
                              )
                            ) : (
                              <Icon glyph="check-circle" label="Filled" color="color.icon.success" />
                            )
                          )
                        }
                      ]
                    };
                  })}
                />
            </Box>
          )}

          {(!excerpt.variables || excerpt.variables.length === 0) && (
            <Text>No variables defined for this excerpt.</Text>
          )}
        </TabPanel>

        {/* Alternatives Tab - Toggles */}
        <TabPanel>
          {excerpt.toggles && excerpt.toggles.length > 0 ? (
            <Box xcss={variableBoxStyle}>
              <DynamicTable
                head={{
                  cells: [
                    {
                      key: 'toggle',
                      content: '',
                      width: 5
                    },
                    {
                      key: 'name',
                      content: 'Toggle',
                      width: 30
                    },
                    {
                      key: 'description',
                      content: 'Description',
                      width: 65
                    }
                  ]
                }}
                rows={excerpt.toggles.map(toggle => ({
                  key: toggle.name,
                  cells: [
                    {
                      key: 'toggle',
                      content: (
                        <Toggle
                          isChecked={toggleStates[toggle.name] || false}
                          onChange={(e) => {
                            setToggleStates({
                              ...toggleStates,
                              [toggle.name]: e.target.checked
                            });
                          }}
                        />
                      )
                    },
                    {
                      key: 'name',
                      content: <Text><Strong>{toggle.name}</Strong></Text>
                    },
                    {
                      key: 'description',
                      content: toggle.description ? <Text><Em>{toggle.description}</Em></Text> : <Text>—</Text>
                    }
                  ]
                }))}
              />
            </Box>
          ) : (
            <Text>No toggles defined for this excerpt.</Text>
          )}
        </TabPanel>

        {/* Custom Tab - Custom paragraph insertions and internal notes */}
        <TabPanel>
          {(() => {
            console.log('[DRAG-DEBUG-RENDER] Custom tab rendering with state:');
            console.log('[DRAG-DEBUG-RENDER] - customInsertions:', customInsertions);
            console.log('[DRAG-DEBUG-RENDER] - internalNotes:', internalNotes);

            // Extract paragraphs from ORIGINAL excerpt content only (not preview with custom insertions)
            // This ensures users can only position custom content relative to source content
            let originalContent = excerpt?.content;
            if (originalContent && typeof originalContent === 'object' && originalContent.type === 'doc') {
              // Apply variable substitution and toggle filtering to show accurate text
              originalContent = filterContentByToggles(originalContent, toggleStates);
              originalContent = substituteVariablesInAdf(originalContent, variableValues);
            }

            const paragraphs = extractParagraphsFromAdf(originalContent);

            if (paragraphs.length === 0) {
              return <Text><Em>No paragraphs available for insertion. Please add content first.</Em></Text>;
            }

            // Create dropdown options from ONLY original source paragraphs
            const paragraphOptions = paragraphs.map(p => ({
              label: `After paragraph ${p.index + 1}: "${p.lastSentence}"`,
              value: p.index
            }));

            // Combine existing content and sort by position
            const existingContent = [
              ...customInsertions.map((item, idx) => ({
                type: 'paragraph',
                position: item.position,
                content: item.text,
                originalIndex: idx
              })),
              ...internalNotes.map((item, idx) => ({
                type: 'note',
                position: item.position,
                content: item.content,
                originalIndex: idx
              }))
            ].sort((a, b) => a.position - b.position);

            // Build table rows: "Add New" row + existing content rows
            const tableRows = [
              // Add New row
              {
                key: 'add-new',
                cells: [
                  {
                    key: 'type-toggle',
                    content: (
                      <Inline space="space.050" alignBlock="center">
                        <Text>📝</Text>
                        <Tooltip content="📝 is saved as a custom paragraph that is visible to clients, 🔒 is saved as an Internal Note that is visible only to SeatGeek employees.">
                          <Toggle
                            isChecked={insertionType === 'note'}
                            onChange={(e) => {
                              setInsertionType(e.target.checked ? 'note' : 'body');
                              setSelectedPosition(null);
                              setCustomText('');
                            }}
                          />
                        </Tooltip>
                        <Text>🔒</Text>
                      </Inline>
                    )
                  },
                  {
                    key: 'position',
                    content: (
                      <Select
                        options={paragraphOptions}
                        value={paragraphOptions.find(opt => opt.value === selectedPosition)}
                        placeholder="After paragraph..."
                        onChange={(e) => setSelectedPosition(e.value)}
                      />
                    )
                  },
                  {
                    key: 'content',
                    content: (
                      <Textfield
                        placeholder={insertionType === 'body' ? "Enter paragraph text..." : "Enter internal note..."}
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        isDisabled={selectedPosition === null}
                      />
                    )
                  },
                  {
                    key: 'action',
                    content: (() => {
                      // Calculate target position for the disabled check
                      let targetPosition = null;
                      if (selectedPosition !== null) {
                        const rendered = [];
                        const originalCount = paragraphs.length - customInsertions.length;

                        for (let i = 0; i < originalCount; i++) {
                          rendered.push({ type: 'original', index: i });
                          const customsHere = customInsertions.filter(ins => ins.position === i);
                          for (const custom of customsHere) {
                            rendered.push({ type: 'custom', insertedAfter: i });
                          }
                        }

                        const selected = rendered[selectedPosition];
                        if (selected) {
                          targetPosition = selected.type === 'original' ? selected.index : selected.insertedAfter;
                        }
                      }

                      const hasNoteAtPosition = targetPosition !== null && internalNotes.some(n => n.position === targetPosition);

                      return (
                        <Button
                          appearance="primary"
                          isDisabled={selectedPosition === null || !customText.trim() || (insertionType === 'note' && hasNoteAtPosition)}
                          onClick={() => {
                            if (insertionType === 'body') {
                              const newInsertion = {
                                position: targetPosition,
                                text: customText.trim()
                              };
                              setCustomInsertions([...customInsertions, newInsertion]);
                            } else {
                              if (!hasNoteAtPosition) {
                                const newNote = {
                                  position: targetPosition,
                                  content: customText.trim()
                                };
                                setInternalNotes([...internalNotes, newNote]);
                              }
                            }

                            setSelectedPosition(null);
                            setCustomText('');
                          }}
                        >
                          Add
                        </Button>
                      );
                    })()
                  }
                ]
              },
              // Existing content rows
              ...existingContent.map((item, idx) => {
                // Get the paragraph text preview for the position
                const targetParagraph = paragraphs.find(p => p.index === item.position);
                const positionPreview = targetParagraph
                  ? targetParagraph.lastSentence.substring(0, 30) + (targetParagraph.lastSentence.length > 30 ? '...' : '')
                  : `¶${item.position + 1}`;

                return {
                  key: `existing-${idx}`,
                  cells: [
                    {
                      key: 'type-indicator',
                      content: (
                        <Inline space="space.075" alignBlock="center">
                          <Text>{item.type === 'paragraph' ? '📝' : '🔒'}</Text>
                          <Lozenge appearance={item.type === 'paragraph' ? 'success' : 'moved'}>
                            {item.type === 'paragraph' ? 'External' : 'Internal'}
                          </Lozenge>
                        </Inline>
                      )
                    },
                    {
                      key: 'position-display',
                      content: <Text><Em>After: "{positionPreview}"</Em></Text>
                    },
                    {
                      key: 'content-display',
                      content: <Text>{item.content.substring(0, 100)}{item.content.length > 100 ? '...' : ''}</Text>
                    },
                    {
                      key: 'delete-action',
                      content: (
                        <Button
                          appearance="subtle"
                          onClick={() => {
                            if (item.type === 'paragraph') {
                              setCustomInsertions(customInsertions.filter((_, i) => i !== item.originalIndex));
                            } else {
                              setInternalNotes(internalNotes.filter((_, i) => i !== item.originalIndex));
                            }
                          }}
                        >
                          <Icon glyph="trash" size="small" label="Delete" />
                        </Button>
                      )
                    }
                  ]
                };
              })
            ];

            return (
              <Box xcss={variableBoxStyle}>
                <DynamicTable
                  head={{
                    cells: [
                      {
                        key: 'type',
                        content: 'Internal? 🔒',
                        width: 12
                      },
                      {
                        key: 'position',
                        content: 'Placement',
                        width: 18
                      },
                      {
                        key: 'content',
                        content: 'Content',
                        width: 65
                      },
                      {
                        key: 'action',
                        content: '',
                        width: 5
                      }
                    ]
                  }}
                  rows={tableRows}
                />
              </Box>
            );
          })()}
        </TabPanel>
        </Tabs>

        {/* Preview - Always visible below tabs */}
        <Box xcss={previewBoxStyle}>
          {isAdf ? (
            <AdfRenderer document={previewContent} />
          ) : (
            <Text>{previewContent || 'No content'}</Text>
          )}
        </Box>
      </Stack>
    );
  }

  // VIEW MODE: Show content with update notification if stale
  if (!content) {
    return <Text>Loading content...</Text>;
  }

  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  // Format timestamps for display
  const formatTimestamp = (dateStr) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hours}:${minutes}`;
  };

  if (isAdf) {
    const cleaned = cleanAdfForRenderer(content);

    if (!cleaned) {
      return <Text>Error: Content cleaning failed</Text>;
    }

    return (
      <Fragment>
        {isStale && (
          <Fragment>
            <Box xcss={updateBannerStyle}>
              <SectionMessage appearance="success">
                <Inline spread="space-between" alignBlock="start">
                  <Stack space="space.100">
                    <Heading size="medium">Update Available</Heading>
                    <Text>The source content has been updated since this Include was last edited.</Text>
                  </Stack>
                  <Stack space="space.100">
                    <Button
                      appearance="primary"
                      onClick={handleUpdateToLatest}
                      isDisabled={isUpdating}
                    >
                      {isUpdating ? 'Updating...' : 'Update'}
                    </Button>
                    <Button
                      appearance="default"
                      onClick={() => setShowDiffView(!showDiffView)}
                    >
                      {showDiffView ? 'Hide' : 'View'} Diff
                    </Button>
                  </Stack>
                </Inline>
              </SectionMessage>
            </Box>

            {/* Diff view - side-by-side comparison */}
            {showDiffView && (
              <Box xcss={previewBoxStyle}>
                <Stack space="space.200">
                  <Text><Strong>Content Comparison:</Strong></Text>
                  <Inline space="space.200" alignBlock="start">
                    <Box xcss={xcss({ width: '50%' })}>
                      <Stack space="space.100">
                        <Text><Strong>Your Current Rendered Version</Strong></Text>
                        <Box xcss={diffCurrentVersionStyle}>
                          {content && typeof content === 'object' && content.type === 'doc' ? (
                            <AdfRenderer document={content} />
                          ) : (
                            <Text>{content || 'No content'}</Text>
                          )}
                        </Box>
                      </Stack>
                    </Box>
                    <Box xcss={xcss({ width: '50%' })}>
                      <Stack space="space.100">
                        <Text><Strong>Latest Raw Source (with all tags)</Strong></Text>
                        <Box xcss={diffNewVersionStyle}>
                          {latestRenderedContent && typeof latestRenderedContent === 'object' && latestRenderedContent.type === 'doc' ? (
                            <AdfRenderer document={latestRenderedContent} />
                          ) : (
                            <Text>{latestRenderedContent || 'No content'}</Text>
                          )}
                        </Box>
                      </Stack>
                    </Box>
                  </Inline>
                </Stack>
              </Box>
            )}
          </Fragment>
        )}
        <AdfRenderer document={cleaned} />
      </Fragment>
    );
  }

  // Plain text content
  return (
    <Fragment>
      {isStale && (
        <Fragment>
          <Box xcss={updateBannerStyle}>
            <SectionMessage appearance="success">
              <Inline spread="space-between" alignBlock="start">
                <Stack space="space.100">
                  <Heading size="medium">Update Available</Heading>
                  <Text>The source content has been updated since this Include was last edited.</Text>
                </Stack>
                <Stack space="space.100">
                  <Button
                    appearance="primary"
                    onClick={handleUpdateToLatest}
                    isDisabled={isUpdating}
                  >
                    {isUpdating ? 'Updating...' : 'Update'}
                  </Button>
                  <Button
                    appearance="default"
                    onClick={() => setShowDiffView(!showDiffView)}
                  >
                    {showDiffView ? 'Hide' : 'View'} Diff
                  </Button>
                </Stack>
              </Inline>
            </SectionMessage>
          </Box>

          {/* Diff view - side-by-side comparison */}
          {showDiffView && (
            <Box xcss={previewBoxStyle}>
              <Stack space="space.200">
                <Text><Strong>Content Comparison:</Strong></Text>
                <Inline space="space.200" alignBlock="start">
                  <Box xcss={xcss({ width: '50%' })}>
                    <Stack space="space.100">
                      <Text><Strong>Your Current Rendered Version</Strong></Text>
                      <Box xcss={diffCurrentVersionStyle}>
                        <Text>{content || 'No content'}</Text>
                      </Box>
                    </Stack>
                  </Box>
                  <Box xcss={xcss({ width: '50%' })}>
                    <Stack space="space.100">
                      <Text><Strong>Latest Raw Source (with all tags)</Strong></Text>
                      <Box xcss={diffNewVersionStyle}>
                        <Text>{latestRenderedContent || 'No content'}</Text>
                      </Box>
                    </Stack>
                  </Box>
                </Inline>
              </Stack>
            </Box>
          )}
        </Fragment>
      )}
      {content && typeof content === 'object' && content.type === 'doc' ? (
        <AdfRenderer document={content} />
      ) : (
        <Text>{content}</Text>
      )}
    </Fragment>
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <App />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
