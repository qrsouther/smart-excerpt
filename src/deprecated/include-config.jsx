import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Form,
  FormSection,
  FormFooter,
  Label,
  Select,
  Textfield,
  Text,
  Button,
  useForm,
  useConfig,
  AdfRenderer
} from '@forge/react';
import { invoke, view } from '@forge/bridge';

// Helper function to perform variable substitution in ADF content
const substituteVariablesInAdf = (adfNode, variableValues) => {
  if (!adfNode) return adfNode;

  // If it's a text node, perform substitution
  if (adfNode.type === 'text' && adfNode.text) {
    let text = adfNode.text;
    Object.entries(variableValues || {}).forEach(([varName, value]) => {
      const regex = new RegExp(`\\{\\{${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
      text = text.replace(regex, value);
    });
    return { ...adfNode, text };
  }

  // Recursively process content array
  if (adfNode.content && Array.isArray(adfNode.content)) {
    return {
      ...adfNode,
      content: adfNode.content.map(child => substituteVariablesInAdf(child, variableValues))
    };
  }

  return adfNode;
};

const App = () => {
  const config = useConfig() || {};
  const { handleSubmit, getFieldId } = useForm();
  const [excerpts, setExcerpts] = useState([]);
  const [selectedExcerptId, setSelectedExcerptId] = useState(config.excerptId || '');
  const [selectedExcerpt, setSelectedExcerpt] = useState(null);
  const [variableValues, setVariableValues] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Load excerpts on mount and when config changes
  useEffect(() => {
    const loadExcerpts = async () => {
      console.log('Loading excerpts...');
      console.log('Config on load:', config);
      const result = await invoke('getExcerpts');
      console.log('Excerpts loaded:', result);

      if (result.success) {
        setExcerpts(result.excerpts);

        // If there's a configured excerpt, load it
        if (config && config.excerptId) {
          console.log('Setting selected excerpt ID to:', config.excerptId);
          setSelectedExcerptId(config.excerptId);

          const excerptResult = await invoke('getExcerpt', { excerptId: config.excerptId });
          console.log('Loaded excerpt result:', excerptResult);
          if (excerptResult.success) {
            setSelectedExcerpt(excerptResult.excerpt);
          }
        } else {
          console.log('No config.excerptId found, config is:', config);
        }
      }
      setIsLoading(false);
    };

    loadExcerpts();
  }, [config]);

  // Update variableValues state when config changes
  useEffect(() => {
    if (config.variableValues) {
      console.log('Initializing variableValues from config:', config.variableValues);
      console.log('Config variableValues keys:', Object.keys(config.variableValues));

      // Also check if we need to handle camelCase conversion for hyphenated variable names
      if (selectedExcerpt && selectedExcerpt.variables) {
        console.log('Selected excerpt variables:', selectedExcerpt.variables.map(v => v.name));

        // Build a new object that checks both original and camelCase keys
        const toCamelCase = (str) => {
          return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        };

        const correctedValues = {};
        selectedExcerpt.variables.forEach(variable => {
          const originalName = variable.name;
          const camelCaseName = toCamelCase(originalName);

          // Try to find the value using both keys
          const value = config.variableValues[originalName] || config.variableValues[camelCaseName] || '';
          correctedValues[originalName] = value;

          console.log(`Variable ${originalName}: checking keys [${originalName}, ${camelCaseName}], found value: "${value}"`);
        });

        console.log('Corrected variableValues:', correctedValues);
        setVariableValues(correctedValues);
      } else {
        setVariableValues(config.variableValues);
      }
    }
  }, [config, selectedExcerpt]);

  const onExcerptChange = async (e) => {
    console.log('Excerpt changed, event:', e);
    const excerptId = e?.value || e;
    console.log('Excerpt ID:', excerptId);

    // Update both local state and form state
    setSelectedExcerptId(excerptId);

    if (excerptId) {
      const result = await invoke('getExcerpt', { excerptId });
      console.log('Loaded excerpt result:', result);
      if (result.success) {
        setSelectedExcerpt(result.excerpt);
      }
    } else {
      setSelectedExcerpt(null);
    }
  };

  const getPreviewContent = () => {
    if (!selectedExcerpt) return null;

    let content = selectedExcerpt.content;

    // Check if content is ADF or plain text
    const isAdf = content && typeof content === 'object' && content.type === 'doc';

    if (isAdf) {
      // ADF content - perform substitution in the ADF structure
      return substituteVariablesInAdf(content, variableValues);
    } else {
      // Plain text content - perform string substitution
      const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      if (selectedExcerpt.variables) {
        selectedExcerpt.variables.forEach(variable => {
          const value = variableValues[variable.name] || `{{${variable.name}}}`;
          const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
          content = content.replace(regex, value);
        });
      }

      return content;
    }
  };

  const onSubmit = async (formData) => {
    console.log('=== INCLUDE FORM SUBMIT ===');
    console.log('Form data:', formData);
    console.log('Selected excerpt ID:', selectedExcerptId);
    console.log('Selected excerpt:', selectedExcerpt);
    console.log('Variable values from state:', variableValues);

    // Generate cached content for instant display (Option 4: Optimistic rendering)
    const cachedContent = getPreviewContent();

    const configToSave = {
      excerptId: selectedExcerptId,
      excerptName: selectedExcerpt?.name,
      variableValues,
      cachedContent  // Store for instant display, will refresh from source in background
    };

    console.log('Saving config:', configToSave);
    console.log('variableValues keys:', Object.keys(variableValues));
    console.log('variableValues JSON:', JSON.stringify(variableValues, null, 2));
    console.log('cachedContent:', cachedContent);

    try {
      // Save configuration
      await view.submit({
        config: configToSave
      });

      console.log('Include configuration saved successfully');
    } catch (error) {
      console.error('Error saving include config:', error);
    }
  };

  if (isLoading) {
    return <Text>Loading standards...</Text>;
  }

  // Build excerpt options
  const excerptOptions = [{ label: '-- Select a Blueprint Standard --', value: '' }];
  const categorizedExcerpts = {};

  excerpts.forEach(excerpt => {
    const category = excerpt.category || 'General';
    if (!categorizedExcerpts[category]) {
      categorizedExcerpts[category] = [];
    }
    categorizedExcerpts[category].push(excerpt);
  });

  Object.keys(categorizedExcerpts).sort().forEach(category => {
    categorizedExcerpts[category].forEach(excerpt => {
      excerptOptions.push({
        label: `[${category}] ${excerpt.name}`,
        value: excerpt.id
      });
    });
  });

  // Find the selected option from the options array
  const selectedOption = selectedExcerptId
    ? excerptOptions.find(opt => opt.value === selectedExcerptId)
    : undefined;

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <FormSection>
        <Label labelFor={getFieldId('excerptSelect')}>
          Select Standard
        </Label>
        <Select
          id={getFieldId('excerptSelect')}
          options={excerptOptions}
          value={selectedOption}
          onChange={onExcerptChange}
        />

        {selectedExcerpt && selectedExcerpt.variables && selectedExcerpt.variables.length > 0 && (
          <Fragment>
            <Text>Fill in Variables:</Text>
            {selectedExcerpt.variables.map(variable => (
              <Fragment key={variable.name}>
                <Label labelFor={getFieldId(variable.name)}>
                  {variable.name}
                </Label>
                <Textfield
                  id={getFieldId(variable.name)}
                  placeholder={`Enter value for ${variable.name}`}
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

            <Text>---</Text>
            <Label>Preview:</Label>
            {(() => {
              const previewContent = getPreviewContent();
              const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

              return isAdf ? (
                <AdfRenderer document={previewContent} />
              ) : (
                <Text>{previewContent || ''}</Text>
              );
            })()}
          </Fragment>
        )}
      </FormSection>

      <FormFooter>
        <Button appearance="primary" type="submit">
          Save Embed
        </Button>
      </FormFooter>
    </Form>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
