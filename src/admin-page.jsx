import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Em,
  Button,
  Textfield,
  Select,
  Box,
  Modal,
  ModalTransition,
  Stack,
  Inline,
  Lozenge,
  Badge,
  SectionMessage,
  Tabs,
  Tab,
  TabList,
  TabPanel,
  AdfRenderer,
  xcss
} from '@forge/react';
import { invoke, router } from '@forge/bridge';

// Card styling
const cardStyles = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  boxShadow: 'elevation.shadow.raised',
  backgroundColor: 'color.background.neutral.subtle',
  minWidth: '250px',
  flex: '1 1 250px'
});

// Sidebar styling
const sidebarStyles = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  backgroundColor: 'color.background.neutral.subtle',
  minWidth: '250px',
  maxWidth: '300px'
});

const App = () => {
  const [excerpts, setExcerpts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usageData, setUsageData] = useState({});
  const [orphanedUsage, setOrphanedUsage] = useState([]);
  const [orphanedSources, setOrphanedSources] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('name-asc');
  const [selectedExcerpt, setSelectedExcerpt] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCheckingSources, setIsCheckingSources] = useState(false);

  // Load excerpts and their usage data
  useEffect(() => {
    const loadExcerpts = async () => {
      try {
        console.log('Admin page: Starting to load excerpts...');
        const result = await invoke('getAllExcerpts');
        console.log('Admin page: Result received:', result);

        if (result && result.success) {
          console.log('Admin page: Setting excerpts:', result.excerpts.length);

          // Sanitize excerpts to ensure no objects with {value, label} keys
          const sanitized = (result.excerpts || []).map(excerpt => {
            // Ensure variables is a proper array of objects
            const cleanVariables = Array.isArray(excerpt.variables)
              ? excerpt.variables.filter(v => v && typeof v === 'object' && v.name)
              : [];

            // Ensure toggles is a proper array of objects
            const cleanToggles = Array.isArray(excerpt.toggles)
              ? excerpt.toggles.filter(t => t && typeof t === 'object' && t.name)
              : [];

            return {
              ...excerpt,
              variables: cleanVariables,
              toggles: cleanToggles,
              category: String(excerpt.category || 'General'),
              updatedAt: excerpt.updatedAt ? String(excerpt.updatedAt) : null
            };
          });

          setExcerpts(sanitized);

          // Load usage data for each excerpt
          const usageMap = {};
          for (const excerpt of sanitized) {
            const usageResult = await invoke('getExcerptUsage', { excerptId: excerpt.id });
            if (usageResult && usageResult.success) {
              usageMap[excerpt.id] = usageResult.usage || [];
            }
          }
          setUsageData(usageMap);

          // Load orphaned usage data
          try {
            const orphanedResult = await invoke('getOrphanedUsage');
            if (orphanedResult && orphanedResult.success) {
              console.log('Orphaned usage found:', orphanedResult.orphanedUsage.length);
              setOrphanedUsage(orphanedResult.orphanedUsage);
            }
          } catch (orphanErr) {
            console.error('Failed to load orphaned usage:', orphanErr);
            setOrphanedUsage([]);
          }

          // Orphaned Sources will be loaded on-demand via "Check All Sources" button
          setOrphanedSources([]);
        } else {
          console.error('Admin page: Failed to load');
          setError('Failed to load excerpts');
        }
      } catch (err) {
        console.error('Admin page: Exception:', err);
        setError(String(err.message || 'Unknown error'));
      } finally {
        console.log('Admin page: Setting loading to false');
        setIsLoading(false);
      }
    };

    loadExcerpts();
  }, []);

  const handleCheckAllSources = async () => {
    setIsCheckingSources(true);
    try {
      console.log('🔍 Starting active check of all Sources...');
      const result = await invoke('checkAllSources');
      console.log('Check result:', result);

      if (result.success) {
        setOrphanedSources(Array.isArray(result.orphanedSources) ? result.orphanedSources : []);
        console.log(`✅ Check complete: ${result.activeCount} active, ${result.orphanedSources.length} orphaned`);
      } else {
        console.error('Check failed:', result.error);
        alert('Check failed: ' + result.error);
      }
    } catch (err) {
      console.error('Error checking sources:', err);
      alert('Error checking sources: ' + err.message);
    } finally {
      setIsCheckingSources(false);
    }
  };

  const handleDelete = async (excerptId) => {
    if (!confirm('Delete this source? This cannot be undone.')) {
      return;
    }

    try {
      const result = await invoke('deleteExcerpt', { excerptId });
      if (result.success) {
        // Reload excerpts
        setExcerpts(excerpts.filter(e => e.id !== excerptId));
      } else {
        alert('Failed to delete: ' + result.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <Fragment>
        <Text><Strong>SmartExcerpt Admin</Strong></Text>
        <Text>Loading...</Text>
      </Fragment>
    );
  }

  if (error) {
    return (
      <Fragment>
        <Text><Strong>SmartExcerpt Admin</Strong></Text>
        <Text>Error: {error}</Text>
      </Fragment>
    );
  }

  // Filter excerpts based on search term and category
  const filteredExcerpts = excerpts.filter(excerpt => {
    const matchesSearch = excerpt.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || excerpt.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Sort filtered excerpts
  const sortedExcerpts = [...filteredExcerpts].sort((a, b) => {
    switch (sortBy) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'usage-high':
        const usageA = (usageData[a.id] || []).length;
        const usageB = (usageData[b.id] || []).length;
        return usageB - usageA;
      case 'usage-low':
        const usageALow = (usageData[a.id] || []).length;
        const usageBLow = (usageData[b.id] || []).length;
        return usageALow - usageBLow;
      case 'category':
        return (a.category || 'General').localeCompare(b.category || 'General');
      default:
        return 0;
    }
  });

  return (
    <Fragment>
      <Inline space="space.200" alignBlock="start" shouldWrap={false}>
        {/* Left Sidebar - Filters */}
        <Box xcss={sidebarStyles}>
          <Stack space="space.200">
            <Text><Strong>Filters</Strong></Text>

            <Inline space="space.100" alignBlock="center">
              <Badge>{excerpts.length}</Badge>
              <Text>total SmartExcerpts</Text>
            </Inline>

            <Button
              appearance="primary"
              onClick={handleCheckAllSources}
              isDisabled={isCheckingSources}
            >
              {isCheckingSources ? 'Checking...' : '🔍 Check All Sources'}
            </Button>

            {(orphanedUsage.length > 0 || orphanedSources.length > 0) && (
              <SectionMessage appearance="warning">
                {orphanedSources.length > 0 && (
                  <Text><Strong>⚠ {orphanedSources.length} Orphaned Source(s)</Strong></Text>
                )}
                {orphanedUsage.length > 0 && (
                  <Text><Strong>⚠ {orphanedUsage.length} Orphaned Include(s)</Strong></Text>
                )}
                <Text>Scroll down to see orphaned items and remediation options.</Text>
              </SectionMessage>
            )}

            <Textfield
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <Select
              options={[
                { label: 'All Categories', value: 'All' },
                { label: 'General', value: 'General' },
                { label: 'Pricing', value: 'Pricing' },
                { label: 'Technical', value: 'Technical' },
                { label: 'Legal', value: 'Legal' },
                { label: 'Marketing', value: 'Marketing' }
              ]}
              value={{ label: categoryFilter === 'All' ? 'All Categories' : categoryFilter, value: categoryFilter }}
              onChange={(e) => setCategoryFilter(e.value)}
            />

            <Select
              options={[
                { label: 'Sort: Name (A-Z)', value: 'name-asc' },
                { label: 'Sort: Name (Z-A)', value: 'name-desc' },
                { label: 'Sort: Most Used', value: 'usage-high' },
                { label: 'Sort: Least Used', value: 'usage-low' },
                { label: 'Sort: Category', value: 'category' }
              ]}
              value={{
                label: sortBy === 'name-asc' ? 'Sort: Name (A-Z)' :
                       sortBy === 'name-desc' ? 'Sort: Name (Z-A)' :
                       sortBy === 'usage-high' ? 'Sort: Most Used' :
                       sortBy === 'usage-low' ? 'Sort: Least Used' :
                       'Sort: Category',
                value: sortBy
              }}
              onChange={(e) => setSortBy(e.value)}
            />
          </Stack>
        </Box>

        {/* Main Content - Cards */}
        <Box>
          {sortedExcerpts.length === 0 && (searchTerm || categoryFilter !== 'All') ? (
            <Text>No excerpts match your filters</Text>
          ) : !excerpts || excerpts.length === 0 ? (
            <Fragment>
              <Text>No SmartExcerpt Sources found.</Text>
              <Text>Create a SmartExcerpt Source macro on a page to get started.</Text>
            </Fragment>
          ) : (
            <Inline space="space.200" shouldWrap>
              {sortedExcerpts.map((excerpt) => {
                const category = String(excerpt.category || 'General');
                const usage = usageData[excerpt.id] || [];
                const usageCount = Array.isArray(usage) ? usage.length : 0;

                return (
                  <Box key={excerpt.id} xcss={cardStyles}>
                    <Text><Strong>{excerpt.name}</Strong></Text>
                    <Lozenge isBold>{category}</Lozenge>
                    <Text>{' '}</Text>
                    <Inline space="space.100" alignBlock="center">
                      <Badge>{usageCount}</Badge>
                      <Text>page(s)</Text>
                    </Inline>
                    <Button
                      appearance="primary"
                      onClick={() => {
                        setSelectedExcerpt(excerpt);
                        setIsModalOpen(true);
                      }}
                    >
                      Manage
                    </Button>
                  </Box>
                );
              })}
            </Inline>
          )}

          {/* Orphaned Sources Section */}
          {orphanedSources.length > 0 && (
            <Fragment>
              <Text>{' '}</Text>
              <Text>{' '}</Text>
              <Text><Strong>⚠ Orphaned Sources</Strong></Text>
              <Text>These Sources haven't checked in recently (likely deleted from page):</Text>
              <Text>{' '}</Text>
              <Inline space="space.200" shouldWrap>
                {orphanedSources.map((orphaned) => (
                  <Box key={orphaned.id} xcss={cardStyles}>
                    <Lozenge appearance="removed" isBold>ORPHANED SOURCE</Lozenge>
                    <Text>{' '}</Text>
                    <Text><Strong>{orphaned.name || 'Unknown'}</Strong></Text>
                    <Text>{' '}</Text>
                    <Text><Em>{orphaned.orphanedReason || 'Unknown reason'}</Em></Text>
                    <Text>{' '}</Text>
                    <Lozenge>{orphaned.category || 'General'}</Lozenge>
                    <Button
                      appearance="warning"
                      onClick={() => {
                        setSelectedExcerpt(orphaned);
                        setIsModalOpen(true);
                      }}
                    >
                      View Details
                    </Button>
                  </Box>
                ))}
              </Inline>
            </Fragment>
          )}

          {/* Orphaned Usage Section */}
          {orphanedUsage.length > 0 && (
            <Fragment>
              <Text>{' '}</Text>
              <Text>{' '}</Text>
              <Text><Strong>⚠ Orphaned Includes</Strong></Text>
              <Text>These Include macros reference Sources that no longer exist:</Text>
              <Text>{' '}</Text>
              <Inline space="space.200" shouldWrap>
                {orphanedUsage.map((orphaned) => (
                  <Box key={orphaned.excerptId} xcss={cardStyles}>
                    <Lozenge appearance="removed" isBold>ORPHANED</Lozenge>
                    <Text>{' '}</Text>
                    <Text><Strong>{orphaned.excerptName}</Strong></Text>
                    <Text>{' '}</Text>
                    <Inline space="space.100" alignBlock="center">
                      <Badge>{orphaned.referenceCount}</Badge>
                      <Text>page(s) affected</Text>
                    </Inline>
                    <Button
                      appearance="warning"
                      onClick={() => {
                        setSelectedExcerpt(orphaned);
                        setIsModalOpen(true);
                      }}
                    >
                      View Details
                    </Button>
                  </Box>
                ))}
              </Inline>
            </Fragment>
          )}
        </Box>
      </Inline>

      <ModalTransition>
        {isModalOpen && selectedExcerpt && (
          <Modal onClose={() => setIsModalOpen(false)}>
            {/* Check type: orphaned Source, orphaned Include, or regular excerpt */}
            {selectedExcerpt.orphanedReason ? (
              // Orphaned Source
              <Fragment>
                <Lozenge appearance="removed" isBold>ORPHANED SOURCE</Lozenge>
                <Text>{' '}</Text>
                <Text><Strong>{selectedExcerpt.name}</Strong></Text>
                <Text>{' '}</Text>

                <Tabs>
                  <TabList>
                    <Tab>Details</Tab>
                    <Tab>Preview</Tab>
                  </TabList>

                  <TabPanel>
                    <SectionMessage appearance="warning">
                      <Text>This Source has been deleted from its page or hasn't checked in recently.</Text>
                      <Text><Strong>Reason:</Strong> {selectedExcerpt.orphanedReason}</Text>
                    </SectionMessage>

                    <Text>Category: {selectedExcerpt.category}</Text>
                    <Text>Variables: {selectedExcerpt.variables?.length || 0}</Text>
                    <Text>Toggles: {selectedExcerpt.toggles?.length || 0}</Text>
                    <Text>{' '}</Text>

                    <Text><Strong>What happened?</Strong></Text>
                    <Text>The Source macro was likely deleted from the page where it was defined.</Text>
                    <Text>{' '}</Text>

                    <Text><Strong>Options:</Strong></Text>
                    <Text>  1. View Page History to see when it was deleted and restore it manually</Text>
                    <Text>  2. Delete this orphaned Source from storage to clean up</Text>
                    <Text>{' '}</Text>

                    {selectedExcerpt.sourcePageId && (
                      <Fragment>
                        <Button
                          appearance="link"
                          onClick={async () => {
                            try {
                              await router.navigate(`/wiki/pages/viewpage.action?pageId=${selectedExcerpt.sourcePageId}`);
                            } catch (err) {
                              console.error('Navigation error:', err);
                            }
                          }}
                        >
                          Go to Source Page
                        </Button>
                        <Button
                          appearance="default"
                          onClick={async () => {
                            try {
                              await router.navigate(`/wiki/pages/viewpreviousversions.action?pageId=${selectedExcerpt.sourcePageId}`);
                            } catch (err) {
                              console.error('Navigation error:', err);
                            }
                          }}
                        >
                          View Page History (Restore)
                        </Button>
                      </Fragment>
                    )}
                    <Button
                      appearance="danger"
                      onClick={() => {
                        handleDelete(selectedExcerpt.id);
                        setIsModalOpen(false);
                      }}
                    >
                      Delete Permanently
                    </Button>
                  </TabPanel>

                  <TabPanel>
                    <Text><Strong>Stored Macro Content:</Strong></Text>
                    <Text>{' '}</Text>
                    {selectedExcerpt.content && typeof selectedExcerpt.content === 'object' ? (
                      <AdfRenderer document={selectedExcerpt.content} />
                    ) : (
                      <Text>{selectedExcerpt.content || 'No content stored'}</Text>
                    )}
                  </TabPanel>
                </Tabs>
              </Fragment>
            ) : selectedExcerpt.referenceCount !== undefined ? (
              // Orphaned Include
              <Fragment>
                <Lozenge appearance="removed" isBold>ORPHANED</Lozenge>
                <Text>{' '}</Text>
                <Text><Strong>{selectedExcerpt.excerptName}</Strong></Text>
                <Text>{' '}</Text>

                <SectionMessage appearance="warning">
                  <Text>This Source has been deleted, but {selectedExcerpt.referenceCount} Include macro(s) still reference it.</Text>
                </SectionMessage>

                <Text><Strong>Affected Pages:</Strong></Text>
                {selectedExcerpt.references.map((ref, idx) => (
                  <Text key={idx}>  - {String(ref.pageTitle || 'Unknown Page')}</Text>
                ))}
                <Text>{' '}</Text>

                <Text>You should either:</Text>
                <Text>  1. Recreate the Source with the same name</Text>
                <Text>  2. Update the Include macros to reference a different Source</Text>
                <Text>  3. Remove the Include macros from the affected pages</Text>
              </Fragment>
            ) : (
              // Regular excerpt
              <Fragment>
                <Text><Strong>{selectedExcerpt.name}</Strong></Text>
                <Text>{' '}</Text>

                <Tabs>
                  <TabList>
                    <Tab>Details</Tab>
                    <Tab>Preview</Tab>
                  </TabList>

                  <TabPanel>
                    <Text>Category: {String(selectedExcerpt.category || 'General')}</Text>
                    <Text>Variables: {Array.isArray(selectedExcerpt.variables) ? selectedExcerpt.variables.length : 0}</Text>
                    <Text>Toggles: {Array.isArray(selectedExcerpt.toggles) ? selectedExcerpt.toggles.length : 0}</Text>
                    <Text>{' '}</Text>

                    <Text><Strong>Usage</Strong></Text>
                    {(() => {
                      const usage = usageData[selectedExcerpt.id] || [];
                      const usageCount = Array.isArray(usage) ? usage.length : 0;
                      return (
                        <Fragment>
                          <Text>Used on {usageCount} page(s)</Text>
                          {usageCount > 0 && (
                            <Fragment>
                              {usage.map((ref, idx) => (
                                <Text key={idx}>  - {String(ref.pageTitle || 'Unknown Page')}</Text>
                              ))}
                            </Fragment>
                          )}
                        </Fragment>
                      );
                    })()}
                    <Text>{' '}</Text>

                    {selectedExcerpt.sourcePageId && (
                      <Button
                        appearance="link"
                        onClick={async () => {
                          try {
                            await router.navigate(`/wiki/pages/viewpage.action?pageId=${selectedExcerpt.sourcePageId}`);
                          } catch (err) {
                            console.error('Navigation error:', err);
                          }
                        }}
                      >
                        View Source Page
                      </Button>
                    )}
                    <Button
                      appearance="danger"
                      onClick={() => {
                        handleDelete(selectedExcerpt.id);
                        setIsModalOpen(false);
                      }}
                    >
                      Delete
                    </Button>
                  </TabPanel>

                  <TabPanel>
                    <Text><Strong>Stored Macro Content:</Strong></Text>
                    <Text>{' '}</Text>
                    {selectedExcerpt.content && typeof selectedExcerpt.content === 'object' ? (
                      <AdfRenderer document={selectedExcerpt.content} />
                    ) : (
                      <Text>{selectedExcerpt.content || 'No content stored'}</Text>
                    )}
                  </TabPanel>
                </Tabs>
              </Fragment>
            )}
          </Modal>
        )}
      </ModalTransition>
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
