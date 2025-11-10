import React, { Fragment, useState, useEffect } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Em,
  Code,
  Heading,
  Textfield,
  Toggle,
  Button,
  ButtonGroup,
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
  Select,
  Lozenge,
  xcss,
  useConfig,
  useProductContext,
  AdfRenderer
} from '@forge/react';
import { invoke, router, view } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Import ADF rendering utilities
import {
  cleanAdfForRenderer,
  filterContentByToggles,
  substituteVariablesInAdf,
  insertCustomParagraphsInAdf,
  insertInternalNotesInAdf,
  extractParagraphsFromAdf
} from './utils/adf-rendering-utils';

// Import React Query hooks
import {
  useExcerptData,
  useSaveVariableValues,
  useAvailableExcerpts,
  useVariableValues,
  useCachedContent
} from './hooks/embed-hooks';

// Import lazy loading hook
import { useIntersectionObserver } from './hooks/use-intersection-observer';

// Import UI components
import { VariableConfigPanel } from './components/VariableConfigPanel';
import { ToggleConfigPanel } from './components/ToggleConfigPanel';
import { CustomInsertionsPanel } from './components/CustomInsertionsPanel';
import { EnhancedDiffView } from './components/EnhancedDiffView';
import { UpdateAvailableBanner } from './components/embed/UpdateAvailableBanner';
import { EmbedViewMode } from './components/embed/EmbedViewMode';
import { EmbedEditMode } from './components/embed/EmbedEditMode';

// Import embed styles
import {
  previewBoxStyle,
  variableBoxStyle,
  requiredFieldStyle,
  updateBannerStyle,
  sectionContentStyle,
  adfContentContainerStyle,
  excerptSelectorStyle
} from './styles/embed-styles';

// ============================================================================
// STYLES - Imported from ./styles/embed-styles.js
// ============================================================================

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const App = () => {
  const config = useConfig();
  const context = useProductContext();
  const queryClient = useQueryClient();
  const isEditing = context?.extension?.isEditing;  // Fixed: it's on extension, not extensionContext!

  // Use context.localId directly - recovery happens lazily only when data is missing
  const effectiveLocalId = context?.localId;

  // NEW: Inline excerpt selection state (will be loaded from backend storage)
  const [selectedExcerptId, setSelectedExcerptId] = useState(null);
  // availableExcerpts state removed - now managed by React Query
  const [isInitializing, setIsInitializing] = useState(true);

  const [content, setContent] = useState(null);
  // excerpt state removed - now managed by React Query
  const [excerptForViewMode, setExcerptForViewMode] = useState(null);
  const [variableValues, setVariableValues] = useState(config?.variableValues || {});
  const [toggleStates, setToggleStates] = useState(config?.toggleStates || {});
  const [customInsertions, setCustomInsertions] = useState(config?.customInsertions || []);
  const [internalNotes, setInternalNotes] = useState(config?.internalNotes || []);
  const [insertionType, setInsertionType] = useState('body'); // 'body' or 'note'
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [customText, setCustomText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', or 'error'
  const [selectedTabIndex, setSelectedTabIndex] = useState(0); // Track active tab (0=Write, 1=Alternatives, 2=Free Write)
  // View mode staleness detection state
  const [isStale, setIsStale] = useState(false);
  const [isCheckingStaleness, setIsCheckingStaleness] = useState(false); // Tracks when staleness check is running
  const [sourceLastModified, setSourceLastModified] = useState(null);
  const [includeLastSynced, setIncludeLastSynced] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDiffView, setShowDiffView] = useState(false);
  const [latestRenderedContent, setLatestRenderedContent] = useState(null);
  const [syncedContent, setSyncedContent] = useState(null); // Old Source ADF from last sync for diff comparison

  // Lazy loading - DISABLED for now due to Forge UI limitations
  // Forge UI components don't expose real DOM nodes, so IntersectionObserver doesn't work
  // TODO: Investigate alternative lazy loading approach compatible with Forge UI
  const [containerRef, isVisible] = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '200px',
    triggerOnce: true,
    enabled: false // DISABLED - Forge UI doesn't support DOM refs for IntersectionObserver
  });

  // Use React Query to fetch excerpt data (enabled in both edit and view modes)
  // We need excerpt metadata (like documentationLinks) in both modes
  const {
    data: excerptFromQuery,
    isLoading: isLoadingExcerpt,
    error: excerptError,
    isFetching: isFetchingExcerpt
  } = useExcerptData(selectedExcerptId, true);

  // Use React Query mutation for saving variable values
  const {
    mutate: saveVariableValuesMutation,
    isPending: isSavingVariables,
    isSuccess: isSaveSuccess,
    isError: isSaveError
  } = useSaveVariableValues();

  // Use React Query to fetch available excerpts list (only in edit mode)
  const {
    data: availableExcerpts = [],
    isLoading: isLoadingExcerpts,
    error: excerptsError
  } = useAvailableExcerpts(isEditing);

  // Use React Query to fetch variable values (always, both edit and view mode)
  const {
    data: variableValuesData,
    isLoading: isLoadingVariableValues,
    error: variableValuesError
  } = useVariableValues(effectiveLocalId, true);

  // Use React Query to fetch cached content (view mode only)
  const {
    data: cachedContentData,
    isLoading: isLoadingCachedContent,
    error: cachedContentError
  } = useCachedContent(
    effectiveLocalId,
    selectedExcerptId,
    !isEditing, // Only fetch in view mode
    context,
    setVariableValues,
    setToggleStates,
    setCustomInsertions,
    setInternalNotes,
    setExcerptForViewMode
  );

  // Use excerptFromQuery when available (edit mode), fallback to manual state for view mode
  const excerpt = isEditing ? excerptFromQuery : excerptForViewMode;

  // Load excerptId from React Query data
  useEffect(() => {
    if (variableValuesData && variableValuesData.excerptId) {
      setSelectedExcerptId(variableValuesData.excerptId);
    }
    if (!isLoadingVariableValues) {
      setIsInitializing(false);
    }
  }, [variableValuesData, isLoadingVariableValues]);

  // Set content from React Query cached content data (view mode)
  useEffect(() => {
    if (!isEditing && cachedContentData) {
      setContent(cachedContentData.content);
    }
  }, [isEditing, cachedContentData, effectiveLocalId]);

  // NOTE: Cache invalidation ONLY happens after auto-save (see line ~406)
  // We do NOT invalidate on every mode switch - that would defeat caching!
  // The auto-save invalidation is sufficient to keep view mode fresh after edits.

  // Process excerpt data from React Query (runs in both Edit and View modes)
  // View Mode needs this to set excerptForViewMode with documentationLinks
  useEffect(() => {
    if (!selectedExcerptId || !effectiveLocalId) {
      return;
    }

    const loadContent = async () => {
      // Wait for React Query to load the excerpt
      if (!excerptFromQuery) {
        return;
      }

      // VIEW MODE: Just set excerptForViewMode and skip expensive processing
      // View Mode uses cached content, so we don't need to regenerate it
      if (!isEditing) {
        setExcerptForViewMode(excerptFromQuery);
        return;
      }

      // EDIT MODE: Full processing
      setIsRefreshing(true);

      try {
        // Load saved variable values, toggle states, custom insertions, and internal notes from storage
        let varsResultForLoading = await invoke('getVariableValues', { localId: effectiveLocalId });

        // CRITICAL: Check if data is missing - if so, attempt recovery from drag-to-move scenario
        // When a macro is dragged in Confluence, it may get a new localId, orphaning the data
        const hasNoData = !varsResultForLoading.lastSynced &&
                          Object.keys(varsResultForLoading.variableValues || {}).length === 0 &&
                          Object.keys(varsResultForLoading.toggleStates || {}).length === 0 &&
                          (varsResultForLoading.customInsertions || []).length === 0 &&
                          (varsResultForLoading.internalNotes || []).length === 0;

        if (varsResultForLoading.success && hasNoData && selectedExcerptId) {
          const pageId = context?.contentId || context?.extension?.content?.id;

          const recoveryResult = await invoke('recoverOrphanedData', {
            pageId: pageId,
            excerptId: selectedExcerptId,
            currentLocalId: context.localId
          });

          if (recoveryResult.success && recoveryResult.recovered) {
            // Reload the data now that it's been migrated
            varsResultForLoading = await invoke('getVariableValues', { localId: effectiveLocalId });
          }
        }

        const loadedVariableValues = varsResultForLoading.success ? varsResultForLoading.variableValues : {};
        const loadedToggleStates = varsResultForLoading.success ? varsResultForLoading.toggleStates : {};
        const loadedCustomInsertions = varsResultForLoading.success ? varsResultForLoading.customInsertions : [];
        const loadedInternalNotes = varsResultForLoading.success ? varsResultForLoading.internalNotes : [];

        // Auto-infer "client" variable from page title if it follows "Blueprint: [Client Name]" pattern
        let pageTitle = '';
        const contentId = context?.contentId || context?.extension?.content?.id;

        if (contentId) {
          try {
            const titleResult = await invoke('getPageTitle', { contentId });
            if (titleResult.success) {
              pageTitle = titleResult.title;
            }
          } catch (err) {
            console.error('Error fetching page title:', err);
          }
        }

        // Only auto-infer if client is undefined, null, or empty string
        const clientIsEmpty = !loadedVariableValues['client'] || loadedVariableValues['client'].trim() === '';

        // Check if title contains "Blueprint:" and extract client name
        if (pageTitle.includes('Blueprint:') && clientIsEmpty) {
          const blueprintIndex = pageTitle.indexOf('Blueprint:');
          const afterBlueprint = pageTitle.substring(blueprintIndex + 'Blueprint:'.length).trim();
          if (afterBlueprint) {
            loadedVariableValues['client'] = afterBlueprint;
          }
        }

        setVariableValues(loadedVariableValues);
        setToggleStates(loadedToggleStates);
        setCustomInsertions(loadedCustomInsertions || []);
        setInternalNotes(loadedInternalNotes || []);

        // NOW: Generate the fresh rendered content with loaded settings
        let freshContent = excerptFromQuery.content;
        const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

        if (isAdf) {
          // First filter toggles, then substitute variables, insert custom paragraphs, then internal notes
          freshContent = filterContentByToggles(freshContent, loadedToggleStates);
          freshContent = substituteVariablesInAdf(freshContent, loadedVariableValues);
          freshContent = insertCustomParagraphsInAdf(freshContent, loadedCustomInsertions);
          freshContent = insertInternalNotesInAdf(freshContent, loadedInternalNotes);
        } else {
          // For plain text, filter toggles first
          const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
          freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
            const trimmedName = toggleName.trim();
            return loadedToggleStates?.[trimmedName] === true ? content : '';
          });

          // Strip any remaining markers
          freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
          freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

          // Then substitute variables
          const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (excerptFromQuery.variables) {
            excerptFromQuery.variables.forEach(variable => {
              const value = loadedVariableValues[variable.name] || `{{${variable.name}}}`;
              const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
              freshContent = freshContent.replace(regex, value);
            });
          }
        }

        setContent(freshContent);
      } catch (err) {
        console.error('Error loading content:', err);
      } finally {
        setIsRefreshing(false);
      }
    };

    loadContent();
  }, [excerptFromQuery, effectiveLocalId, isEditing, isFetchingExcerpt]);

  // Auto-save effect with debouncing (saves variable values AND caches rendered content)
  // Now uses React Query mutation for better state management
  useEffect(() => {
    if (!isEditing || !effectiveLocalId || !selectedExcerptId || !excerpt) {
      return;
    }

    setSaveStatus('saving');

    const timeoutId = setTimeout(async () => {
      try {
        // Use React Query mutation to save variable values
        saveVariableValuesMutation({
          localId: effectiveLocalId,
          excerptId: selectedExcerptId,
          variableValues,
          toggleStates,
          customInsertions,
          internalNotes
        }, {
          onSuccess: async () => {
            // Also cache the rendered content for view mode
            const previewContent = getPreviewContent();
            await invoke('saveCachedContent', {
              localId: effectiveLocalId,
              renderedContent: previewContent,
              syncedContentHash: excerpt?.contentHash,
              syncedContent: excerpt?.content
            });

            // Invalidate the cached content query to force refresh when switching to view mode
            // This marks the React Query cache as stale so it refetches next time
            await queryClient.invalidateQueries({ queryKey: ['cachedContent', effectiveLocalId] });

            setSaveStatus('saved');
          },
          onError: (error) => {
            console.error('[REACT-QUERY-MUTATION] Auto-save failed:', error);
            setSaveStatus('error');
          }
        });
      } catch (error) {
        console.error('Error during auto-save:', error);
        setSaveStatus('error');
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [variableValues, toggleStates, customInsertions, internalNotes, isEditing, effectiveLocalId, selectedExcerptId, excerpt]);

  // Check for staleness in view mode immediately after render, with jitter for performance
  // Starts as soon as content is available, jitter spreads out requests across multiple Embeds
  useEffect(() => {
    // Skip staleness check in edit mode or if missing data
    if (isEditing || !content || !selectedExcerptId || !effectiveLocalId) {
      return;
    }

    // Add small random jitter (0-500ms) to spread out checks when page has many Embeds
    // This prevents thundering herd while still starting check immediately after render
    const jitter = Math.random() * 500; // 0-500ms

    const checkStaleness = async () => {
      setIsCheckingStaleness(true); // Start checking
      try {
        // Get excerpt metadata to check contentHash
        const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
        if (!excerptResult.success || !excerptResult.excerpt) {
          setIsCheckingStaleness(false);
          return;
        }

        // Get variable values to check syncedContentHash
        const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
        if (!varsResult.success) {
          setIsCheckingStaleness(false);
          return;
        }

        const sourceContentHash = excerptResult.excerpt.contentHash;
        const syncedContentHash = varsResult.syncedContentHash;

        // Hash-based staleness detection (primary method)
        let stale = false;
        if (sourceContentHash && syncedContentHash) {
          // Compare content hashes - if different, content has actually changed
          stale = sourceContentHash !== syncedContentHash;
        } else {
          // Fallback to timestamp comparison for backward compatibility
          // (for Include instances created before hash implementation)
          const sourceUpdatedAt = excerptResult.excerpt.updatedAt;
          const lastSynced = varsResult.lastSynced;

          if (sourceUpdatedAt && lastSynced) {
            const sourceDate = new Date(sourceUpdatedAt);
            const syncedDate = new Date(lastSynced);
            stale = sourceDate > syncedDate;
          }
        }

        setIsStale(stale);
        setSourceLastModified(excerptResult.excerpt.updatedAt);
        setIncludeLastSynced(varsResult.lastSynced);

        // If stale, store both old and new content for enhanced diff view
        if (stale) {
          setLatestRenderedContent(excerptResult.excerpt.content); // New Source content
          setSyncedContent(varsResult.syncedContent || null); // Old Source content from last sync

          // Load variable values and toggle states for diff view rendering
          // (We already have varsResult from staleness check, so reuse it)
          setVariableValues(varsResult.variableValues || {});
          setToggleStates(varsResult.toggleStates || {});
        }

        setIsCheckingStaleness(false); // Check complete
      } catch (err) {
        console.error('[Include] Staleness check error:', err);
        setIsCheckingStaleness(false); // Check complete (with error)
      }
    };

    // Start staleness check with jitter to spread out requests
    const timeoutId = setTimeout(() => {
      checkStaleness();
    }, jitter);

    // Cleanup timeout on unmount or dependency change
    return () => clearTimeout(timeoutId);
  }, [content, isEditing, selectedExcerptId, effectiveLocalId]);

  // Handler for excerpt selection from Select (must be defined before early returns)
  const handleExcerptSelection = async (selectedOption) => {
    if (!selectedOption || !effectiveLocalId) return;

    // Select component passes the entire option object
    const newExcerptId = selectedOption.value;

    setSelectedExcerptId(newExcerptId);
    setIsRefreshing(true);

    // Save the selection via backend storage using React Query mutation
    const pageId = context?.contentId || context?.extension?.content?.id;

    // Use mutation to save the selection
    saveVariableValuesMutation({
      localId: effectiveLocalId,
      excerptId: newExcerptId,
      variableValues: {},
      toggleStates: {},
      customInsertions: [],
      internalNotes: []
    });

    // Track usage
    if (pageId) {
      await invoke('trackExcerptUsage', {
        excerptId: newExcerptId,
        pageId: pageId,
        localId: effectiveLocalId
      });
    }

    // Invalidate relevant caches to force refetch
    await queryClient.invalidateQueries({ queryKey: ['excerpt', newExcerptId] });
    await queryClient.invalidateQueries({ queryKey: ['variableValues', effectiveLocalId] });
  };

  // NEW: Handle missing excerpt selection
  if (!selectedExcerptId) {
    if (isEditing) {
      // In edit mode: Show the excerpt selector immediately
      return (
        <Stack space="space.200">
          <Heading size="medium">Select a Standard to Embed</Heading>
          <Text>Choose a Blueprint Standard to display on this page:</Text>
          {isLoadingExcerpts ? (
            <Spinner size="medium" label="Loading standards..." />
          ) : (
            <Select
              options={availableExcerpts.map(ex => ({
                label: `${ex.name}${ex.category ? ` (${ex.category})` : ''}`,
                value: ex.id
              }))}
              onChange={handleExcerptSelection}
              placeholder="Choose a standard..."
            />
          )}
        </Stack>
      );
    } else {
      // In view mode: Show simple message
      return <Text>No standard selected. Edit this macro to choose one.</Text>;
    }
  }

  // Show spinner while loading in view mode
  if (!content && !isEditing) {
    return <Spinner />;
  }

  // Helper function to get preview content with current variable and toggle values
  const getPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;

    // Handle null/undefined content
    if (!previewContent) {
      return content || '';
    }

    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // First filter toggles, substitute variables, insert custom paragraphs, then internal notes
      previewContent = filterContentByToggles(previewContent, toggleStates);
      previewContent = substituteVariablesInAdf(previewContent, variableValues);
      previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions);
      previewContent = insertInternalNotesInAdf(previewContent, internalNotes);
      return cleanAdfForRenderer(previewContent);
    } else {
      // For plain text, filter toggles first
      const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
      previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
        const trimmedName = toggleName.trim();
        return toggleStates?.[trimmedName] === true ? content : '';
      });

      // Strip any remaining markers (in case regex didn't match full pattern)
      previewContent = previewContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
      previewContent = previewContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

      // Then substitute variables
      excerpt.variables?.forEach(variable => {
        const value = variableValues[variable.name] || `{{${variable.name}}}`;
        const regex = new RegExp(`\\{\\{${variable.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
        previewContent = previewContent.replace(regex, value);
      });
      return previewContent;
    }
  };

  // Get raw preview content for Alternatives and Free Write tabs (keeps toggle markers visible)
  const getRawPreviewContent = () => {
    if (!excerpt) return content;

    let previewContent = excerpt.content;

    // Handle null/undefined content
    if (!previewContent) {
      return content || '';
    }

    const isAdf = previewContent && typeof previewContent === 'object' && previewContent.type === 'doc';

    if (isAdf) {
      // Filter toggles (removes disabled content) but DON'T strip markers
      previewContent = filterContentByToggles(previewContent, toggleStates);
      previewContent = substituteVariablesInAdf(previewContent, variableValues);
      previewContent = insertCustomParagraphsInAdf(previewContent, customInsertions);
      previewContent = insertInternalNotesInAdf(previewContent, internalNotes);
      return cleanAdfForRenderer(previewContent);
    } else {
      // For plain text
      const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
      previewContent = previewContent.replace(toggleRegex, (match, toggleName, content) => {
        const trimmedName = toggleName.trim();
        // Keep full match (including markers) if enabled, remove everything if disabled
        return toggleStates?.[trimmedName] === true ? match : '';
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

  // Handler for updating to latest version (defined before edit mode rendering)
  const handleUpdateToLatest = async () => {
    if (!selectedExcerptId || !effectiveLocalId) {
      return;
    }

    setIsUpdating(true);

    try {
      // Fetch fresh excerpt
      const excerptResult = await invoke('getExcerpt', { excerptId: selectedExcerptId });
      if (!excerptResult.success || !excerptResult.excerpt) {
        alert('Failed to fetch latest Blueprint Standard content');
        return;
      }

      // Update the excerpt state so the new data (including documentationLinks) is available
      setExcerptForViewMode(excerptResult.excerpt);

      // Get current variable values, toggle states, custom insertions, and internal notes
      const varsResult = await invoke('getVariableValues', { localId: effectiveLocalId });
      const currentVariableValues = varsResult.success ? varsResult.variableValues : {};
      const currentToggleStates = varsResult.success ? varsResult.toggleStates : {};
      const currentCustomInsertions = varsResult.success ? varsResult.customInsertions : [];
      const currentInternalNotes = varsResult.success ? varsResult.internalNotes : [];

      // Generate fresh content with current settings
      let freshContent = excerptResult.excerpt.content;
      const isAdf = freshContent && typeof freshContent === 'object' && freshContent.type === 'doc';

      if (isAdf) {
        freshContent = filterContentByToggles(freshContent, currentToggleStates);
        freshContent = substituteVariablesInAdf(freshContent, currentVariableValues);
        freshContent = insertCustomParagraphsInAdf(freshContent, currentCustomInsertions);
        freshContent = insertInternalNotesInAdf(freshContent, currentInternalNotes);
      } else {
        // For plain text, filter toggles first
        const toggleRegex = /\{\{toggle:([^}]+)\}\}([\s\S]*?)\{\{\/toggle:\1\}\}/g;
        freshContent = freshContent.replace(toggleRegex, (match, toggleName, content) => {
          const trimmedName = toggleName.trim();
          return currentToggleStates?.[trimmedName] === true ? content : '';
        });

        // Strip any remaining markers
        freshContent = freshContent.replace(/\{\{toggle:[^}]+\}\}/g, '');
        freshContent = freshContent.replace(/\{\{\/toggle:[^}]+\}\}/g, '');

        // Substitute variables
        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (excerptResult.excerpt.variables) {
          excerptResult.excerpt.variables.forEach(variable => {
            const value = currentVariableValues[variable.name] || `{{${variable.name}}}`;
            const regex = new RegExp(`\\{\\{${escapeRegex(variable.name)}\\}\\}`, 'g');
            freshContent = freshContent.replace(regex, value);
          });
        }
      }

      // Update the displayed content
      setContent(freshContent);

      // Cache the updated content with new syncedContentHash and syncedContent
      await invoke('saveCachedContent', {
        localId: effectiveLocalId,
        renderedContent: freshContent,
        syncedContentHash: excerptResult.excerpt.contentHash,
        syncedContent: excerptResult.excerpt.content
      });

      // Clear staleness flags
      setIsStale(false);

      alert('Successfully updated! Click the Edit button to customize variables, toggles, and other settings.');
    } catch (err) {
      console.error('Error updating to latest:', err);
      alert('Error updating to latest version');
    } finally {
      setIsUpdating(false);
    }
  };

  // EDIT MODE: Show variable inputs and preview
  if (isEditing && excerpt) {
    return (
      <EmbedEditMode
        excerpt={excerpt}
        availableExcerpts={availableExcerpts}
        isLoadingExcerpts={isLoadingExcerpts}
        selectedExcerptId={selectedExcerptId}
        handleExcerptSelection={handleExcerptSelection}
        context={context}
        saveStatus={saveStatus}
        selectedTabIndex={selectedTabIndex}
        setSelectedTabIndex={setSelectedTabIndex}
        variableValues={variableValues}
        setVariableValues={setVariableValues}
        toggleStates={toggleStates}
        setToggleStates={setToggleStates}
        customInsertions={customInsertions}
        setCustomInsertions={setCustomInsertions}
        internalNotes={internalNotes}
        setInternalNotes={setInternalNotes}
        insertionType={insertionType}
        setInsertionType={setInsertionType}
        selectedPosition={selectedPosition}
        setSelectedPosition={setSelectedPosition}
        customText={customText}
        setCustomText={setCustomText}
        getPreviewContent={getPreviewContent}
        getRawPreviewContent={getRawPreviewContent}
      />
    );
  }

  // VIEW MODE: Show content with update notification if stale
  return (
    <EmbedViewMode
      content={content}
      isStale={isStale}
      isCheckingStaleness={isCheckingStaleness}
      showDiffView={showDiffView}
      setShowDiffView={setShowDiffView}
      handleUpdateToLatest={handleUpdateToLatest}
      isUpdating={isUpdating}
      syncedContent={syncedContent}
      latestRenderedContent={latestRenderedContent}
      variableValues={variableValues}
      toggleStates={toggleStates}
      excerpt={excerpt}
    />
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <App />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
