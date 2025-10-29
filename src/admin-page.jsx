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
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
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
  DynamicTable,
  Icon,
  Tooltip,
  Pressable,
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

// Full-width table container
const fullWidthTableStyle = xcss({
  width: '100%'
});

// Preview content border styling (matches Include macro preview)
const previewBoxStyle = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  padding: 'space.200'
});

// Select dropdown styling - wider to accommodate labels
const selectStyles = xcss({
  minWidth: '200px'
});

// Left sidebar styling - takes up 10% of viewport width
const leftSidebarStyles = xcss({
  width: '10%',
  minWidth: '150px',
  paddingInlineEnd: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius'
});

// Middle section styling - takes up 90% of viewport width (full width without right panel)
const middleSectionStyles = xcss({
  width: '90%',
  paddingInlineEnd: 'space.200',
  paddingInlineStart: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius'
});

// Right content area styling - takes up 45% of viewport width
const rightContentStyles = xcss({
  width: '45%',
  paddingInlineStart: 'space.200',
  padding: 'space.200',
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius'
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
  const [showPreviewModal, setShowPreviewModal] = useState(null);
  const [selectedExcerptForDetails, setSelectedExcerptForDetails] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCheckingSources, setIsCheckingSources] = useState(false);
  // Category management
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categories, setCategories] = useState(['General', 'Pricing', 'Technical', 'Legal', 'Marketing']);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // Load categories from storage on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const result = await invoke('getCategories');
        if (result.success && result.categories) {
          setCategories(result.categories);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setCategoriesLoaded(true);
      }
    };

    loadCategories();
  }, []);

  // Save categories to storage whenever they change (after initial load)
  useEffect(() => {
    if (!categoriesLoaded) return; // Skip initial load

    const saveCategories = async () => {
      try {
        await invoke('saveCategories', { categories });
      } catch (err) {
        console.error('Failed to save categories:', err);
      }
    };

    saveCategories();
  }, [categories, categoriesLoaded]);

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

  // Category management handlers
  const handleDeleteCategory = (categoryName) => {
    // Check if any excerpts use this category
    const excerptsUsingCategory = excerpts.filter(e => (e.category || 'General') === categoryName);

    if (excerptsUsingCategory.length > 0) {
      const excerptNames = excerptsUsingCategory.map(e => e.name).join(', ');
      alert(`Cannot delete category "${categoryName}". Please reassign the following excerpts first: ${excerptNames}`);
      return;
    }

    if (confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
      setCategories(prev => prev.filter(c => c !== categoryName));
      alert(`Category "${categoryName}" deleted successfully`);
    }
  };

  const handleEditCategory = (oldName) => {
    const newName = prompt(`Enter new name for category "${oldName}":`, oldName);
    if (newName && newName.trim() && newName !== oldName) {
      const trimmedName = newName.trim();

      // Check if category already exists
      if (categories.includes(trimmedName)) {
        alert(`Category "${trimmedName}" already exists`);
        return;
      }

      // Update category in the list
      setCategories(prev => prev.map(c => c === oldName ? trimmedName : c));

      // Note: In a full implementation, you'd also update all excerpts using this category
      alert(`Category renamed from "${oldName}" to "${trimmedName}". Note: Existing excerpts still use the old category name.`);
    }
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      alert('Please enter a category name');
      return;
    }

    const trimmedName = newCategoryName.trim();

    if (categories.includes(trimmedName)) {
      alert(`Category "${trimmedName}" already exists`);
      return;
    }

    setCategories(prev => [...prev, trimmedName]);
    setNewCategoryName('');
    alert(`Category "${trimmedName}" added successfully`);
  };

  const handleMoveCategoryUp = (categoryName) => {
    const index = categories.indexOf(categoryName);
    if (index <= 0) return; // Already at top or not found

    const newCategories = [...categories];
    [newCategories[index - 1], newCategories[index]] = [newCategories[index], newCategories[index - 1]];
    setCategories(newCategories);
  };

  const handleMoveCategoryDown = (categoryName) => {
    const index = categories.indexOf(categoryName);
    if (index === -1 || index >= categories.length - 1) return; // Already at bottom or not found

    const newCategories = [...categories];
    [newCategories[index], newCategories[index + 1]] = [newCategories[index + 1], newCategories[index]];
    setCategories(newCategories);
  };

  const handleCheckAllSources = async () => {
    setIsCheckingSources(true);
    try {
      console.log('🔍 Starting active check of all Sources...');
      const result = await invoke('checkAllSources');
      console.log('Check result:', result);

      if (result.success) {
        setOrphanedSources(Array.isArray(result.orphanedSources) ? result.orphanedSources : []);

        // Build summary message
        let message = `✅ Check complete:\n`;
        message += `• ${result.activeCount} active Source(s)\n`;
        message += `• ${result.orphanedSources.length} orphaned Source(s)`;

        if (result.staleEntriesRemoved > 0) {
          message += `\n\n🧹 Cleanup complete:\n`;
          message += `• ${result.staleEntriesRemoved} stale Include entry/entries removed`;
        } else {
          message += `\n\n✨ No stale Include entries found`;
        }

        console.log(message);
        alert(message);
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
      {/* Top Toolbar - Filters and Actions */}
      <Box xcss={xcss({ marginBlockEnd: 'space.300' })}>
        <Inline space="space.200" alignBlock="center" spread="space-between">
          {/* Left side - empty for now */}
          <Box />

          {/* Right side - filters and buttons */}
          <Inline space="space.150" alignBlock="center">
            <Textfield
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <Box xcss={selectStyles}>
              <Select
                options={[
                  { label: 'All Categories', value: 'All' },
                  ...categories.map(cat => ({ label: cat, value: cat }))
                ]}
                value={{ label: categoryFilter === 'All' ? 'All Categories' : categoryFilter, value: categoryFilter }}
                onChange={(e) => setCategoryFilter(e.value)}
              />
            </Box>

            <Box xcss={selectStyles}>
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
            </Box>

            <Button
              appearance="primary"
              onClick={handleCheckAllSources}
              isDisabled={isCheckingSources}
            >
              {isCheckingSources ? 'Checking...' : '🔍 Check All Sources'}
            </Button>

            <Button
              appearance="primary"
              onClick={() => {
                // Placeholder - functionality to be implemented
                console.log('Check All Includes clicked');
              }}
            >
              🔍 Check All Includes
            </Button>

            <Button
              appearance="primary"
              onClick={() => setIsCategoryModalOpen(true)}
            >
              Manage Categories
            </Button>
          </Inline>
        </Inline>
      </Box>

      {/* Warning messages */}
      {(orphanedUsage.length > 0 || orphanedSources.length > 0) && (
        <Box xcss={xcss({ marginBlockEnd: 'space.300' })}>
          <SectionMessage appearance="warning">
            {orphanedSources.length > 0 && (
              <Text><Strong>⚠ {orphanedSources.length} Orphaned Source(s)</Strong></Text>
            )}
            {orphanedUsage.length > 0 && (
              <Text><Strong>⚠ {orphanedUsage.length} Orphaned Include(s)</Strong></Text>
            )}
            <Text>Scroll down to see orphaned items and remediation options.</Text>
          </SectionMessage>
        </Box>
      )}

      {/* Main Content Area - Split into sidebar and main */}
      <Inline space="space.200" alignBlock="start" shouldWrap={false}>
        {/* Left Sidebar - Excerpt List Table */}
        <Box xcss={leftSidebarStyles}>
          {sortedExcerpts.length === 0 && (searchTerm || categoryFilter !== 'All') ? (
            <Text>No excerpts match your filters</Text>
          ) : !excerpts || excerpts.length === 0 ? (
            <Fragment>
              <Text>No SmartExcerpt Sources found.</Text>
              <Text>Create a SmartExcerpt Source macro on a page to get started.</Text>
            </Fragment>
          ) : (
            <Stack space="space.100">
              {sortedExcerpts.map((excerpt) => {
                const category = String(excerpt.category || 'General');
                const isSelected = selectedExcerptForDetails?.id === excerpt.id;

                return (
                  <Pressable
                    key={excerpt.id}
                    onClick={() => {
                      console.log('Row clicked for:', excerpt.name);
                      setSelectedExcerptForDetails(excerpt);
                    }}
                    xcss={xcss({
                      padding: 'space.100',
                      borderRadius: 'border.radius',
                      backgroundColor: isSelected ? 'color.background.selected' : 'color.background.neutral.subtle',
                      cursor: 'pointer',
                      ':hover': {
                        backgroundColor: 'color.background.neutral.hovered'
                      }
                    })}
                  >
                    <Inline space="space.100" alignBlock="center" shouldWrap>
                      <Text><Strong>{excerpt.name}</Strong></Text>
                      <Lozenge isBold>{category}</Lozenge>
                    </Inline>
                  </Pressable>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* Middle Section - Excerpt Details with Inline Editing */}
        <Box xcss={middleSectionStyles}>
          {(() => {
            console.log('Middle section rendering, selectedExcerptForDetails:', selectedExcerptForDetails?.name);
            console.log('Full excerpt object:', selectedExcerptForDetails);

            if (!selectedExcerptForDetails) {
              return (
                <Box>
                  <Text><Em>Select an excerpt from the list to view its usage details</Em></Text>
                </Box>
              );
            }

            try {
              const usage = usageData[selectedExcerptForDetails.id] || [];
              console.log('Usage data for excerpt:', usage.length, 'entries');

              const hasVariables = Array.isArray(selectedExcerptForDetails.variables) && selectedExcerptForDetails.variables.length > 0;
              const hasToggles = Array.isArray(selectedExcerptForDetails.toggles) && selectedExcerptForDetails.toggles.length > 0;

              // De-duplicate by pageId
              const uniqueUsage = [];
              const seenPages = new Map();
              for (const ref of usage) {
                if (!seenPages.has(ref.pageId)) {
                  seenPages.set(ref.pageId, ref);
                  uniqueUsage.push(ref);
                } else {
                  const existing = seenPages.get(ref.pageId);
                  if (new Date(ref.updatedAt) > new Date(existing.updatedAt)) {
                    const idx = uniqueUsage.findIndex(u => u.pageId === ref.pageId);
                    uniqueUsage[idx] = ref;
                    seenPages.set(ref.pageId, ref);
                  }
                }
              }

              // Build table header cells
              const headerCells = [{ key: 'page', content: 'Page', isSortable: true }];

              if (hasVariables) {
                selectedExcerptForDetails.variables.forEach(variable => {
                  headerCells.push({
                    key: `var-${variable.name}`,
                    content: variable.name,
                    isSortable: true
                  });
                });
              }

              if (hasToggles) {
                selectedExcerptForDetails.toggles.forEach(toggle => {
                  headerCells.push({
                    key: `toggle-${toggle.name}`,
                    content: toggle.name,
                    isSortable: true
                  });
                });
              }

              // Add Status and Actions columns
              headerCells.push({ key: 'status', content: 'Status', isSortable: true });
              headerCells.push({ key: 'actions', content: 'Actions', isSortable: false });

              // Calculate usage count and staleness
              const usageCount = uniqueUsage.length;
              const excerptLastModified = new Date(selectedExcerptForDetails.updatedAt || 0);
              const hasAnyStaleInstances = uniqueUsage.some(ref => {
                const includeLastSynced = ref.lastSynced ? new Date(ref.lastSynced) : new Date(0);
                return excerptLastModified > includeLastSynced;
              });

              return (
                <Stack space="space.300">
                  {/* Excerpt Header */}
                  <Box>
                    <Inline space="space.100" alignBlock="center" spread="space-between">
                      <Inline space="space.100" alignBlock="center">
                        <Text size="xlarge"><Strong>Excerpt:</Strong> {selectedExcerptForDetails.name}</Text>
                        <Lozenge>{selectedExcerptForDetails.category || 'General'}</Lozenge>
                      </Inline>
                      <Inline space="space.100" alignBlock="center">
                        <Button
                          appearance="subtle"
                          onClick={() => setShowPreviewModal(selectedExcerptForDetails.id)}
                        >
                          Preview Content
                        </Button>
                        <Button
                          appearance="default"
                          onClick={async () => {
                            try {
                              await router.open(`/wiki/pages/viewpage.action?pageId=${selectedExcerptForDetails.sourcePageId}`);
                            } catch (err) {
                              console.error('Navigation error:', err);
                              alert('Error navigating to source page: ' + err.message);
                            }
                          }}
                          iconAfter={() => <Icon glyph="shortcut" label="Opens in new tab" />}
                        >
                          View Source
                        </Button>
                        <Button
                          appearance="danger"
                          onClick={async () => {
                            const excerptName = selectedExcerptForDetails.name;
                            const sourcePageId = selectedExcerptForDetails.sourcePageId;

                            const confirmMessage = `Are you sure you want to PERMANENTLY DELETE the excerpt "${excerptName}" from the library?\n\nNote: This only removes the excerpt from this library. The CONTENT assigned to this excerpt is still stored as text content within the Source macro on its source page.`;

                            if (confirm(confirmMessage)) {
                              try {
                                const result = await invoke('deleteExcerpt', { excerptId: selectedExcerptForDetails.id });
                                if (result.success) {
                                  // Remove from local state
                                  setExcerpts(excerpts.filter(e => e.id !== selectedExcerptForDetails.id));
                                  setSelectedExcerptForDetails(null);

                                  // Show success message with link to source page
                                  const viewSource = confirm(`Excerpt "${excerptName}" has been permanently deleted from the library.\n\nWould you like to view the source page where the content is still stored?`);
                                  if (viewSource) {
                                    await router.navigate(`/wiki/pages/viewpage.action?pageId=${sourcePageId}`);
                                  }
                                } else {
                                  alert('Failed to delete excerpt: ' + result.error);
                                }
                              } catch (err) {
                                console.error('Delete error:', err);
                                alert('Error deleting excerpt: ' + err.message);
                              }
                            }
                          }}
                        >
                          Permadelete
                        </Button>
                        <Button
                          appearance="primary"
                          isDisabled={!hasAnyStaleInstances}
                          onClick={async () => {
                            if (!confirm(`Push this Source to ALL ${usageCount} page(s)? This will update all cached instances with the latest content.`)) {
                              return;
                            }

                            try {
                              const result = await invoke('pushUpdatesToAll', {
                                excerptId: selectedExcerptForDetails.id
                              });

                              if (result.success) {
                                alert(`Successfully pushed updates to ${result.updated} of ${result.total} instance(s)`);
                                // Refresh usage data
                                const refreshedUsage = await invoke('getExcerptUsage', { excerptId: selectedExcerptForDetails.id });
                                if (refreshedUsage.success) {
                                  setUsageData({ [selectedExcerptForDetails.id]: refreshedUsage.usage || [] });
                                }
                              } else {
                                alert(`Failed to push updates: ${result.error}`);
                              }
                            } catch (err) {
                              console.error('Error pushing updates to all:', err);
                              alert('Error pushing updates to all pages');
                            }
                          }}
                        >
                          Push to All Pages
                        </Button>
                      </Inline>
                    </Inline>
                  </Box>

                  {/* Helper Text */}
                  <SectionMessage appearance="information">
                    <Stack space="space.100">
                      <Text>
                        The <Strong>{selectedExcerptForDetails.name}</Strong> excerpt is referenced using the SmartExcerpt Include macro on the following pages, with the following variables and/or toggles set within those pages.
                      </Text>
                      <Text>
                        The Status column shows whether each Include instance is up to date with the latest Source content. Use <Strong>Push Update</Strong> to update specific pages, or <Strong>Push to All Pages</Strong> to update all instances at once.
                      </Text>
                      <Text>
                        To edit variable values or toggle settings, navigate to the page by clicking its name and edit the Include macro directly.
                      </Text>
                    </Stack>
                  </SectionMessage>

                  {/* Usage Table */}
                  {uniqueUsage.length === 0 ? (
                    <Text><Em>This excerpt is not used on any pages yet</Em></Text>
                  ) : (
                    <DynamicTable
                      head={{ cells: headerCells }}
                      rows={uniqueUsage.map((ref) => {
                        const rowCells = [
                          {
                            key: 'page',
                            content: (
                              <Button
                                appearance="link"
                                onClick={async () => {
                                  try {
                                    let url = `/wiki/pages/viewpage.action?pageId=${ref.pageId}`;
                                    if (ref.headingAnchor) {
                                      url += `#${ref.headingAnchor}`;
                                    }
                                    await router.open(url);
                                  } catch (err) {
                                    console.error('Navigation error:', err);
                                  }
                                }}
                                iconAfter={() => <Icon glyph="shortcut" label="Opens in new tab" />}
                              >
                                {ref.pageTitle || 'Unknown Page'}
                              </Button>
                            )
                          }
                        ];

                        // Add variable cells (read-only)
                        if (hasVariables) {
                          selectedExcerptForDetails.variables.forEach(variable => {
                            const value = ref.variableValues?.[variable.name] || '';
                            const maxLength = 50;
                            const isTruncated = value.length > maxLength;
                            const displayValue = isTruncated ? value.substring(0, maxLength) + '...' : value;

                            rowCells.push({
                              key: `var-${variable.name}`,
                              content: value ? (
                                isTruncated ? (
                                  <Tooltip content={value}>
                                    <Text>{displayValue}</Text>
                                  </Tooltip>
                                ) : (
                                  <Text>{displayValue}</Text>
                                )
                              ) : (
                                <Text><Em>(empty)</Em></Text>
                              )
                            });
                          });
                        }

                        // Add toggle cells (read-only icon display)
                        if (hasToggles) {
                          selectedExcerptForDetails.toggles.forEach(toggle => {
                            const toggleState = ref.toggleStates?.[toggle.name] || false;
                            rowCells.push({
                              key: `toggle-${toggle.name}`,
                              content: toggleState ? (
                                <Icon glyph="check-circle" label="Enabled" color="color.icon.success" />
                              ) : (
                                <Icon glyph="cross-circle" label="Disabled" color="color.icon.danger" />
                              )
                            });
                          });
                        }

                        // Add Status cell
                        const excerptLastModified = new Date(selectedExcerptForDetails.updatedAt || 0);
                        const includeLastSynced = ref.lastSynced ? new Date(ref.lastSynced) : new Date(0);
                        const isStale = excerptLastModified > includeLastSynced;

                        console.log(`📊 Status check for ${ref.pageTitle}:`, {
                          excerptUpdatedAt: selectedExcerptForDetails.updatedAt,
                          includeLastSynced: ref.lastSynced,
                          excerptLastModified: excerptLastModified.toISOString(),
                          includeLastSyncedDate: includeLastSynced.toISOString(),
                          isStale
                        });

                        // Format timestamps for tooltip (local timezone with abbreviation)
                        const formatTimestamp = (date) => {
                          if (!date || date.getTime() === 0) return 'Never';
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const year = date.getFullYear();
                          const hours = String(date.getHours()).padStart(2, '0');
                          const minutes = String(date.getMinutes()).padStart(2, '0');

                          // Get timezone abbreviation
                          const timezoneName = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();

                          return `${month}/${day}/${year} ${hours}:${minutes} ${timezoneName}`;
                        };

                        const tooltipText = `Source last updated: ${formatTimestamp(excerptLastModified)}\nInclude last synced: ${formatTimestamp(includeLastSynced)}`;

                        rowCells.push({
                          key: 'status',
                          content: (
                            <Tooltip content={tooltipText}>
                              {isStale ? (
                                <Lozenge appearance="moved">Update Available</Lozenge>
                              ) : (
                                <Lozenge appearance="success">Up to date</Lozenge>
                              )}
                            </Tooltip>
                          )
                        });

                        // Add actions cell with Push Update button (only enabled when stale)
                        rowCells.push({
                          key: 'actions',
                          content: (
                            <Button
                              appearance="primary"
                              spacing="compact"
                              isDisabled={!isStale}
                              onClick={async () => {
                                try {
                                  const result = await invoke('pushUpdatesToPage', {
                                    excerptId: selectedExcerptForDetails.id,
                                    pageId: ref.pageId
                                  });

                                  if (result.success) {
                                    alert(`Successfully pushed update to ${result.updated} instance(s) on this page`);
                                    // Refresh usage data
                                    const refreshedUsage = await invoke('getExcerptUsage', { excerptId: selectedExcerptForDetails.id });
                                    if (refreshedUsage.success) {
                                      setUsageData(prev => ({
                                        ...prev,
                                        [selectedExcerptForDetails.id]: refreshedUsage.usage || []
                                      }));
                                    }
                                  } else {
                                    alert(`Failed to push update: ${result.error}`);
                                  }
                                } catch (err) {
                                  console.error('Error pushing update:', err);
                                  alert('Error pushing update');
                                }
                              }}
                            >
                              Push Update
                            </Button>
                          )
                        });

                        return {
                          key: ref.localId,
                          cells: rowCells
                        };
                      })}
                    />
                  )}
                </Stack>
              );
            } catch (error) {
              console.error('Error rendering middle section:', error);
              return (
                <Box>
                  <Text><Strong>Error loading excerpt details</Strong></Text>
                  <Text>{error.message}</Text>
                </Box>
              );
            }
          })()}
        </Box>

      </Inline>

      {/* Orphaned items sections */}
      <Box>
          {sortedExcerpts.length > 0 && (
            <Fragment>

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
            </Fragment>
          )}
        </Box>

      <ModalTransition>
        {isModalOpen && selectedExcerpt && (
          <Modal onClose={() => setIsModalOpen(false)} width="x-large">
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
                <ModalHeader>
                  <Inline space="space.100" alignBlock="center">
                    <ModalTitle>{selectedExcerpt.name}</ModalTitle>
                    <Lozenge appearance="default">{String(selectedExcerpt.category || 'General')}</Lozenge>
                  </Inline>
                </ModalHeader>

                <ModalBody>
                  <Box xcss={fullWidthTableStyle}>
                      <Stack space="space.200">
                      {(() => {
                        const usage = usageData[selectedExcerpt.id] || [];
                        // Count unique pages, not total references
                        const uniquePageIds = Array.isArray(usage)
                          ? new Set(usage.map(ref => ref.pageId)).size
                          : 0;
                        const usageCount = uniquePageIds;
                        const hasToggles = Array.isArray(selectedExcerpt.toggles) && selectedExcerpt.toggles.length > 0;
                        const hasVariables = Array.isArray(selectedExcerpt.variables) && selectedExcerpt.variables.length > 0;

                        // Build header cells - start with Page column (no width constraints)
                        const headerCells = [
                          {
                            key: 'page',
                            content: 'Page',
                            isSortable: true
                          }
                        ];

                        // Add variable columns if excerpt has variables
                        if (hasVariables) {
                          selectedExcerpt.variables.forEach(variable => {
                            headerCells.push({
                              key: `var-${variable.name}`,
                              content: variable.name,
                              isSortable: false
                            });
                          });
                        }

                        // Add toggle columns if excerpt has toggles
                        if (hasToggles) {
                          selectedExcerpt.toggles.forEach(toggle => {
                            headerCells.push({
                              key: `toggle-${toggle.name}`,
                              content: toggle.name,
                              isSortable: true
                            });
                          });
                        }

                        // De-duplicate references by pageId
                        // If multiple references exist for the same page, keep the most recent one
                        const uniqueUsage = [];
                        const seenPages = new Map();

                        for (const ref of usage) {
                          if (!seenPages.has(ref.pageId)) {
                            seenPages.set(ref.pageId, ref);
                            uniqueUsage.push(ref);
                          } else {
                            // Keep the most recent reference for this page
                            const existing = seenPages.get(ref.pageId);
                            if (new Date(ref.updatedAt) > new Date(existing.updatedAt)) {
                              // Replace with more recent reference
                              const idx = uniqueUsage.findIndex(u => u.pageId === ref.pageId);
                              uniqueUsage[idx] = ref;
                              seenPages.set(ref.pageId, ref);
                            }
                          }
                        }

                        return (
                          <Stack space="space.200">
                            <Text>Included in the following {usageCount} page(s)</Text>
                            {usageCount > 0 && (
                              <Box xcss={fullWidthTableStyle}>
                                <DynamicTable
                                  head={{
                                    cells: headerCells
                                  }}
                                  rows={uniqueUsage.map((ref, idx) => {
                                    // Build row cells - start with Page cell
                                    const rowCells = [
                                      {
                                        key: 'page',
                                        content: (
                                          <Button
                                            appearance="link"
                                            onClick={async () => {
                                              try {
                                                // Build URL with optional heading anchor
                                                let url = `/wiki/pages/viewpage.action?pageId=${ref.pageId}`;
                                                if (ref.headingAnchor) {
                                                  url += `#${ref.headingAnchor}`;
                                                }
                                                await router.open(url);
                                              } catch (err) {
                                                console.error('Navigation error:', err);
                                              }
                                            }}
                                          >
                                            {String(ref.pageTitle || 'Unknown Page')}
                                          </Button>
                                        )
                                      }
                                    ];

                                    // Add variable value cells if excerpt has variables
                                    if (hasVariables) {
                                      selectedExcerpt.variables.forEach(variable => {
                                        const variableValue = ref.variableValues?.[variable.name] || '';
                                        const maxLength = 50; // Truncate after 50 characters
                                        const isTruncated = variableValue.length > maxLength;
                                        const displayValue = isTruncated
                                          ? variableValue.substring(0, maxLength) + '...'
                                          : variableValue;

                                        rowCells.push({
                                          key: `var-${variable.name}`,
                                          content: variableValue ? (
                                            isTruncated ? (
                                              <Tooltip content={variableValue}>
                                                <Text>{displayValue}</Text>
                                              </Tooltip>
                                            ) : (
                                              <Text>{displayValue}</Text>
                                            )
                                          ) : (
                                            <Em>(empty)</Em>
                                          )
                                        });
                                      });
                                    }

                                    // Add toggle state cells if excerpt has toggles
                                    if (hasToggles) {
                                      selectedExcerpt.toggles.forEach(toggle => {
                                        const toggleState = ref.toggleStates?.[toggle.name] || false;
                                        rowCells.push({
                                          key: `toggle-${toggle.name}`,
                                          content: toggleState ? (
                                            <Icon glyph="check-circle" label="Enabled" color="color.icon.success" />
                                          ) : (
                                            <Icon glyph="cross-circle" label="Disabled" color="color.icon.danger" />
                                          )
                                        });
                                      });
                                    }

                                    // Add Status cell
                                    const excerptLastModified = new Date(selectedExcerpt.updatedAt || 0);
                                    const includeLastSynced = ref.lastSynced ? new Date(ref.lastSynced) : new Date(0);
                                    const isStale = excerptLastModified > includeLastSynced;

                                    // Format timestamps for tooltip (local timezone with abbreviation)
                                    const formatTimestamp = (date) => {
                                      if (!date || date.getTime() === 0) return 'Never';
                                      const month = String(date.getMonth() + 1).padStart(2, '0');
                                      const day = String(date.getDate()).padStart(2, '0');
                                      const year = date.getFullYear();
                                      const hours = String(date.getHours()).padStart(2, '0');
                                      const minutes = String(date.getMinutes()).padStart(2, '0');

                                      // Get timezone abbreviation
                                      const timezoneName = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();

                                      return `${month}/${day}/${year} ${hours}:${minutes} ${timezoneName}`;
                                    };

                                    const tooltipText = `Source last updated: ${formatTimestamp(excerptLastModified)}\nInclude last synced: ${formatTimestamp(includeLastSynced)}`;

                                    rowCells.push({
                                      key: 'status',
                                      content: (
                                        <Tooltip content={tooltipText}>
                                          {isStale ? (
                                            <Lozenge appearance="moved">Update Available</Lozenge>
                                          ) : (
                                            <Lozenge appearance="success">Up to date</Lozenge>
                                          )}
                                        </Tooltip>
                                      )
                                    });

                                    // Add Actions cell with Push Update button (only enabled when stale)
                                    rowCells.push({
                                      key: 'actions',
                                      content: (
                                        <Button
                                          appearance="primary"
                                          spacing="compact"
                                          isDisabled={!isStale}
                                          onClick={async () => {
                                            try {
                                              const result = await invoke('pushUpdatesToPage', {
                                                excerptId: selectedExcerpt.id,
                                                pageId: ref.pageId
                                              });

                                              if (result.success) {
                                                alert(`Successfully pushed update to ${result.updated} instance(s) on this page`);
                                                // Refresh usage data
                                                const refreshedUsage = await invoke('getExcerptUsage', { excerptId: selectedExcerpt.id });
                                                if (refreshedUsage.success) {
                                                  setUsageData({ [selectedExcerpt.id]: refreshedUsage.usage || [] });
                                                }
                                              } else {
                                                alert(`Failed to push update: ${result.error}`);
                                              }
                                            } catch (err) {
                                              console.error('Error pushing update:', err);
                                              alert('Error pushing update');
                                            }
                                          }}
                                        >
                                          Push Update
                                        </Button>
                                      )
                                    });

                                    return {
                                      key: `page-${idx}`,
                                      cells: rowCells
                                    };
                                  })}
                                />
                              </Box>
                            )}
                          </Stack>
                        );
                      })()}
                      </Stack>
                    </Box>
                </ModalBody>

                <ModalFooter>
                  <Inline space="space.100">
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
                  </Inline>
                </ModalFooter>
              </Fragment>
            )}
          </Modal>
        )}
      </ModalTransition>

      {/* Category Management Modal */}
      <ModalTransition>
        {isCategoryModalOpen && (
          <Modal onClose={() => setIsCategoryModalOpen(false)} width="medium">
            <ModalHeader>
              <ModalTitle>Manage Categories</ModalTitle>
            </ModalHeader>

            <ModalBody>
              <Stack space="space.300">
                {/* Add New Category Input */}
                <Box>
                  <Stack space="space.100">
                    <Text><Strong>Add New Category:</Strong></Text>
                    <Inline space="space.100" alignBlock="center">
                      <Textfield
                        placeholder="Enter category name..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                      />
                      <Button appearance="primary" onClick={handleAddCategory}>
                        Add
                      </Button>
                    </Inline>
                  </Stack>
                </Box>

                {/* Category List */}
                <Box>
                  <Stack space="space.100">
                    {categories.map((category, index) => (
                      <Box
                        key={category}
                        xcss={xcss({
                          padding: 'space.150',
                          borderColor: 'color.border',
                          borderStyle: 'solid',
                          borderWidth: 'border.width',
                          borderRadius: 'border.radius',
                          backgroundColor: 'color.background.neutral.subtle'
                        })}
                      >
                        <Inline space="space.200" alignBlock="center" spread="space-between">
                          <Text><Strong>{category}</Strong></Text>
                          <Inline space="space.100" alignBlock="center">
                            <Button
                              appearance="subtle"
                              onClick={() => handleMoveCategoryUp(category)}
                              isDisabled={index === 0}
                            >
                              <Icon glyph="arrow-up" label="Move Up" />
                            </Button>
                            <Button
                              appearance="subtle"
                              onClick={() => handleMoveCategoryDown(category)}
                              isDisabled={index === categories.length - 1}
                            >
                              <Icon glyph="arrow-down" label="Move Down" />
                            </Button>
                            <Button
                              appearance="subtle"
                              onClick={() => handleEditCategory(category)}
                            >
                              <Icon glyph="edit" label="Edit" />
                            </Button>
                            <Button
                              appearance="subtle"
                              onClick={() => handleDeleteCategory(category)}
                            >
                              <Icon glyph="trash" label="Delete" />
                            </Button>
                          </Inline>
                        </Inline>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </ModalBody>

            <ModalFooter>
              <Button onClick={() => setIsCategoryModalOpen(false)}>
                Close
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>

      {/* Preview Content Modal */}
      <ModalTransition>
        {showPreviewModal && (() => {
          const excerpt = excerpts.find(e => e.id === showPreviewModal);
          if (!excerpt) return null;

          return (
            <Modal width="x-large" onClose={() => setShowPreviewModal(null)}>
              <ModalHeader>
                <ModalTitle>Preview: {excerpt.name}</ModalTitle>
              </ModalHeader>

              <ModalBody>
                <Stack space="space.200">
                  {/* Helper Text */}
                  <SectionMessage appearance="information">
                    <Stack space="space.100">
                      <Text>
                        The following preview is pulled from the SmartExcerpt Source macro's body content. The variables (in double curly braces) are filled out by users via the SmartExcerpt Include macros.
                      </Text>
                      <Text>
                        The toggle tags allow users to opt into certain settings or options within each excerpted solution, and by enabling a toggle all content that exists in the space between the opening toggle tag and closing toggle tag is revealed within the Include macro. Variables can be defined within toggles as well; as a result, generally a variable that is utilized ONLY within a toggle in a given Source macro will be optional rather than required.
                      </Text>
                      <Text>
                        Click on View Source to make changes to the body content of the Source macro.
                      </Text>
                    </Stack>
                  </SectionMessage>

                  <Box xcss={previewBoxStyle}>
                    {excerpt.content && typeof excerpt.content === 'object' ? (
                      <AdfRenderer document={excerpt.content} />
                    ) : (
                      <Text>{excerpt.content || 'No content stored'}</Text>
                    )}
                  </Box>
                </Stack>
              </ModalBody>

              <ModalFooter>
                <Button onClick={() => setShowPreviewModal(null)}>
                  Close
                </Button>
              </ModalFooter>
            </Modal>
          );
        })()}
      </ModalTransition>
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
