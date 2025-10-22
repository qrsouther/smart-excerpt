import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Form,
  FormSection,
  FormFooter,
  Label,
  Textfield,
  Select,
  Text,
  Strong,
  Em,
  Code,
  Button,
  SectionMessage,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  useForm,
  useConfig,
  useProductContext
} from '@forge/react';
import { invoke, view } from '@forge/bridge';

const App = () => {
  const config = useConfig() || {};
  const context = useProductContext();
  const { handleSubmit, getFieldId } = useForm();
  const excerptId = config.excerptId || null;

  // Access the macro body (rich text content)
  const macroBody = context?.extension?.macro?.body;

  // Use state for controlled components
  const [excerptName, setExcerptName] = useState('');
  const [category, setCategory] = useState('General');
  const [detectedVariables, setDetectedVariables] = useState([]);
  const [variableMetadata, setVariableMetadata] = useState({});
  const [detectedToggles, setDetectedToggles] = useState([]);
  const [toggleMetadata, setToggleMetadata] = useState({});
  const [isLoadingExcerpt, setIsLoadingExcerpt] = useState(false);

  console.log('Source config - config:', config);
  console.log('Source config - excerptName:', config.excerptName);
  console.log('Source config - category:', config.category);
  console.log('Source config - macroBody:', macroBody);

  // Load excerpt data from storage if we have an excerptId
  // Storage is the source of truth for all excerpt data including name/category
  useEffect(() => {
    if (!excerptId) {
      // No excerpt ID, load from config if available
      setExcerptName(config.excerptName || '');
      setCategory(config.category || 'General');
      setIsLoadingExcerpt(false);
      return;
    }

    const loadExcerpt = async () => {
      setIsLoadingExcerpt(true);
      try {
        const result = await invoke('getExcerpt', { excerptId });
        console.log('Loaded excerpt from storage:', result);

        if (result.success && result.excerpt) {
          // Load name and category from storage (source of truth)
          setExcerptName(result.excerpt.name || '');
          setCategory(result.excerpt.category || 'General');

          // Load variable metadata
          if (result.excerpt.variables && Array.isArray(result.excerpt.variables)) {
            const metadata = {};
            result.excerpt.variables.forEach(v => {
              metadata[v.name] = {
                description: v.description || '',
                example: v.example || ''
              };
            });
            setVariableMetadata(metadata);
          }

          // Load toggle metadata
          if (result.excerpt.toggles && Array.isArray(result.excerpt.toggles)) {
            const metadata = {};
            result.excerpt.toggles.forEach(t => {
              metadata[t.name] = {
                description: t.description || ''
              };
            });
            setToggleMetadata(metadata);
          }
        }
      } catch (err) {
        console.error('Error loading excerpt:', err);
      } finally {
        setIsLoadingExcerpt(false);
      }
    };

    loadExcerpt();
  }, [excerptId]);

  // Detect variables whenever macro body changes
  useEffect(() => {
    if (!macroBody) {
      setDetectedVariables([]);
      return;
    }

    // Call backend to detect variables
    const detectVars = async () => {
      try {
        const result = await invoke('detectVariablesFromContent', { content: macroBody });
        if (result.success) {
          setDetectedVariables(result.variables);
        }
      } catch (err) {
        console.error('Error detecting variables:', err);
      }
    };

    detectVars();
  }, [macroBody]);

  // Detect toggles whenever macro body changes
  useEffect(() => {
    if (!macroBody) {
      setDetectedToggles([]);
      return;
    }

    // Call backend to detect toggles
    const detectToggs = async () => {
      try {
        const result = await invoke('detectTogglesFromContent', { content: macroBody });
        if (result.success) {
          setDetectedToggles(result.toggles);
        }
      } catch (err) {
        console.error('Error detecting toggles:', err);
      }
    };

    detectToggs();
  }, [macroBody]);

  const categoryOptions = [
    { label: 'General', value: 'General' },
    { label: 'Pricing', value: 'Pricing' },
    { label: 'Technical', value: 'Technical' },
    { label: 'Legal', value: 'Legal' },
    { label: 'Marketing', value: 'Marketing' }
  ];

  const onSubmit = async (formData) => {
    console.log('=== FORM SUBMIT CALLED ===');
    console.log('Form data:', formData);
    console.log('State values:', { excerptName, category });
    console.log('Macro body (ADF):', macroBody);
    console.log('Variable metadata:', variableMetadata);
    console.log('Toggle metadata:', toggleMetadata);

    // Merge detected variables with their metadata
    const variablesWithMetadata = detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || ''
    }));

    // Merge detected toggles with their metadata
    const togglesWithMetadata = detectedToggles.map(t => ({
      name: t.name,
      description: toggleMetadata[t.name]?.description || ''
    }));

    console.log('Saving excerpt with name:', excerptName, 'category:', category);

    const result = await invoke('saveExcerpt', {
      excerptName,
      category,
      content: macroBody,  // Send the ADF body as content
      excerptId,
      variableMetadata: variablesWithMetadata,
      toggleMetadata: togglesWithMetadata
    });

    console.log('Save result:', result);

    // Only submit the config fields (not the content, which is in the body)
    // Use the current state values to ensure we save what the user typed
    const configToSubmit = {
      excerptId: result.excerptId,
      excerptName: excerptName,  // Use state value, not result
      category: category,          // Use state value, not result
      variables: result.variables,
      toggles: result.toggles
      // NOTE: Do NOT include content in config - it's stored in the macro body
    };

    console.log('Submitting config to view:', { config: configToSubmit });

    // Save the configuration to the macro using view.submit()
    // This will close the modal after the promise resolves
    return view.submit({ config: configToSubmit });
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit)}>
      <Tabs>
        <TabList>
          <Tab>Name/Category</Tab>
          <Tab>Variables</Tab>
          <Tab>Toggles</Tab>
        </TabList>

        <TabPanel>
          <FormSection>
            <Label labelFor={getFieldId('excerptName')}>
              SmartExcerpt Source Name
            </Label>
            <Textfield
              id={getFieldId('excerptName')}
              value={excerptName}
              placeholder={isLoadingExcerpt ? 'Loading...' : ''}
              isDisabled={isLoadingExcerpt}
              onChange={(e) => setExcerptName(e.target.value)}
            />

            <Label labelFor={getFieldId('category')}>
              SmartExcerpt Category
            </Label>
            <Select
              id={getFieldId('category')}
              options={categoryOptions}
              value={isLoadingExcerpt ? undefined : categoryOptions.find(opt => opt.value === category)}
              placeholder={isLoadingExcerpt ? 'Loading...' : undefined}
              onChange={(e) => setCategory(e.value)}
            />

            <Text>{' '}</Text>
            <SectionMessage appearance="discovery">
              <Text>Edit macro body in the page editor. Use {'{{variable}}'} syntax for variables. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
            </SectionMessage>
          </FormSection>
        </TabPanel>

        <TabPanel>
          <FormSection>
            {macroBody && detectedVariables.length === 0 && (
              <Text><Em>Checking for variables...</Em></Text>
            )}

            {detectedVariables.length === 0 && !macroBody && (
              <Text>No variables detected. Add {'{{variable}}'} syntax to your macro body to create variables.</Text>
            )}

            {detectedVariables.length > 0 && (
              <Fragment>
                {detectedVariables.map((variable) => (
                  <Fragment key={variable.name}>
                    <Text>{' '}</Text>
                    <Text><Strong><Code>{`{{${variable.name}}}`}</Code></Strong></Text>
                    <Textfield
                      label="Description"
                      placeholder={isLoadingExcerpt ? 'Loading...' : 'Description'}
                      value={variableMetadata[variable.name]?.description || ''}
                      isDisabled={isLoadingExcerpt}
                      onChange={(e) => {
                        setVariableMetadata({
                          ...variableMetadata,
                          [variable.name]: {
                            ...variableMetadata[variable.name],
                            description: e.target.value
                          }
                        });
                      }}
                    />
                    <Textfield
                      label="Example"
                      placeholder={isLoadingExcerpt ? 'Loading...' : 'Example'}
                      value={variableMetadata[variable.name]?.example || ''}
                      isDisabled={isLoadingExcerpt}
                      onChange={(e) => {
                        setVariableMetadata({
                          ...variableMetadata,
                          [variable.name]: {
                            ...variableMetadata[variable.name],
                            example: e.target.value
                          }
                        });
                      }}
                    />
                  </Fragment>
                ))}
              </Fragment>
            )}

            <Text>{' '}</Text>
            <SectionMessage appearance="discovery">
              <Text>Edit macro body in the page editor. Use {'{{variable}}'} syntax for variables. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
            </SectionMessage>
          </FormSection>
        </TabPanel>

        <TabPanel>
          <FormSection>
            {macroBody && detectedToggles.length === 0 && (
              <Text><Em>Checking for toggles...</Em></Text>
            )}

            {detectedToggles.length === 0 && !macroBody && (
              <Text>No toggles detected. Add {'{{toggle:name}}'} ... {'{{/toggle:name}}'} syntax to your macro body to create toggles.</Text>
            )}

            {detectedToggles.length > 0 && (
              <Fragment>
                {detectedToggles.map((toggle) => (
                  <Fragment key={toggle.name}>
                    <Text>{' '}</Text>
                    <Text><Strong><Code>{`{{toggle:${toggle.name}}}`}</Code></Strong></Text>
                    <Textfield
                      label="Description"
                      placeholder={isLoadingExcerpt ? 'Loading...' : 'Description'}
                      value={toggleMetadata[toggle.name]?.description || ''}
                      isDisabled={isLoadingExcerpt}
                      onChange={(e) => {
                        setToggleMetadata({
                          ...toggleMetadata,
                          [toggle.name]: {
                            description: e.target.value
                          }
                        });
                      }}
                    />
                  </Fragment>
                ))}
              </Fragment>
            )}

            <Text>{' '}</Text>
            <SectionMessage appearance="discovery">
              <Text>Edit macro body in the page editor. Use {'{{toggle:name}}'} and {'{{/toggle:name}}'} to wrap content that can be toggled on/off. IMPORTANT: After clicking "Save", you MUST publish the page to persist changes!</Text>
            </SectionMessage>
          </FormSection>
        </TabPanel>
      </Tabs>

      <FormFooter>
        <Button appearance="primary" type="submit">
          Save
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
