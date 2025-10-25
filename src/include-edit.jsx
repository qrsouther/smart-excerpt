import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Em,
  Textfield,
  Button,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  useConfig,
  AdfRenderer
} from '@forge/react';
import { invoke, view } from '@forge/bridge';

// Helper function to perform variable substitution in ADF content
const substituteVariablesInAdf = (adfNode, variableValues) => {
  if (!adfNode) return adfNode;

  if (adfNode.type === 'text' && adfNode.text) {
    let text = adfNode.text;
    Object.entries(variableValues || {}).forEach(([varName, value]) => {
      const regex = new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
      text = text.replace(regex, value);
    });
    return { ...adfNode, text };
  }

  if (adfNode.content && Array.isArray(adfNode.content)) {
    return {
      ...adfNode,
      content: adfNode.content.map(child => substituteVariablesInAdf(child, variableValues))
    };
  }

  return adfNode;
};

const App = () => {
  const config = useConfig();
  const [excerpt, setExcerpt] = useState(null);
  const [variableValues, setVariableValues] = useState(config?.variableValues || {});
  const [isLoading, setIsLoading] = useState(true);

  console.log('=== INCLUDE EDIT VIEW RENDERING ===');
  console.log('Include edit - config:', config);
  console.log('Include edit - variableValues:', variableValues);

  useEffect(() => {
    const loadExcerpt = async () => {
      if (!config || !config.excerptId) {
        setIsLoading(false);
        return;
      }

      try {
        const result = await invoke('getExcerpt', { excerptId: config.excerptId });
        console.log('Excerpt loaded in edit view:', result);

        if (result.success && result.excerpt) {
          setExcerpt(result.excerpt);
        }
      } catch (err) {
        console.error('Error loading excerpt:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadExcerpt();
  }, [config?.excerptId]);

  const handleSave = async () => {
    console.log('Saving variable values:', variableValues);

    // Generate cached content for optimistic rendering
    let cachedContent = excerpt?.content;

    if (cachedContent) {
      const isAdf = cachedContent && typeof cachedContent === 'object' && cachedContent.type === 'doc';

      if (isAdf) {
        cachedContent = substituteVariablesInAdf(cachedContent, variableValues);
      } else {
        // Plain text substitution
        excerpt.variables?.forEach(variable => {
          const value = variableValues[variable.name] || `{{${variable.name}}}`;
          const regex = new RegExp(`\\{\\{${variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
          cachedContent = cachedContent.replace(regex, value);
        });
      }
    }

    const updatedConfig = {
      ...config,
      variableValues,
      cachedContent
    };

    console.log('Saving updated config:', updatedConfig);

    try {
      await view.submit({ config: updatedConfig });
      console.log('Variable values saved successfully');
    } catch (error) {
      console.error('Error saving variable values:', error);
    }
  };

  if (!config || !config.excerptId) {
    return (
      <Fragment>
        <Text>SmartExcerpt Include not configured.</Text>
        <Text>Click the "..." menu and select "Edit" to choose a source excerpt.</Text>
      </Fragment>
    );
  }

  if (isLoading) {
    return <Text>Loading excerpt...</Text>;
  }

  if (!excerpt) {
    return <Text>Error: Could not load excerpt</Text>;
  }

  // Get preview content with current variable values
  const getPreviewContent = () => {
    let content = excerpt.content;
    const isAdf = content && typeof content === 'object' && content.type === 'doc';

    if (isAdf) {
      return substituteVariablesInAdf(content, variableValues);
    } else {
      excerpt.variables?.forEach(variable => {
        const value = variableValues[variable.name] || `{{${variable.name}}}`;
        const regex = new RegExp(`\\{\\{${variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
        content = content.replace(regex, value);
      });
      return content;
    }
  };

  const previewContent = getPreviewContent();
  const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

  return (
    <Fragment>
      <Text>
        <Strong>Source: {config.excerptName || excerpt.name}</Strong>
      </Text>
      <Text>{' '}</Text>

      <Tabs>
        <TabList>
          <Tab>Write</Tab>
          <Tab>Variants</Tab>
        </TabList>

        {/* Write Tab - Variables + Live Preview */}
        <TabPanel>
          {excerpt.variables && excerpt.variables.length > 0 ? (
            <Fragment>
              <Text><Strong>Variables:</Strong></Text>
              <Text>{' '}</Text>

              {excerpt.variables.map(variable => (
                <Fragment key={variable.name}>
                  <Text><Strong>{variable.name}</Strong></Text>
                  {variable.description && (
                    <Text><Em>{variable.description}</Em></Text>
                  )}
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
                  <Text>{' '}</Text>
                </Fragment>
              ))}

              <Button appearance="primary" onClick={handleSave}>
                Save Variable Values
              </Button>
              <Text>{' '}</Text>
              <Text>{' '}</Text>
            </Fragment>
          ) : (
            <Fragment>
              <Text>No variables defined for this excerpt.</Text>
              <Text>{' '}</Text>
            </Fragment>
          )}

          <Text><Strong>Preview:</Strong></Text>
          <Text>{' '}</Text>
          {isAdf ? (
            <AdfRenderer document={previewContent} />
          ) : (
            <Text>{previewContent || 'No content'}</Text>
          )}
        </TabPanel>

        {/* Variants Tab - Toggles */}
        <TabPanel>
          {excerpt.toggles && excerpt.toggles.length > 0 ? (
            <Fragment>
              <Text><Strong>Content Toggles:</Strong></Text>
              <Text>{' '}</Text>

              {excerpt.toggles.map(toggle => (
                <Fragment key={toggle.name}>
                  <Text><Strong>{toggle.name}</Strong></Text>
                  {toggle.description && (
                    <Text><Em>{toggle.description}</Em></Text>
                  )}
                  <Text>{' '}</Text>
                </Fragment>
              ))}

              <Text>{' '}</Text>
              <Text><Em>Toggle functionality coming soon!</Em></Text>
            </Fragment>
          ) : (
            <Text>No toggles defined for this excerpt.</Text>
          )}
        </TabPanel>
      </Tabs>
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
