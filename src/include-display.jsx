import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, { Text, Strong, Em, Code, Textfield, Button, useConfig, useProductContext, AdfRenderer } from '@forge/react';
import { invoke } from '@forge/bridge';

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

        // Load saved variable values from storage
        const varsResult = await invoke('getVariableValues', { localId: context.localId });
        console.log('Loaded variable values:', varsResult.variableValues);

        const loadedVariableValues = varsResult.success ? varsResult.variableValues : {};
        setVariableValues(loadedVariableValues);

        // Generate content with loaded variable values
        let freshContent = excerptResult.excerpt.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

        if (isAdf) {
          freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
        } else {
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

  // Helper function to get preview content with current variable values
  const getPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;
    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      return substituteVariablesInAdf(previewContent, variableValues);
    } else {
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

    try {
      // Save to backend storage using localId as key
      const result = await invoke('saveVariableValues', {
        localId: context.localId,
        excerptId: config.excerptId,
        variableValues
      });

      if (result.success) {
        console.log('Variable values saved successfully');
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
      <Fragment>
        {excerpt.variables && excerpt.variables.length > 0 && (
          <Fragment>
            <Text><Em>Variables:</Em></Text>
            {excerpt.variables.map(variable => (
              <Fragment key={variable.name}>
                <Text><Code>{`{{${variable.name}}}`}</Code></Text>
                <Textfield
                  placeholder={`Value for ${variable.name}`}
                  value={variableValues[variable.name] || ''}
                  onChange={(e) => {
                    setVariableValues({
                      ...variableValues,
                      [variable.name]: e.target.value
                    });
                  }}
                />
              </Fragment>
            ))}
            <Button appearance="primary" onClick={handleSave}>Save</Button>
            <Text>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
          </Fragment>
        )}

        {isAdf ? (
          <AdfRenderer document={previewContent} />
        ) : (
          <Text>{previewContent || 'No content'}</Text>
        )}
      </Fragment>
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
