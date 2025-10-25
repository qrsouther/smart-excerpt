import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Em,
  Code,
  Textfield,
  TextArea,
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
  xcss,
  useConfig,
  useProductContext,
  AdfRenderer
} from '@forge/react';
import { invoke } from '@forge/bridge';

// Style for preview border
const previewBoxStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200'
});

// Helper function to clean ADF for Forge's AdfRenderer
// Removes unsupported attributes that cause "Unsupported text" messages
const cleanAdfForRenderer = (adfNode) => {
  if (!adfNode || typeof adfNode !== 'object') return adfNode;

  // Clone to avoid mutating original
  const cleaned = { ...adfNode };

  // Remove unsupported attributes
  if (cleaned.attrs) {
    const cleanedAttrs = { ...cleaned.attrs };

    // Remove localId (not supported by Forge AdfRenderer)
    delete cleanedAttrs.localId;

    // Remove null-valued panel attributes
    if (cleaned.type === 'panel') {
      if (cleanedAttrs.panelIconId === null) delete cleanedAttrs.panelIconId;
      if (cleanedAttrs.panelColor === null) delete cleanedAttrs.panelColor;
      if (cleanedAttrs.panelIcon === null) delete cleanedAttrs.panelIcon;
      if (cleanedAttrs.panelIconText === null) delete cleanedAttrs.panelIconText;
    }

    // Remove null-valued table cell attributes
    if (cleaned.type === 'tableCell' || cleaned.type === 'tableHeader') {
      if (cleanedAttrs.background === null) delete cleanedAttrs.background;
      if (cleanedAttrs.colwidth === null) delete cleanedAttrs.colwidth;
    }

    // Remove null-valued and unsupported table attributes
    if (cleaned.type === 'table') {
      if (cleanedAttrs.displayMode === null) delete cleanedAttrs.displayMode;
      // Remove other potentially unsupported table attributes
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

const App = () => {
  const config = useConfig();
  const context = useProductContext();
  const isEditing = context?.extension?.isEditing;  // Fixed: it's on extension, not extensionContext!
  const [content, setContent] = useState(null);
  const [excerpt, setExcerpt] = useState(null);
  const [variableValues, setVariableValues] = useState(config?.variableValues || {});
  const [toggleStates, setToggleStates] = useState(config?.toggleStates || {});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', or 'error'

  console.log('=== INCLUDE VIEW RENDERING ===');
  console.log('Is editing:', isEditing);
  console.log('Include display - config:', config);

  // Load excerpt and content
  useEffect(() => {
    if (!config || !config.excerptId || !context?.localId) {
      return;
    }

    const loadContent = async () => {
      setIsRefreshing(true);
      console.log('Loading content for localId:', context.localId);

      try {
        // Load the excerpt
        const excerptResult = await invoke('getExcerpt', { excerptId: config.excerptId });
        console.log('Excerpt loaded:', excerptResult);

        if (!excerptResult.success || !excerptResult.excerpt) {
          console.error('Failed to load excerpt');
          return;
        }

        setExcerpt(excerptResult.excerpt);

        // Load saved variable values and toggle states from storage
        const varsResult = await invoke('getVariableValues', { localId: context.localId });
        console.log('Loaded variable values:', varsResult.variableValues);
        console.log('Loaded toggle states:', varsResult.toggleStates);

        const loadedVariableValues = varsResult.success ? varsResult.variableValues : {};
        const loadedToggleStates = varsResult.success ? varsResult.toggleStates : {};
        setVariableValues(loadedVariableValues);
        setToggleStates(loadedToggleStates);

        // Generate content: first filter toggles, then substitute variables
        let freshContent = excerptResult.excerpt.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

        if (isAdf) {
          // First filter toggles, then substitute variables
          freshContent = filterContentByToggles(freshContent, loadedToggleStates);
          freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
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

        console.log('Setting content:', freshContent);
        console.log('Content as JSON:', JSON.stringify(freshContent, null, 2));
        setContent(freshContent);
      } catch (err) {
        console.error('Error loading content:', err);
      } finally {
        setIsRefreshing(false);
      }
    };

    loadContent();
  }, [config?.excerptId, context?.localId]);

  // Auto-save effect with debouncing
  useEffect(() => {
    if (!isEditing || !context?.localId || !config?.excerptId) {
      return;
    }

    setSaveStatus('saving');

    const timeoutId = setTimeout(async () => {
      try {
        console.log('Auto-saving variable values:', variableValues);
        console.log('Auto-saving toggle states:', toggleStates);

        const result = await invoke('saveVariableValues', {
          localId: context.localId,
          excerptId: config.excerptId,
          variableValues,
          toggleStates
        });

        if (result.success) {
          console.log('Auto-save successful');
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
  }, [variableValues, toggleStates, isEditing, context?.localId, config?.excerptId]);

  if (!config || !config.excerptId) {
    return <Text>SmartExcerpt Include not configured. Click Edit to select an excerpt.</Text>;
  }

  if (!content && !isEditing) {
    return <Text>Loading excerpt...</Text>;
  }

  // Helper function to get preview content with current variable and toggle values
  const getPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // First filter toggles, then substitute variables
      previewContent = filterContentByToggles(previewContent, toggleStates);
      previewContent = substituteVariablesInAdf(previewContent, variableValues);

      // Log before and after cleaning
      console.log('Preview content before cleaning:', JSON.stringify(previewContent, null, 2));
      const cleaned = cleanAdfForRenderer(previewContent);
      console.log('Preview content after cleaning:', JSON.stringify(cleaned, null, 2));

      return cleaned;
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

  // EDIT MODE: Show variable inputs and preview
  if (isEditing && excerpt) {
    const previewContent = getPreviewContent();
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    console.log('Edit mode - rendering preview, isAdf:', isAdf);

    return (
      <Stack space="space.100">
        <Inline space="space.300" alignBlock="center" spread="space-between">
          <Text><Strong>{excerpt.name}</Strong></Text>
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
          <Tab>Variants</Tab>
        </TabList>
        {/* Write Tab - Variables + Live Preview */}
        <TabPanel>
          <Stack space="space.200">
            {excerpt.variables && excerpt.variables.length > 0 && (
              <Box backgroundColor="color.background.neutral" paddingBlockStart="space.200" paddingBlockEnd="space.100" paddingInline="space.200">
                <Stack space="space.150">
                  <DynamicTable
                    head={{
                      cells: [
                        {
                          key: 'variable',
                          content: 'Variable',
                          width: 30
                        },
                        {
                          key: 'value',
                          content: 'Value',
                          width: 70
                        }
                      ]
                    }}
                    rows={excerpt.variables.map(variable => ({
                      key: variable.name,
                      cells: [
                        {
                          key: 'variable',
                          content: (
                            <Inline space="space.050" alignBlock="center">
                              <Text><Code>{variable.name}</Code></Text>
                              {variable.description && (
                                <Tooltip content={variable.description} position="right">
                                  <Icon glyph="question-circle" size="small" label="" />
                                </Tooltip>
                              )}
                            </Inline>
                          )
                        },
                        {
                          key: 'value',
                          content: variable.multiline ? (
                            <TextArea
                              placeholder={variable.example ? `e.g., ${variable.example}` : `Enter value for ${variable.name}`}
                              value={variableValues[variable.name] || ''}
                              resize="smart"
                              onChange={(e) => {
                                setVariableValues({
                                  ...variableValues,
                                  [variable.name]: e.target.value
                                });
                              }}
                            />
                          ) : (
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
                          )
                        }
                      ]
                    }))}
                  />
                </Stack>
              </Box>
            )}

            {(!excerpt.variables || excerpt.variables.length === 0) && (
              <Text>No variables defined for this excerpt.</Text>
            )}

            <Box xcss={previewBoxStyle}>
                {isAdf ? (
                  <AdfRenderer document={previewContent} />
                ) : (
                  <Text>{previewContent || 'No content'}</Text>
                )}
              </Box>
          </Stack>
        </TabPanel>

        {/* Variants Tab - Toggles */}
        <TabPanel>
          <Stack space="space.200">
            {excerpt.toggles && excerpt.toggles.length > 0 ? (
              <Stack space="space.150">
                <Text><Strong>Content Toggles:</Strong></Text>

                {excerpt.toggles.map(toggle => (
                  <Stack key={toggle.name} space="space.050">
                    <Text><Strong>{toggle.name}</Strong></Text>
                    {toggle.description && (
                      <Text><Em>{toggle.description}</Em></Text>
                    )}
                    <Toggle
                      isChecked={toggleStates[toggle.name] || false}
                      onChange={(e) => {
                        setToggleStates({
                          ...toggleStates,
                          [toggle.name]: e.target.checked
                        });
                      }}
                    />
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Text>No toggles defined for this excerpt.</Text>
            )}
          </Stack>
        </TabPanel>
        </Tabs>
      </Stack>
    );
  }

  // VIEW MODE: Just show the content
  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  console.log('View mode - rendering content, isAdf:', isAdf);
  if (isAdf) {
    console.log('View mode - content before cleaning:', JSON.stringify(content, null, 2));
    const cleaned = cleanAdfForRenderer(content);
    console.log('View mode - content after cleaning:', JSON.stringify(cleaned, null, 2));
  }

  return (
    <Fragment>
      {isAdf ? (
        <AdfRenderer document={cleanAdfForRenderer(content)} />
      ) : (
        <Text>{content}</Text>
      )}
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
