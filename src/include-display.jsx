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
  xcss,
  useConfig,
  useProductContext,
  AdfRenderer
} from '@forge/react';
import { invoke, router } from '@forge/bridge';

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
// Removes content between {{toggle:name}}...{{/toggle:name}} markers when toggle is disabled
// Works with both plain text and ADF format, supporting inline toggles
const filterContentByToggles = (adfNode, toggleStates) => {
  if (!adfNode) return null;

  // If it's a text node, filter toggle blocks
  if (adfNode.type === 'text' && adfNode.text) {
    let text = adfNode.text;

    // Process toggles - remove content for disabled toggles
    // Match opening tag, content, and closing tag
    const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;

    text = text.replace(toggleRegex, (match, toggleName, content) => {
      const trimmedName = toggleName.trim();
      // If toggle is enabled (true), keep content without markers
      // If toggle is disabled (false/undefined), remove everything
      return toggleStates?.[trimmedName] === true ? content : '';
    });

    // If text is now empty or only whitespace after filtering, return null to remove this node
    if (text.trim() === '') {
      return null;
    }

    return { ...adfNode, text };
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    const newContent = adfNode.content
      .map(child => filterContentByToggles(child, toggleStates))
      .filter(child => child !== null);  // Remove null nodes

    // If this node has no content left after filtering, remove it
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
  const [content, setContent] = useState(null);
  const [excerpt, setExcerpt] = useState(null);
  const [variableValues, setVariableValues] = useState(config?.variableValues || {});
  const [toggleStates, setToggleStates] = useState(config?.toggleStates || {});
  const [customInsertions, setCustomInsertions] = useState(config?.customInsertions || []);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [customText, setCustomText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', or 'error'
  // View mode staleness detection state
  const [isStale, setIsStale] = useState(false);
  const [sourceLastModified, setSourceLastModified] = useState(null);
  const [includeLastSynced, setIncludeLastSynced] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDiffView, setShowDiffView] = useState(false);
  const [latestRenderedContent, setLatestRenderedContent] = useState(null);


  // Load cached content in view mode
  useEffect(() => {
    if (!config || !config.excerptId || !context?.localId) {
      return;
    }

    // In view mode, load cached content only
    if (!isEditing) {
      const loadCachedContent = async () => {
        try {
          const result = await invoke('getCachedContent', { localId: context.localId });
          if (result.success && result.content) {
            setContent(result.content);
          } else {
            // No cached content exists - fall back to fetching fresh content once
            // This happens for existing Include macros that haven't been edited since caching was added
            console.log('No cached content found, fetching fresh content to populate cache');

            const excerptResult = await invoke('getExcerpt', { excerptId: config.excerptId });
            if (excerptResult.success && excerptResult.excerpt) {
              setExcerpt(excerptResult.excerpt);

              // Load variable values and generate content
              const varsResult = await invoke('getVariableValues', { localId: context.localId });
              const loadedVariableValues = varsResult.success ? varsResult.variableValues : {};
              const loadedToggleStates = varsResult.success ? varsResult.toggleStates : {};
              const loadedCustomInsertions = varsResult.success ? varsResult.customInsertions : [];

              setVariableValues(loadedVariableValues);
              setToggleStates(loadedToggleStates);
              setCustomInsertions(loadedCustomInsertions);

              // Generate and cache the content
              let freshContent = excerptResult.excerpt.content;
              const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

              if (isAdf) {
                freshContent = filterContentByToggles(freshContent, loadedToggleStates);
                freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
                freshContent = insertCustomParagraphsInAdf(freshContent, loadedCustomInsertions);
              }

              setContent(freshContent);

              // Cache it for next time
              await invoke('saveCachedContent', {
                localId: context.localId,
                renderedContent: freshContent
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

        // Load saved variable values, toggle states, and custom insertions from storage
        const varsResultForLoading = await invoke('getVariableValues', { localId: context.localId });
        const loadedVariableValues = varsResultForLoading.success ? varsResultForLoading.variableValues : {};
        const loadedToggleStates = varsResultForLoading.success ? varsResultForLoading.toggleStates : {};
        const loadedCustomInsertions = varsResultForLoading.success ? varsResultForLoading.customInsertions : [];

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

        setVariableValues(loadedVariableValues);
        setToggleStates(loadedToggleStates);
        setCustomInsertions(loadedCustomInsertions || []);

        // NOW: Generate the fresh rendered content with loaded settings
        let freshContent = excerptResult.excerpt.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

        if (isAdf) {
          // First filter toggles, then substitute variables, then insert custom paragraphs
          freshContent = filterContentByToggles(freshContent, loadedToggleStates);
          freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
          freshContent = insertCustomParagraphsInAdf(freshContent, loadedCustomInsertions);
        } else {
          // For plain text, filter toggles first
          const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
          freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
            const trimmedName = toggleName.trim();
            return loadedToggleStates?.[trimmedName] === true ? content : '';
          });

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
  }, [config?.excerptId, context?.localId, isEditing]);

  // Auto-save effect with debouncing (saves variable values AND caches rendered content)
  useEffect(() => {
    if (!isEditing || !context?.localId || !config?.excerptId || !excerpt) {
      return;
    }

    setSaveStatus('saving');

    const timeoutId = setTimeout(async () => {
      try {
        // Save variable values, toggle states, and custom insertions
        const result = await invoke('saveVariableValues', {
          localId: context.localId,
          excerptId: config.excerptId,
          variableValues,
          toggleStates,
          customInsertions
        });

        if (result.success) {
          // Also cache the rendered content for view mode
          const previewContent = getPreviewContent();
          await invoke('saveCachedContent', {
            localId: context.localId,
            renderedContent: previewContent
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
  }, [variableValues, toggleStates, customInsertions, isEditing, context?.localId, config?.excerptId, excerpt]);

  // Check for staleness in view mode
  useEffect(() => {
    if (isEditing || !content || !config?.excerptId || !context?.localId) {
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
        const varsResult = await invoke('getVariableValues', { localId: context.localId });
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
  }, [content, isEditing, config?.excerptId, context?.localId]);

  if (!config || !config.excerptId) {
    return <Text>SmartExcerpt Include not configured. Click Edit to select an excerpt.</Text>;
  }

  // In view mode, don't show loading state - content loads so fast from cache it appears instant
  // Just render empty until content arrives (typically <100ms)
  if (!content && !isEditing) {
    return <Fragment></Fragment>;
  }

  // Helper function to get preview content with current variable and toggle values
  const getPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // First filter toggles, then substitute variables, then insert custom paragraphs
      previewContent = filterContentByToggles(previewContent, toggleStates);
      previewContent = substituteVariablesInAdf(previewContent, variableValues);
      previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions);
      return cleanAdfForRenderer(previewContent);
    } else {
      // For plain text, filter toggles first
      const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
      previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
        const trimmedName = toggleName.trim();
        return toggleStates?.[trimmedName] === true ? content : '';
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
    if (!config?.excerptId || !context?.localId) {
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

      // Get current variable values and toggle states
      const varsResult = await invoke('getVariableValues', { localId: context.localId });
      const currentVariableValues = varsResult.success ? varsResult.variableValues : {};
      const currentToggleStates = varsResult.success ? varsResult.toggleStates : {};
      const currentCustomInsertions = varsResult.success ? varsResult.customInsertions : [];

      // Generate fresh content with current settings
      let freshContent = excerptResult.excerpt.content;
      const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

      if (isAdf) {
        freshContent = filterContentByToggles(freshContent, currentToggleStates);
        freshContent = substituteVariablesInAdf(freshContent, currentVariableValues);
        freshContent = insertCustomParagraphsInAdf(freshContent, currentCustomInsertions);
      }

      // Update the displayed content
      setContent(freshContent);

      // Cache the updated content
      await invoke('saveCachedContent', {
        localId: context.localId,
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
    const previewContent = getPreviewContent();
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

        <Tabs>
        <TabList>
          <Tab>Write</Tab>
          <Tab>Alternatives</Tab>
          <Tab>Free Write</Tab>
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
                        width: 25
                      },
                      {
                        key: 'value',
                        content: 'Value',
                        width: 65
                      },
                      {
                        key: 'status',
                        content: 'Status',
                        width: 10
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
                              <Icon glyph="checkbox" label="Filled" color="color.icon.success" />
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

        {/* Free Write Tab - Custom paragraph insertions */}
        <TabPanel>
          <Stack space="space.200">
            <Text>Insert custom paragraph content at a position of your choosing:</Text>

            {(() => {
              // Extract paragraphs from the preview content
              const paragraphs = extractParagraphsFromAdf(previewContent);

              if (paragraphs.length === 0) {
                return <Text><Em>No paragraphs available for insertion. Please add content first.</Em></Text>;
              }

              // Create dropdown options from paragraphs
              const paragraphOptions = paragraphs.map(p => ({
                label: `After paragraph ${p.index + 1}: "${p.lastSentence}"`,
                value: p.index
              }));

              return (
                <Fragment>
                  <Select
                    label="Insert custom paragraph one line below:"
                    options={paragraphOptions}
                    value={paragraphOptions.find(opt => opt.value === selectedPosition)}
                    placeholder="Choose a paragraph..."
                    onChange={(e) => setSelectedPosition(e.value)}
                  />

                  <Textfield
                    label="Custom paragraph content"
                    placeholder="Enter your custom paragraph text..."
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    isDisabled={selectedPosition === null}
                  />

                  <Button
                    appearance="primary"
                    isDisabled={selectedPosition === null || !customText.trim()}
                    onClick={() => {
                      // Add the custom insertion
                      const newInsertion = {
                        position: selectedPosition,
                        text: customText.trim()
                      };
                      setCustomInsertions([...customInsertions, newInsertion]);

                      // Reset form
                      setSelectedPosition(null);
                      setCustomText('');
                    }}
                  >
                    Add Custom Paragraph
                  </Button>

                  {customInsertions.length > 0 && (
                    <Fragment>
                      <Text><Strong>Added custom paragraphs:</Strong></Text>
                      <Stack space="space.100">
                        {customInsertions.map((insertion, idx) => (
                          <Inline key={idx} space="space.100" alignBlock="center" spread="space-between">
                            <Text>
                              <Em>After paragraph {insertion.position + 1}:</Em> {insertion.text.substring(0, 50)}{insertion.text.length > 50 ? '...' : ''}
                            </Text>
                            <Button
                              appearance="subtle"
                              onClick={() => {
                                setCustomInsertions(customInsertions.filter((_, i) => i !== idx));
                              }}
                            >
                              Remove
                            </Button>
                          </Inline>
                        ))}
                      </Stack>
                    </Fragment>
                  )}
                </Fragment>
              );
            })()}
          </Stack>
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
      <Text>{content}</Text>
    </Fragment>
  );
};

ForgeReconciler.render(<App />);
