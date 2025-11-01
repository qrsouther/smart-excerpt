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
import { invoke, router } from '@forge/bridge';
import { requestCachedContent } from './batch-coordinator.js';

// Style for preview border
const previewBoxStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200'
});

/**
 * Skeleton component for loading state
 * Uses lh (line-height) units to scale with user font settings
 */
const SkeletonLine = ({ linesHeight = 2.5 }) => (
  <Box
    style={{
      height: `${linesHeight}lh`,
      backgroundColor: '#f4f5f7',
      borderRadius: '3px',
      backgroundImage: 'linear-gradient(90deg, #f4f5f7 0px, #e8e9eb 40px, #f4f5f7 80px)',
      backgroundSize: '800px',
      animation: 'shimmer 1.6s infinite linear'
    }}
  />
);

// Keyframes for shimmer animation (CSS in style tag won't work, but linear gradient gives subtle effect)
const SkeletonParagraph = () => (
  <Stack space="space.075">
    <SkeletonLine linesHeight={1} />
    <SkeletonLine linesHeight={1} />
    <SkeletonLine linesHeight={0.7} />
  </Stack>
);

/**
 * Full skeleton for Include macro loading state
 * Metadata-driven: Uses paragraph count from cached metadata if available
 */
const IncludeSkeleton = ({ metadata }) => {
  const paragraphCount = metadata?.paragraphCount || 3;

  return (
    <Stack space="space.200">
      {Array(Math.min(paragraphCount, 5)).fill(0).map((_, i) => (
        <SkeletonParagraph key={i} />
      ))}
    </Stack>
  );
};

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

const App = () => {
  const config = useConfig();
  const context = useProductContext();
  const isEditing = context?.extension?.isEditing;  // Fixed: it's on extension, not extensionContext!

  // Use context.localId directly - recovery happens lazily only when data is missing
  const effectiveLocalId = context?.localId;

  const [content, setContent] = useState(null);
  const [excerpt, setExcerpt] = useState(null);
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

  // Helper: Calculate metadata for skeleton sizing
  const calculateMetadata = (content) => {
    if (!content) return null;

    const paragraphs = extractParagraphsFromAdf(content);
    return {
      paragraphCount: paragraphs.length
    };
  };

  // Load cached content in view mode
  useEffect(() => {
    if (!config || !config.excerptId || !effectiveLocalId) {
      return;
    }

    // In view mode, load cached content only
    if (!isEditing) {
      const loadCachedContent = async () => {
        try {
          console.log(`[BATCH-LOAD] Loading cached content for localId: ${context.localId}`);

          // Use batch coordinator for performance (auto-batches with other macros on page)
          const result = await requestCachedContent(effectiveLocalId);
          console.log(`[BATCH-LOAD] Result:`, result);

          if (result && result.content) {
            setContent(result.content);
          } else {
            // No cached content exists - fall back to fetching fresh content once
            // This happens for existing Include macros that haven't been edited since caching was added OR after drag-to-move
            console.log('[DRAG-DEBUG-VIEW] No cached content found, fetching fresh content to populate cache');

            const excerptResult = await invoke('getExcerpt', { excerptId: config.excerptId });
            if (excerptResult.success && excerptResult.excerpt) {
              setExcerpt(excerptResult.excerpt);

              // Load variable values and generate content
              console.log(`[DRAG-DEBUG-VIEW] Loading vars for localId: ${context.localId}`);
              let varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
              console.log(`[DRAG-DEBUG-VIEW] getVariableValues result:`, varsResult);

              // CRITICAL: Check if data is missing - attempt recovery from drag-to-move
              const hasNoData = !varsResult.lastSynced &&
                                Object.keys(varsResult.variableValues || {}).length === 0 &&
                                Object.keys(varsResult.toggleStates || {}).length === 0 &&
                                (varsResult.customInsertions || []).length === 0 &&
                                (varsResult.internalNotes || []).length === 0;

              console.log(`[DRAG-DEBUG-VIEW] hasNoData: ${hasNoData}, excerptId: ${config.excerptId}`);

              if (varsResult.success && hasNoData && config.excerptId) {
                console.log('[DRAG-DEBUG-VIEW] Attempting recovery in view mode...');
                const pageId = context?.contentId || context?.extension?.content?.id;

                const recoveryResult = await invoke('recoverOrphanedData', {
                  pageId: pageId,
                  excerptId: config.excerptId,
                  currentLocalId: context.localId
                });

                console.log('[DRAG-DEBUG-VIEW] Recovery result:', recoveryResult);

                if (recoveryResult.success && recoveryResult.recovered) {
                  console.log(`[DRAG-DEBUG-VIEW] Data recovered from ${recoveryResult.migratedFrom}!`);
                  // Reload the data
                  varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
                  console.log('[DRAG-DEBUG-VIEW] Reloaded data after recovery:', varsResult);
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

              setContent(freshContent);

              // Cache it for next time with metadata for skeleton sizing
              await invoke('saveCachedContent', {
                localId: effectiveLocalId,
                renderedContent: freshContent,
                metadata: calculateMetadata(freshContent)
              });
            }
          }
        } catch (err) {
          console.error('Error loading cached content:', err);
        }
      };
      loadCachedContent();
      return;
    }

    // In edit mode, load fresh excerpt data
    const loadContent = async () => {
      setIsRefreshing(true);

      try {
        // Load the excerpt
        const excerptResult = await invoke('getExcerpt', { excerptId: config.excerptId });

        if (!excerptResult.success || !excerptResult.excerpt) {
          console.error('Failed to load excerpt');
          return;
        }

        setExcerpt(excerptResult.excerpt);

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

        console.log(`[DRAG-DEBUG] hasNoData: ${hasNoData}, excerptId: ${config.excerptId}`);

        if (varsResultForLoading.success && hasNoData && config.excerptId) {
          console.log('[DRAG-DEBUG] No data found for localId, attempting recovery...');
          const pageId = context?.contentId || context?.extension?.content?.id;
          console.log(`[DRAG-DEBUG] Recovery params - pageId: ${pageId}, excerptId: ${config.excerptId}, currentLocalId: ${context.localId}`);

          const recoveryResult = await invoke('recoverOrphanedData', {
            pageId: pageId,
            excerptId: config.excerptId,
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
        let freshContent = excerptResult.excerpt.content;
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
          if (excerptResult.excerpt.variables) {
            excerptResult.excerpt.variables.forEach(variable => {
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
  }, [config?.excerptId, effectiveLocalId, isEditing]);

  // Auto-save effect with debouncing (saves variable values AND caches rendered content)
  useEffect(() => {
    if (!isEditing || !effectiveLocalId || !config?.excerptId || !excerpt) {
      return;
    }

    setSaveStatus('saving');

    const timeoutId = setTimeout(async () => {
      try {
        // Save variable values, toggle states, custom insertions, and internal notes
        const result = await invoke('saveVariableValues', {
          localId: effectiveLocalId,
          excerptId: config.excerptId,
          variableValues,
          toggleStates,
          customInsertions,
          internalNotes
        });

        if (result.success) {
          // Also cache the rendered content for view mode with metadata
          const previewContent = getPreviewContent();
          await invoke('saveCachedContent', {
            localId: effectiveLocalId,
            renderedContent: previewContent,
            metadata: calculateMetadata(previewContent)
          });

          setSaveStatus('saved');
        } else {
          console.error('Auto-save failed:', result.error);
          setSaveStatus('error');
        }
      } catch (error) {
        console.error('Error during auto-save:', error);
        setSaveStatus('error');
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [variableValues, toggleStates, customInsertions, internalNotes, isEditing, effectiveLocalId, config?.excerptId, excerpt]);

  // Check for staleness in view mode
  useEffect(() => {
    if (isEditing || !content || !config?.excerptId || !effectiveLocalId) {
      return;
    }

    const checkStaleness = async () => {
      try {
        // Get excerpt metadata to check updatedAt
        const excerptResult = await invoke('getExcerpt', { excerptId: config.excerptId });
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
  }, [content, isEditing, config?.excerptId, effectiveLocalId]);

  if (!config || !config.excerptId) {
    return <Text>SmartExcerpt Include not configured. Click Edit to select an excerpt.</Text>;
  }

  // Show skeleton while loading in view mode
  if (!content && !isEditing) {
    return <IncludeSkeleton metadata={null} />;
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
    if (!config?.excerptId || !effectiveLocalId) {
      return;
    }

    setIsUpdating(true);

    try {
      // Fetch fresh excerpt
      const excerptResult = await invoke('getExcerpt', { excerptId: config.excerptId });
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

      // Cache the updated content with metadata
      await invoke('saveCachedContent', {
        localId: effectiveLocalId,
        renderedContent: freshContent,
        metadata: calculateMetadata(freshContent)
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
        <Inline space="space.300" alignBlock="center" spread="space-between">
          <Inline space="space.100" alignBlock="center">
            <Heading size="large">{excerpt.name}</Heading>
            <Button
              appearance="subtle-link"
              onClick={async () => {
                try {
                  // TODO: Update this URL after installing to production environment
                  // Current URL is for dev environment: qrsouther.atlassian.net
                  // Format: /wiki/admin/forge?id=ari:cloud:ecosystem::extension/{appId}/{extensionId}/static/smartexcerpt-admin
                  await router.open('/wiki/admin/forge?id=ari%3Acloud%3Aecosystem%3A%3Aextension%2Fbe1ff96b-d44d-4975-98d3-25b80a813bdd%2Fae38f536-b4c8-4dfa-a1c9-62026d61b4f9%2Fstatic%2Fsmartexcerpt-admin');
                } catch (err) {
                  console.error('Navigation error:', err);
                }
              }}
            >
              Admin View
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

ForgeReconciler.render(<App />);
