import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, { Text, Strong, Em, Code, Textfield, Toggle, Button, Tabs, Tab, TabList, TabPanel, useConfig, useProductContext, AdfRenderer } from '@forge/react';
import { invoke } from '@forge/bridge';

// Helper function to filter content based on toggle states
// Removes content between {{toggle:name}}...{{/toggle:name}} markers when toggle is disabled
// Works with both plain text and ADF format, supporting inline toggles
const filterContentByToggles = (adfNode, toggleStates) => {
  if (!adfNode) return adfNode;

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

    return { ...adfNode, text };
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    const newContent = adfNode.content.map(child =>
      filterContentByToggles(child, toggleStates)
    );
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
        setContent(freshContent);
      } catch (err) {
        console.error('Error loading content:', err);
      } finally {
        setIsRefreshing(false);
      }
    };

    loadContent();
  }, [config?.excerptId, context?.localId]);

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
      return substituteVariablesInAdf(previewContent, variableValues);
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

  const handleSave = async () => {
    console.log('Saving variable values:', variableValues);
    console.log('Saving toggle states:', toggleStates);

    try {
      // Save to backend storage using localId as key
      const result = await invoke('saveVariableValues', {
        localId: context.localId,
        excerptId: config.excerptId,
        variableValues,
        toggleStates
      });

      if (result.success) {
        console.log('Variable values and toggle states saved successfully');
        // Update the content preview
        const newContent = getPreviewContent();
        setContent(newContent);
      } else {
        console.error('Failed to save variable values:', result.error);
      }
    } catch (error) {
      console.error('Error saving variable values:', error);
    }
  };

  // EDIT MODE: Show variable inputs and preview
  if (isEditing && excerpt) {
    const previewContent = getPreviewContent();
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    return (
      <Tabs>
        <TabList>
          <Tab>Preview</Tab>
          <Tab>Toggles</Tab>
          <Tab>Variables</Tab>
        </TabList>

        <TabPanel>
          {isAdf ? (
            <AdfRenderer document={previewContent} />
          ) : (
            <Text>{previewContent || 'No content'}</Text>
          )}
        </TabPanel>

        <TabPanel>
          {excerpt.toggles && excerpt.toggles.length > 0 ? (
            <Fragment>
              {excerpt.toggles.map(toggle => (
                <Fragment key={toggle.name}>
                  <Text><Strong>{toggle.name}</Strong></Text>
                  <Toggle
                    isChecked={toggleStates[toggle.name] || false}
                    onChange={(e) => {
                      setToggleStates({
                        ...toggleStates,
                        [toggle.name]: e.target.checked
                      });
                    }}
                  />
                  {toggle.description && (
                    <Text><Em>{toggle.description}</Em></Text>
                  )}
                  <Text>{' '}</Text>
                </Fragment>
              ))}
              <Button appearance="primary" onClick={handleSave}>Save Toggles</Button>
            </Fragment>
          ) : (
            <Text>No toggles defined in this excerpt.</Text>
          )}
        </TabPanel>

        <TabPanel>
          {excerpt.variables && excerpt.variables.length > 0 ? (
            <Fragment>
              {excerpt.variables.map(variable => (
                <Fragment key={variable.name}>
                  <Text><Code>{`{{${variable.name}}}`}</Code></Text>
                  <Textfield
                    label={`{{${variable.name}}}`}
                    placeholder={`Value for ${variable.name}`}
                    value={variableValues[variable.name] || ''}
                    onChange={(e) => {
                      setVariableValues({
                        ...variableValues,
                        [variable.name]: e.target.value
                      });
                    }}
                  />
                  {variable.description && (
                    <Textfield
                      label="Description"
                      value={variable.description}
                      isReadOnly
                    />
                  )}
                  {variable.example && (
                    <Textfield
                      label="Example"
                      value={variable.example}
                      isReadOnly
                    />
                  )}
                  <Text>{' '}</Text>
                </Fragment>
              ))}
              <Button appearance="primary" onClick={handleSave}>Save Variables</Button>
            </Fragment>
          ) : (
            <Text>No variables defined in this excerpt.</Text>
          )}
        </TabPanel>
      </Tabs>
    );
  }

  // VIEW MODE: Just show the content
  const isAdf = content && typeof content === 'object' && content.type === 'doc';

  return (
    <Fragment>
      {isAdf ? (
        <AdfRenderer document={content} />
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
