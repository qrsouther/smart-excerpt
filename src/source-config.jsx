import React, { Fragment, useState, useEffect, useCallback } from 'react';
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
  Stack,
  Box,
  Icon,
  useForm,
  useConfig,
  useProductContext
} from '@forge/react';
import { invoke, view, router } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCategoriesQuery } from './hooks/admin-hooks';

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
    mutationFn: async ({ excerptName, category, content, excerptId, variableMetadata, toggleMetadata, documentationLinks, sourcePageId, sourcePageTitle, sourceSpaceKey, sourceLocalId }) => {
      try {
        const result = await invoke('saveExcerpt', {
          excerptName,
          category,
          content,
          excerptId,
          variableMetadata,
          toggleMetadata,
          documentationLinks,
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
  const [documentationLinks, setDocumentationLinks] = useState([]);

  // Form state for adding new documentation links
  const [newLinkAnchor, setNewLinkAnchor] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');

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

  // Fetch categories from storage (shared with Admin UI)
  const {
    data: categories = ['General', 'Pricing', 'Technical', 'Legal', 'Marketing'],
    isLoading: isLoadingCategories
  } = useCategoriesQuery();

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

      // Load documentation links
      if (excerptData.documentationLinks && Array.isArray(excerptData.documentationLinks)) {
        setDocumentationLinks(excerptData.documentationLinks);
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

  // Convert categories array to options format for Select component
  const categoryOptions = categories.map(cat => ({
    label: cat,
    value: cat
  }));

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
        documentationLinks,
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
          <Tab>Documentation</Tab>
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
              value={(isLoadingExcerpt || isLoadingCategories) ? undefined : categoryOptions.find(opt => opt.value === category)}
              placeholder={(isLoadingExcerpt || isLoadingCategories) ? 'Loading...' : undefined}
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
                      id={`var-desc-${variable.name}`}
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
                      id={`var-example-${variable.name}`}
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
                      id={`toggle-desc-${toggle.name}`}
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

        {/* Documentation Tab - Links */}
        <TabPanel>
          <FormSection>
            {/* Existing documentation links */}
            {documentationLinks.length > 0 && (
              <Fragment>
                <Text><Strong>Documentation Links</Strong></Text>
                <Text>{' '}</Text>
                {documentationLinks.map((link, index) => (
                  <Box key={index} padding="space.100" backgroundColor="color.background.neutral.subtle" style={{ marginBottom: '8px', borderRadius: '3px' }}>
                    <Inline space="space.200" alignBlock="center" spread="space-between">
                      <Stack space="space.050">
                        <Text><Strong>{link.anchor}</Strong></Text>
                        <Text size="small"><Em>{link.url}</Em></Text>
                      </Stack>
                      <Inline space="space.100">
                        <Button
                          appearance="subtle"
                          iconBefore={<Icon glyph="arrow-up" label="Move up" />}
                          isDisabled={index === 0 || isLoadingExcerpt}
                          onClick={() => {
                            const newLinks = [...documentationLinks];
                            [newLinks[index - 1], newLinks[index]] = [newLinks[index], newLinks[index - 1]];
                            setDocumentationLinks(newLinks);
                          }}
                        />
                        <Button
                          appearance="subtle"
                          iconBefore={<Icon glyph="arrow-down" label="Move down" />}
                          isDisabled={index === documentationLinks.length - 1 || isLoadingExcerpt}
                          onClick={() => {
                            const newLinks = [...documentationLinks];
                            [newLinks[index], newLinks[index + 1]] = [newLinks[index + 1], newLinks[index]];
                            setDocumentationLinks(newLinks);
                          }}
                        />
                        <Button
                          appearance="danger"
                          iconBefore={<Icon glyph="trash" label="Delete" />}
                          isDisabled={isLoadingExcerpt}
                          onClick={() => {
                            setDocumentationLinks(documentationLinks.filter((_, i) => i !== index));
                          }}
                        />
                      </Inline>
                    </Inline>
                  </Box>
                ))}
                <Text>{' '}</Text>
              </Fragment>
            )}

            {/* Add new documentation link form */}
            <Text><Strong>Add New Documentation Link</Strong></Text>
            <Text>{' '}</Text>
            <Textfield
              label="Anchor Text"
              placeholder={isLoadingExcerpt ? 'Loading...' : 'e.g., API Reference'}
              value={newLinkAnchor}
              isDisabled={isLoadingExcerpt}
              onChange={(e) => setNewLinkAnchor(e.target.value)}
            />
            <Textfield
              label="URL"
              placeholder={isLoadingExcerpt ? 'Loading...' : 'https://example.com/docs'}
              value={newLinkUrl}
              isDisabled={isLoadingExcerpt}
              onChange={(e) => {
                setNewLinkUrl(e.target.value);
                // Basic URL validation
                const url = e.target.value.trim();
                if (url && !url.match(/^https?:\/\/.+/i)) {
                  setUrlError('URL must start with http:// or https://');
                } else {
                  setUrlError('');
                }
              }}
            />
            {urlError && (
              <SectionMessage appearance="error">
                <Text>{urlError}</Text>
              </SectionMessage>
            )}
            <Text>{' '}</Text>
            <Button
              appearance="primary"
              isDisabled={!newLinkAnchor.trim() || !newLinkUrl.trim() || !!urlError || isLoadingExcerpt}
              onClick={() => {
                if (newLinkAnchor.trim() && newLinkUrl.trim() && !urlError) {
                  setDocumentationLinks([
                    ...documentationLinks,
                    { anchor: newLinkAnchor.trim(), url: newLinkUrl.trim() }
                  ]);
                  setNewLinkAnchor('');
                  setNewLinkUrl('');
                }
              }}
            >
              Add Link
            </Button>

            <Text>{' '}</Text>
            <SectionMessage appearance="discovery">
              <Text>Add documentation links that will appear in all Embed instances using this Source. Links open in a new tab.</Text>
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
                  await router.open('/wiki/admin/forge?id=ari%3Acloud%3Aecosystem%3A%3Aextension%2Fbe1ff96b-d44d-4975-98d3-25b80a813bdd%2Fbbebcb82-f8af-4cd4-8ddb-38c88a94d142%2Fstatic%2Fblueprint-standards-admin');
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
