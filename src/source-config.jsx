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
  Toggle,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  Inline,
  useForm,
  useConfig,
  useProductContext
} from '@forge/react';
import { invoke, view, router } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (renamed from cacheTime in v5)
    },
  },
});

// Custom hook for fetching excerpt data with React Query
const useExcerptQuery = (excerptId, enabled) => {
  return useQuery({
    queryKey: ['excerpt', excerptId],
    queryFn: async () => {
      const result = await invoke('getExcerpt', { excerptId });

      if (!result.success || !result.excerpt) {
        throw new Error('Failed to load excerpt');
      }

      return result.excerpt;
    },
    enabled: enabled && !!excerptId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
};

// Custom hook for saving excerpt with React Query mutation
const useSaveExcerptMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ excerptName, category, content, excerptId, variableMetadata, toggleMetadata, sourcePageId, sourcePageTitle, sourceSpaceKey, sourceLocalId }) => {
      try {
        const result = await invoke('saveExcerpt', {
          excerptName,
          category,
          content,
          excerptId,
          variableMetadata,
          toggleMetadata,
          sourcePageId,
          sourcePageTitle,
          sourceSpaceKey,
          sourceLocalId
        });

        // Backend returns excerpt data directly (no success wrapper)
        if (!result || !result.excerptId) {
          throw new Error('Failed to save excerpt - invalid response');
        }

        return result;
      } catch (error) {
        console.error('[REACT-QUERY-SOURCE] Save error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Invalidate the excerpt cache so it refetches with updated data
      queryClient.invalidateQueries({ queryKey: ['excerpt', data.excerptId] });
      // Also invalidate the excerpts list (for Include macro dropdowns)
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });
    },
    onError: (error) => {
      console.error('[REACT-QUERY-SOURCE] Save failed:', error);
    }
  });
};

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

  // Track if we've loaded data to prevent infinite loops
  const hasLoadedDataRef = React.useRef(false);
  const lastExcerptIdRef = React.useRef(null);

  // Use React Query to fetch excerpt data
  const {
    data: excerptData,
    isLoading: isLoadingExcerpt,
    error: excerptError
  } = useExcerptQuery(excerptId, !!excerptId);

  // Use React Query mutation for saving
  const {
    mutate: saveExcerptMutation,
    isPending: isSavingExcerpt,
    isSuccess: isSaveSuccess,
    isError: isSaveError
  } = useSaveExcerptMutation();

  // Load excerpt data from React Query (only once per excerptId)
  useEffect(() => {
    // Reset flag if excerptId changed
    if (lastExcerptIdRef.current !== excerptId) {
      hasLoadedDataRef.current = false;
      lastExcerptIdRef.current = excerptId;
    }

    if (!excerptId) {
      // No excerpt ID, load from config if available (only once)
      if (!hasLoadedDataRef.current) {
        setExcerptName(config.excerptName || '');
        setCategory(config.category || 'General');
        hasLoadedDataRef.current = true;
      }
      return;
    }

    if (excerptData && !hasLoadedDataRef.current) {
      // Load name and category from React Query data
      setExcerptName(excerptData.name || '');
      setCategory(excerptData.category || 'General');

      // Load variable metadata
      if (excerptData.variables && Array.isArray(excerptData.variables)) {
        const metadata = {};
        excerptData.variables.forEach(v => {
          metadata[v.name] = {
            description: v.description || '',
            example: v.example || '',
            required: v.required || false
          };
        });
        setVariableMetadata(metadata);
      }

      // Load toggle metadata
      if (excerptData.toggles && Array.isArray(excerptData.toggles)) {
        const metadata = {};
        excerptData.toggles.forEach(t => {
          metadata[t.name] = {
            description: t.description || ''
          };
        });
        setToggleMetadata(metadata);
      }

      hasLoadedDataRef.current = true;
    }
  }, [excerptId, excerptData, config.excerptName, config.category]);

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
    // Merge detected variables with their metadata
    const variablesWithMetadata = detectedVariables.map(v => ({
      name: v.name,
      description: variableMetadata[v.name]?.description || '',
      example: variableMetadata[v.name]?.example || '',
      required: variableMetadata[v.name]?.required || false
    }));

    // Merge detected toggles with their metadata
    const togglesWithMetadata = detectedToggles.map(t => ({
      name: t.name,
      description: toggleMetadata[t.name]?.description || ''
    }));

    // Extract page info from context (router.getContext() not available in config context)
    const sourcePageId = context?.contentId || context?.extension?.content?.id;
    const sourcePageTitle = context?.contentTitle || context?.extension?.content?.title;
    const sourceSpaceKey = context?.spaceKey || context?.extension?.space?.key;

    // Use React Query mutation to save
    return new Promise((resolve, reject) => {
      saveExcerptMutation({
        excerptName,
        category,
        content: macroBody,
        excerptId,
        variableMetadata: variablesWithMetadata,
        toggleMetadata: togglesWithMetadata,
        sourcePageId,
        sourcePageTitle,
        sourceSpaceKey,
        sourceLocalId: context?.localId
      }, {
        onSuccess: (result) => {
          // Only submit the config fields (not the content, which is in the body)
          const configToSubmit = {
            excerptId: result.excerptId,
            excerptName: excerptName,
            category: category,
            variables: result.variables,
            toggles: result.toggles
          };

          // Save the configuration to the macro using view.submit()
          view.submit({ config: configToSubmit }).then(resolve).catch(reject);
        },
        onError: (error) => {
          console.error('[REACT-QUERY-SOURCE] Failed to save excerpt:', error);
          reject(error);
        }
      });
    });
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
              Blueprint Standard Source Name
            </Label>
            <Textfield
              id={getFieldId('excerptName')}
              value={excerptName}
              placeholder={isLoadingExcerpt ? 'Loading...' : ''}
              isDisabled={isLoadingExcerpt}
              onChange={(e) => setExcerptName(e.target.value)}
            />

            <Label labelFor={getFieldId('category')}>
              Blueprint Standard Category
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
                    <Inline space="space.300" alignBlock="center" spread="space-between">
                      <Text><Strong><Code>{`{{${variable.name}}}`}</Code></Strong></Text>
                      <Inline space="space.100" alignBlock="center">
                        <Text>Required</Text>
                        <Toggle
                          id={`required-${variable.name}`}
                          isChecked={variableMetadata[variable.name]?.required || false}
                          isDisabled={isLoadingExcerpt}
                          onChange={(e) => {
                            setVariableMetadata({
                              ...variableMetadata,
                              [variable.name]: {
                                ...variableMetadata[variable.name],
                                required: e.target.checked
                              }
                            });
                          }}
                        />
                      </Inline>
                    </Inline>
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
        <Inline space="space.200" alignBlock="center" spread="space-between">
          {excerptId && (
            <Text size="small">
              ID: <Code>{excerptId}</Code>
            </Text>
          )}
          <Inline space="space.200">
            <Button appearance="primary" type="submit">
              Save
            </Button>
            <Button
              appearance="link"
              onClick={async () => {
                try {
                  await router.open('/wiki/admin/forge?id=ari%3Acloud%3Aecosystem%3A%3Aextension%2Fbe1ff96b-d44d-4975-98d3-25b80a813bdd%2Fbbebcb82-f8af-4cd4-8ddb-38c88a94d142%2Fstatic%2Fsmartexcerpt-admin');
                } catch (err) {
                  console.error('Navigation error:', err);
                }
              }}
            >
              View Admin
            </Button>
          </Inline>
        </Inline>
      </FormFooter>
    </Form>
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </QueryClientProvider>
);
