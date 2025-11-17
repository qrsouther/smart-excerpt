import React, { Fragment, useState, useEffect, useRef } from 'react';
import ForgeReconciler, {
  Text,
  Strong,
  Em,
  Button,
  Textfield,
  TextArea,
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
  ProgressBar,
  Heading,
  xcss
} from '@forge/react';
import { invoke, router } from '@forge/bridge';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Import React Query hooks
import {
  useExcerptsQuery,
  useCategoriesQuery,
  useSaveCategoriesMutation,
  useExcerptUsageQuery,
  useDeleteExcerptMutation,
  useCheckAllSourcesMutation,
  useCheckAllIncludesMutation,
  usePushUpdatesToPageMutation,
  usePushUpdatesToAllMutation,
  useAllUsageCountsQuery,
  useCreateTestPageMutation
} from './hooks/admin-hooks';

// Import utility functions
import {
  escapeCSV,
  generateIncludesCSV,
  generateMultiExcerptCSV,
  generateSourceUsageCSV,
  filterExcerpts,
  sortExcerpts,
  calculateStalenessStatus
} from './utils/admin-utils';
import { APP_VERSION } from './utils/version';

// Import components
import { MigrationModal } from './components/MigrationModal';

// Import admin UI components
import { ExcerptListSidebar } from './components/admin/ExcerptListSidebar';
import { StalenessBadge } from './components/admin/StalenessBadge';
import { ExcerptPreviewModal } from './components/admin/ExcerptPreviewModal';
import { CategoryManager } from './components/admin/CategoryManager';
import { CheckAllProgressBar } from './components/admin/CheckAllProgressBar';
import { AdminToolbar } from './components/admin/AdminToolbar';
import { OrphanedItemsSection } from './components/admin/OrphanedItemsSection';
import { EmergencyRecoveryModal } from './components/admin/EmergencyRecoveryModal';
import { VersionHistoryModal } from './components/admin/VersionHistoryModal';
import { StorageUsageFooter } from './components/admin/StorageUsageFooter';
import { RedlineQueuePage } from './components/admin/RedlineQueuePage';
import { StorageBrowser } from './components/admin/StorageBrowser';

// Import admin styles
import {
  cardStyles,
  fullWidthTableStyle,
  tableScrollContainerStyle,
  tableCellSeparatorStyle,
  previewBoxStyle,
  selectStyles,
  leftSidebarStyles,
  scrollableListStyle,
  middleSectionStyles,
  rightContentStyles,
  sectionSeparatorStyles,
  sectionMarginStyles,
  tabPanelContentStyles
} from './styles/admin-styles';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data is considered fresh for this long
      gcTime: 1000 * 60 * 30, // 30 minutes - cached data is kept in memory for this long
      retry: 1, // Only retry failed requests once
      refetchOnWindowFocus: false, // Disabled to prevent console flooding (Phase 2 fix)
      refetchOnReconnect: true, // Refetch when user reconnects after being offline
      refetchOnMount: true, // Refetch when component mounts if data is stale
    },
  },
});

// ============================================================================
// STYLES - Imported from ./styles/admin-styles.js
// ============================================================================

// ⚠️ ONE-TIME USE MIGRATION FEATURE FLAG - DELETE AFTER PRODUCTION MIGRATION ⚠️
// Feature flag: Set to true to show migration tools in Admin UI
// Migration resolvers are still available in backend (src/resolvers/migration-resolvers.js)
// After production migration is complete:
// 1. Delete all code wrapped in {SHOW_MIGRATION_TOOLS && ...} conditionals
// 2. Delete this flag
// 3. Delete migration state variables below (lines ~127-138)
// 4. Delete migration handler functions (search for "handleScanMultiExcerpt", "handleBulkImport", etc.)
const SHOW_MIGRATION_TOOLS = true; // TEMPORARILY ENABLED FOR ONE-TIME BULK IMPORT

// App version (imported from utils/version.js - keep in sync with package.json)

const App = () => {
  // ============================================================================
  // REACT QUERY HOOKS
  // ============================================================================

  // Get query client for manual cache invalidation
  const queryClient = useQueryClient();

  // Fetch excerpts and orphaned data
  const {
    data: excerptsQueryData,
    isLoading,
    error: excerptsError
  } = useExcerptsQuery();

  const excerpts = excerptsQueryData?.excerpts || [];
  const orphanedUsage = excerptsQueryData?.orphanedUsage || [];

  // Fetch categories
  const {
    data: categories = ['General', 'Pricing', 'Technical', 'Legal', 'Marketing']
  } = useCategoriesQuery();

  // Mutations
  const saveCategoriesMutation = useSaveCategoriesMutation();
  const deleteExcerptMutation = useDeleteExcerptMutation();
  const checkAllSourcesMutation = useCheckAllSourcesMutation();
  const checkAllIncludesMutation = useCheckAllIncludesMutation();
  const pushToPageMutation = usePushUpdatesToPageMutation();
  const pushToAllMutation = usePushUpdatesToAllMutation();
  const createTestPageMutation = useCreateTestPageMutation();

  // Fetch all usage counts (for sorting)
  const { data: usageCounts = {} } = useAllUsageCountsQuery();

  // ============================================================================
  // STORE ADMIN URL ON FIRST LOAD
  // ============================================================================
  // Store the admin page URL in storage so other components can navigate to it
  useEffect(() => {
    const storeAdminUrl = async () => {
      try {
        // Try to get current URL from window.location (may not work in all Forge contexts)
        let adminUrl = null;
        if (typeof window !== 'undefined' && window.location) {
          // Get the full URL including query parameters
          adminUrl = window.location.href;
        }
        
        // If we got a URL, store it
        if (adminUrl) {
          await invoke('setAdminUrl', { adminUrl });
          console.log('[Admin] Stored admin URL:', adminUrl);
        }
      } catch (error) {
        // Silently fail - this is not critical functionality
        console.warn('[Admin] Could not store admin URL:', error);
      }
    };
    
    storeAdminUrl();
  }, []); // Run once on mount

  // ============================================================================
  // LOCAL UI STATE (not data fetching)
  // ============================================================================

  const [selectedTab, setSelectedTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('name-asc');
  const [selectedExcerpt, setSelectedExcerpt] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(null);
  const [selectedExcerptForDetails, setSelectedExcerptForDetails] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orphanedSources, setOrphanedSources] = useState([]);

  // Lazy load full usage data using React Query when excerpt selected
  const { data: selectedExcerptUsage } = useExcerptUsageQuery(
    selectedExcerptForDetails?.id,
    !!selectedExcerptForDetails
  );

  // Check All Includes progress state
  const [includesCheckResult, setIncludesCheckResult] = useState(null);
  const [includesProgress, setIncludesProgress] = useState(null);
  const [progressId, setProgressId] = useState(null);

  // Force delete orphaned references state
  const [isDeletingOrphanedRefs, setIsDeletingOrphanedRefs] = useState(false);
  const [lastVerificationTime, setLastVerificationTime] = useState(null);
  const [isAutoVerifying, setIsAutoVerifying] = useState(false);

  // ⚠️ ONE-TIME USE MIGRATION STATE - DELETE AFTER PRODUCTION MIGRATION ⚠️
  const [isScanningMultiExcerpt, setIsScanningMultiExcerpt] = useState(false);
  const [multiExcerptScanResult, setMultiExcerptScanResult] = useState(null);
  const [multiExcerptProgress, setMultiExcerptProgress] = useState(null);
  const [multiExcerptProgressId, setMultiExcerptProgressId] = useState(null);
  const [migrationPageId, setMigrationPageId] = useState('');
  const [migrationSpaceKey, setMigrationSpaceKey] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [isCreatingMacros, setIsCreatingMacros] = useState(false);
  const [macroCreationResult, setMacroCreationResult] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Category management UI
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Migration Modal UI
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);

  // Emergency Recovery Modal UI (Phase 1 Safety Patch - v7.16.0)
  const [isEmergencyRecoveryOpen, setIsEmergencyRecoveryOpen] = useState(false);
  const [versionHistoryEmbedUuid, setVersionHistoryEmbedUuid] = useState(null);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [versionHistoryUuid, setVersionHistoryUuid] = useState(null);

  // Storage usage state
  const [storageUsage, setStorageUsage] = useState(null);
  const [storageUsageLoading, setStorageUsageLoading] = useState(true);
  const [storageUsageError, setStorageUsageError] = useState(null);

  // Convert excerptsError to string for display
  const error = excerptsError ? String(excerptsError.message || 'Unknown error') : null;

  // Auto-discover categories from excerpts (when new ones added via import)
  useEffect(() => {
    if (!excerpts.length) return;

    const categoriesFromExcerpts = [...new Set(excerpts.map(e => e.category || 'General'))];
    const newCategories = categoriesFromExcerpts.filter(cat => !categories.includes(cat));

    if (newCategories.length > 0) {
      console.log('[REACT-QUERY-ADMIN] Auto-discovered new categories:', newCategories);
      const updated = [...categories, ...newCategories];
      saveCategoriesMutation.mutate(updated);
    }
  }, [excerpts]); // Only run when excerpts change

  // Auto-verify usage data on mount if needed
  useEffect(() => {
    const checkAndAutoVerify = async () => {
      try {
        // Get last verification timestamp from backend
        const result = await invoke('getLastVerificationTime');

        if (result.success && result.lastVerificationTime) {
          setLastVerificationTime(result.lastVerificationTime);

          // Check if verification is stale (older than 24 hours)
          const lastVerified = new Date(result.lastVerificationTime);
          const now = new Date();
          const hoursSinceVerification = (now - lastVerified) / (1000 * 60 * 60);

          console.log(`[AUTO-VERIFY] Last verification: ${hoursSinceVerification.toFixed(1)} hours ago`);

          // Auto-verify if older than 24 hours
          if (hoursSinceVerification > 24) {
            console.log('[AUTO-VERIFY] Data is stale, running Check All Includes automatically...');
            setIsAutoVerifying(true);
            await handleCheckAllIncludes();
            setIsAutoVerifying(false);
          } else {
            console.log('[AUTO-VERIFY] Data is fresh, skipping auto-verification');
          }
        } else {
          // No previous verification, run it now
          console.log('[AUTO-VERIFY] No previous verification found, running Check All Includes...');
          setIsAutoVerifying(true);
          await handleCheckAllIncludes();
          setIsAutoVerifying(false);
        }
      } catch (error) {
        console.error('[AUTO-VERIFY] Error during auto-verification:', error);
        setIsAutoVerifying(false);
      }
    };

    checkAndAutoVerify();
  }, []); // Only run once on mount

  // Fetch storage usage on mount
  useEffect(() => {
    const fetchStorageUsage = async () => {
      try {
        setStorageUsageLoading(true);
        const result = await invoke('getStorageUsage');

        if (result.success) {
          setStorageUsage(result);
          setStorageUsageError(null);
        } else {
          setStorageUsageError(result.error || 'Failed to calculate storage usage');
        }
      } catch (error) {
        console.error('[ADMIN] Error fetching storage usage:', error);
        setStorageUsageError(error.message);
      } finally {
        setStorageUsageLoading(false);
      }
    };

    fetchStorageUsage();
  }, []); // Only run once on mount

  // Force scrollbars to always be visible (override OS behavior)
  useEffect(() => {
    // Create a style element to force scrollbars to always be visible
    const styleId = 'force-visible-scrollbars';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.textContent = `
        /* Force horizontal scrollbars to always be visible on webkit browsers */
        [data-scroll-container] {
          overflow-x: scroll !important;
          scrollbar-gutter: stable; /* Reserve space for scrollbar */
        }
        /* Style horizontal scrollbar - height property controls horizontal scrollbar size */
        [data-scroll-container]::-webkit-scrollbar {
          height: 12px; /* Controls horizontal scrollbar height */
          width: 12px; /* Controls vertical scrollbar width */
        }
        [data-scroll-container]::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
        }
        [data-scroll-container]::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.5);
        }
        [data-scroll-container]::-webkit-scrollbar-track {
          background-color: rgba(0, 0, 0, 0.1);
        }
      `;
      document.head.appendChild(styleElement);
    }

    return () => {
      // Cleanup: remove style element when component unmounts
      const element = document.getElementById(styleId);
      if (element) {
        element.remove();
      }
    };
  }, []);

  // Category management handlers (using React Query mutation)
  const handleDeleteCategory = (categoryName) => {
    // Check if any excerpts use this category
    const excerptsUsingCategory = excerpts.filter(e => (e.category || 'General') === categoryName);

    if (excerptsUsingCategory.length > 0) {
      const excerptNames = excerptsUsingCategory.map(e => e.name).join(', ');
      alert(`Cannot delete category "${categoryName}". Please reassign the following Blueprint Standards first: ${excerptNames}`);
      return;
    }

    if (confirm(`Are you sure you want to delete the category "${categoryName}"?`)) {
      const updated = categories.filter(c => c !== categoryName);
      saveCategoriesMutation.mutate(updated);
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
      const updated = categories.map(c => c === oldName ? trimmedName : c);
      saveCategoriesMutation.mutate(updated);

      // Note: In a full implementation, you'd also update all excerpts using this category
      alert(`Category renamed from "${oldName}" to "${trimmedName}". Note: Existing Blueprint Standards still use the old category name.`);
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

    const updated = [...categories, trimmedName];
    saveCategoriesMutation.mutate(updated);
    setNewCategoryName('');
    alert(`Category "${trimmedName}" added successfully`);
  };

  const handleMoveCategoryToPosition = (categoryName, targetPosition) => {
    console.log(`[ADMIN-PAGE] ======================================`);
    console.log(`[ADMIN-PAGE] handleMoveCategoryToPosition called`);
    console.log(`[ADMIN-PAGE] Category to move: "${categoryName}"`);
    console.log(`[ADMIN-PAGE] Target position (1-based): ${targetPosition}`);
    console.log(`[ADMIN-PAGE] Categories array BEFORE move:`, JSON.stringify(categories));

    const currentIndex = categories.indexOf(categoryName);
    console.log(`[ADMIN-PAGE] Current index (0-based): ${currentIndex}`);
    console.log(`[ADMIN-PAGE] Current position (1-based): ${currentIndex + 1}`);

    if (currentIndex === -1) {
      console.log(`[ADMIN-PAGE] ❌ ERROR: Category not found in array`);
      return; // Category not found
    }

    // Convert 1-based position to 0-based index
    const targetIndex = targetPosition - 1;
    console.log(`[ADMIN-PAGE] Target index (0-based): ${targetIndex}`);

    // Validate target index
    if (targetIndex < 0 || targetIndex >= categories.length || targetIndex === currentIndex) {
      console.log(`[ADMIN-PAGE] ❌ Invalid move - validation failed:`);
      console.log(`[ADMIN-PAGE]   - targetIndex < 0: ${targetIndex < 0}`);
      console.log(`[ADMIN-PAGE]   - targetIndex >= length: ${targetIndex >= categories.length}`);
      console.log(`[ADMIN-PAGE]   - targetIndex === currentIndex: ${targetIndex === currentIndex}`);
      return;
    }

    const newCategories = [...categories];
    console.log(`[ADMIN-PAGE] Created copy of categories array`);

    // Remove category from current position
    const [removed] = newCategories.splice(currentIndex, 1);
    console.log(`[ADMIN-PAGE] Removed "${removed}" from index ${currentIndex}`);
    console.log(`[ADMIN-PAGE] Array after removal:`, JSON.stringify(newCategories));

    // Insert at target position
    newCategories.splice(targetIndex, 0, removed);
    console.log(`[ADMIN-PAGE] Inserted "${removed}" at index ${targetIndex}`);
    console.log(`[ADMIN-PAGE] Categories array AFTER move:`, JSON.stringify(newCategories));

    console.log(`[ADMIN-PAGE] Saving new category order via mutation...`);
    saveCategoriesMutation.mutate(newCategories);
    console.log(`[ADMIN-PAGE] ======================================`);
  };

  const handleCheckAllSources = async () => {
    try {
      console.log('[REACT-QUERY-ADMIN] 🔍 Starting Check All Sources...');
      const result = await checkAllSourcesMutation.mutateAsync();

      setOrphanedSources(Array.isArray(result.orphanedSources) ? result.orphanedSources : []);

      // Build summary message
      let message = `✅ Check complete:\n`;
      message += `• ${result.activeCount} active Standard(s)\n`;
      message += `• ${result.orphanedSources.length} orphaned Standard(s)`;

      if (result.contentConversionsCount > 0) {
        message += `\n\n🔄 Format conversion:\n`;
        message += `• ${result.contentConversionsCount} Standard(s) converted from Storage Format to ADF JSON`;
      }

      if (result.staleEntriesRemoved > 0) {
        message += `\n\n🧹 Cleanup complete:\n`;
        message += `• ${result.staleEntriesRemoved} stale Embed entry/entries removed`;
      } else if (result.contentConversionsCount === 0) {
        message += `\n\n✨ No stale Embed entries found`;
      }

      console.log(message);
      alert(message);
    } catch (err) {
      console.error('[REACT-QUERY-ADMIN] Check Sources error:', err);
      alert('Error checking sources: ' + err.message);
    }
  };

  const handleCreateTestPage = async () => {
    try {
      console.log('[REACT-QUERY-ADMIN] 🧪 Creating test page with 148 Embeds...');
      const result = await createTestPageMutation.mutateAsync({ pageId: '84803640' });

      const message = `✅ Test page created successfully!\n\n` +
        `• Page ID: ${result.pageId}\n` +
        `• Embed count: ${result.embedCount}\n` +
        `• Ready for performance testing`;

      console.log(message);
      alert(message);
    } catch (err) {
      console.error('[REACT-QUERY-ADMIN] Create Test Page error:', err);
      alert('Error creating test page: ' + err.message);
    }
  };

  const handleCheckFormat = async (excerptName) => {
    try {
      const result = await invoke('getOneExcerptData', { excerptName });
      alert(result.message || 'Check forge logs for output');
    } catch (err) {
      console.error('[REACT-QUERY-ADMIN] Check Format error:', err);
      alert('Error: ' + err.message);
    }
  };


  // Poll for progress updates
  useEffect(() => {
    if (!progressId || !checkAllIncludesMutation.isPending) return;

    const pollInterval = setInterval(async () => {
      try {
        const result = await invoke('getCheckProgress', { progressId });
        if (result.success && result.progress) {
          setIncludesProgress(result.progress);

          // Stop polling when complete
          if (result.progress.phase === 'complete') {
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('Error polling progress:', err);
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [progressId, checkAllIncludesMutation.isPending]);

  // Calculate ETA
  const calculateETA = (progress) => {
    if (!progress || !progress.startTime || progress.processed === 0) {
      return 'Calculating...';
    }

    const elapsed = Date.now() - progress.startTime;
    const rate = progress.processed / elapsed; // items per ms
    const remaining = progress.total - progress.processed;
    const eta = remaining / rate; // ms remaining

    const seconds = Math.ceil(eta / 1000);
    if (seconds < 60) {
      return `${seconds}s remaining`;
    } else {
      const minutes = Math.ceil(seconds / 60);
      return `${minutes}m remaining`;
    }
  };

  // Format timestamp for display
  const formatTimestamp = (isoString) => {
    if (!isoString) return 'Never';

    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Show relative time for recent timestamps
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Show absolute date for older timestamps
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Handle Check All Includes button click (Async Events API version)
  const handleCheckAllIncludes = async () => {
    // Show initial progress
    setIncludesProgress({
      phase: 'queuing',
      total: 0,
      processed: 0,
      percent: 0,
      status: 'Queuing job...'
    });

    let isComplete = false;
    let progressId = null;

    try {
      // Call async trigger - returns immediately with jobId + progressId
      // Always start in dry-run mode (preview) first
      console.log('[ADMIN] Starting async Check All Includes (dry-run mode)...');
      const triggerResult = await invoke('checkAllIncludes', { dryRun: true });

      if (!triggerResult.success) {
        throw new Error(triggerResult.error || 'Failed to start check');
      }

      progressId = triggerResult.progressId;
      const jobId = triggerResult.jobId;

      console.log(`[ADMIN] Job queued: jobId=${jobId}, progressId=${progressId}`);

      // Start polling for progress
      const pollForProgress = async () => {
        // Give worker a moment to start
        await new Promise(resolve => setTimeout(resolve, 1000));

        while (!isComplete) {
          try {
            const progressResult = await invoke('getCheckProgress', { progressId });
            if (progressResult.success && progressResult.progress) {
              const progress = progressResult.progress;
              setIncludesProgress(progress);
              console.log(`[ADMIN] Progress: ${progress.percent}% - ${progress.status}`);

              // Check if complete
              if (progress.phase === 'complete') {
                isComplete = true;
                break;
              }

              // Check if error
              if (progress.phase === 'error') {
                throw new Error(progress.error || 'Check failed');
              }
            }
          } catch (err) {
            console.error('[ADMIN] Polling error:', err);
            // Continue polling unless complete
          }

          // Poll every 500ms
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      };

      // Start polling
      await pollForProgress();

      // Fetch final results from progress data
      const finalProgressResult = await invoke('getCheckProgress', { progressId });
      if (!finalProgressResult.success || !finalProgressResult.progress.results) {
        throw new Error('Failed to retrieve final results');
      }

      const results = finalProgressResult.progress.results;
      const summary = results.summary;

      console.log('[ADMIN] Check complete:', summary);

      // Store results for potential CSV download
      setIncludesCheckResult(results);

      // Results will be displayed in the progress UI component
      // No alert needed - keep progress state with complete phase

      // Offer to download CSV
      if (results.activeIncludes && results.activeIncludes.length > 0) {
        if (confirm(`\nWould you like to download a CSV report of all ${summary.activeCount} Embed instances?`)) {
          const csv = generateIncludesCSV(results.activeIncludes);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', `blueprint-standard-embeds-report-${new Date().toISOString().split('T')[0]}.csv`);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }

      // Update last verification timestamp
      const now = new Date().toISOString();
      await invoke('setLastVerificationTime', { timestamp: now });
      setLastVerificationTime(now);
      console.log('[ADMIN] Verification timestamp updated:', now);

      // Keep progress visible in dry-run mode so user can see results and clean up button
      // Only clear in live mode after a delay
      if (!finalProgressResult.progress.dryRun) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIncludesProgress(null);
      }

    } catch (err) {
      console.error('[ADMIN] Error checking includes:', err);
      alert('Error checking includes: ' + err.message);
      isComplete = true; // Stop polling on error
      setIncludesProgress(null);
    } finally {
      isComplete = true; // Ensure polling stops
      setProgressId(null);
    }
  };

  // Handle Clean Up Now button (live mode - actually deletes orphaned data)
  const handleCleanUpNow = async () => {
    // Confirm before running cleanup
    if (!confirm('⚠️ This will permanently move orphaned Embed configurations to the deleted namespace (recoverable for 90 days).\n\nContinue with cleanup?')) {
      return;
    }

    // Clear current progress and start fresh
    setIncludesProgress({
      phase: 'queuing',
      total: 0,
      processed: 0,
      percent: 0,
      status: 'Queuing cleanup job...'
    });

    let isComplete = false;
    let progressId = null;

    try {
      // Call async trigger with dryRun: false (LIVE MODE)
      console.log('[ADMIN] Starting async Check All Includes (LIVE mode - cleanup enabled)...');
      const triggerResult = await invoke('checkAllIncludes', { dryRun: false });

      if (!triggerResult.success) {
        throw new Error(triggerResult.error || 'Failed to start cleanup');
      }

      progressId = triggerResult.progressId;
      const jobId = triggerResult.jobId;

      console.log(`[ADMIN] Cleanup job queued: jobId=${jobId}, progressId=${progressId}`);

      // Start polling for progress
      const pollForProgress = async () => {
        // Give worker a moment to start
        await new Promise(resolve => setTimeout(resolve, 1000));

        while (!isComplete) {
          try {
            const progressResult = await invoke('getCheckProgress', { progressId });
            if (progressResult.success && progressResult.progress) {
              const progress = progressResult.progress;
              setIncludesProgress(progress);
              console.log(`[ADMIN] Cleanup Progress: ${progress.percent}% - ${progress.status}`);

              // Check if complete
              if (progress.phase === 'complete') {
                isComplete = true;
                break;
              }

              // Check if error
              if (progress.phase === 'error') {
                throw new Error(progress.error || 'Cleanup failed');
              }
            }
          } catch (err) {
            console.error('[ADMIN] Polling error:', err);
            // Continue polling unless complete
          }

          // Poll every 500ms
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      };

      // Start polling
      await pollForProgress();

      // Fetch final results from progress data
      const finalProgressResult = await invoke('getCheckProgress', { progressId });
      if (!finalProgressResult.success || !finalProgressResult.progress.results) {
        throw new Error('Failed to retrieve final cleanup results');
      }

      const results = finalProgressResult.progress.results;
      const summary = results.summary;

      console.log('[ADMIN] Cleanup complete:', summary);

      // Store results for potential CSV download
      setIncludesCheckResult(results);

      // Update last verification timestamp
      const now = new Date().toISOString();
      await invoke('setLastVerificationTime', { timestamp: now });
      setLastVerificationTime(now);
      console.log('[ADMIN] Verification timestamp updated:', now);

      // Invalidate React Query cache to refresh orphaned usage data
      console.log('[ADMIN] Invalidating excerpts cache to refresh orphaned data...');
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });

      // Show results for 2 seconds before clearing
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIncludesProgress(null);

    } catch (err) {
      console.error('[ADMIN] Error during cleanup:', err);
      alert('Error during cleanup: ' + err.message);
      isComplete = true; // Stop polling on error
      setIncludesProgress(null);
    } finally {
      isComplete = true; // Ensure polling stops
      setProgressId(null);
    }
  };

  // Handle Force Delete Orphaned References button (from orphaned Embed modal)
  const handleForceDeleteOrphanedRefs = async (orphanedItem) => {
    console.log('[ADMIN] Force delete requested for orphaned item:', orphanedItem);

    // Confirm before deletion
    if (!confirm(`⚠️ This will PERMANENTLY delete the orphaned usage key for "${orphanedItem.excerptName}" (${orphanedItem.referenceCount} reference(s)).\n\nThis action cannot be undone (unless you have CSV log backups).\n\nContinue?`)) {
      return;
    }

    setIsDeletingOrphanedRefs(true);

    try {
      // Extract and filter valid localIds from references
      const localIds = (orphanedItem.references || [])
        .map(ref => ref.localId)
        .filter(id => id !== undefined && id !== null && id !== '');

      console.log('[ADMIN] Extracted localIds:', localIds);
      console.log('[ADMIN] References array:', orphanedItem.references);

      // If no valid localIds, just delete the usage key directly
      if (localIds.length === 0) {
        console.log('[ADMIN] No valid localIds found - deleting usage key directly');
        const result = await invoke('deleteOrphanedUsageKey', { excerptId: orphanedItem.excerptId });

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete orphaned usage key');
        }

        console.log('[ADMIN] Successfully deleted orphaned usage key:', result.message);
      } else {
        // Call resolver to delete by localIds
        console.log('[ADMIN] Deleting orphaned references by localId:', localIds);
        const result = await invoke('deleteOrphanedUsageReferences', { localIds });

        if (!result.success) {
          throw new Error(result.error || 'Failed to delete orphaned references');
        }

        console.log('[ADMIN] Successfully deleted orphaned references:', result.summary);
      }

      // Invalidate React Query cache to refresh orphaned usage data
      console.log('[ADMIN] Invalidating excerpts cache to refresh orphaned data...');
      queryClient.invalidateQueries({ queryKey: ['excerpts', 'list'] });

      // Close modal
      setIsModalOpen(false);
      setSelectedExcerpt(null);

      // Show success message
      alert(`✅ Successfully deleted orphaned usage key for "${orphanedItem.excerptName}"`);

    } catch (err) {
      console.error('[ADMIN] Error force deleting orphaned references:', err);
      alert('❌ Error deleting orphaned references: ' + err.message);
    } finally {
      setIsDeletingOrphanedRefs(false);
    }
  };

  // Generate CSV for MultiExcerpt Includes scan results

  // Handle Scan MultiExcerpt Includes button click
  const handleScanMultiExcerptIncludes = async () => {
    setIsScanningMultiExcerpt(true);
    setMultiExcerptProgress({
      phase: 'starting',
      total: 0,
      processed: 0,
      percent: 0,
      status: 'Initializing scan...'
    });

    try {
      console.log('🔍 Starting MultiExcerpt Includes scan in cs space...');

      // Start the backend scan
      const result = await invoke('scanMultiExcerptIncludes');
      console.log('Scan result:', result);

      if (result.success) {
        console.log('Got progressId:', result.progressId);

        // Fetch final progress state
        if (result.progressId) {
          const progressResult = await invoke('getMultiExcerptScanProgress', { progressId: result.progressId });
          if (progressResult.success && progressResult.progress) {
            setMultiExcerptProgress(progressResult.progress);
            // Give user time to see 100% completion
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }

        setMultiExcerptScanResult(result);

        // Build summary message
        let message = `✅ Scan complete:\n`;
        message += `• Found ${result.summary.totalIncludes} MultiExcerpt Include(s)\n`;
        message += `• Across ${result.summary.totalPages} page(s) in 'cs' space`;

        console.log(message);
        alert(message);

        // Offer to download CSV
        if (result.includeData && result.includeData.length > 0) {
          if (confirm(`\nWould you like to download a CSV report of all ${result.summary.totalIncludes} MultiExcerpt Embed instances?`)) {
            const csv = generateMultiExcerptCSV(result.includeData);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `multiexcerpt-includes-scan-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        }
      } else {
        console.error('Scan failed:', result.error);
        alert('Scan failed: ' + result.error);
      }
    } catch (err) {
      console.error('Error scanning MultiExcerpt includes:', err);
      alert('Error scanning MultiExcerpt includes: ' + err.message);
    } finally {
      setIsScanningMultiExcerpt(false);
      setMultiExcerptProgressId(null);
      setMultiExcerptProgress(null);
    }
  };

  // Poll for MultiExcerpt scan progress updates
  useEffect(() => {
    if (!multiExcerptProgressId || !isScanningMultiExcerpt) return;

    const pollInterval = setInterval(async () => {
      try {
        const result = await invoke('getMultiExcerptScanProgress', { progressId: multiExcerptProgressId });
        if (result.success && result.progress) {
          setMultiExcerptProgress(result.progress);

          // Stop polling when complete
          if (result.progress.phase === 'complete') {
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('Error polling MultiExcerpt scan progress:', err);
      }
    }, 1000); // Poll every second

    return () => clearInterval(pollInterval);
  }, [multiExcerptProgressId, isScanningMultiExcerpt]);

  // Handle JSON paste for bulk import
  const [jsonTextInput, setJsonTextInput] = useState('');

  const handleJsonParse = () => {
    if (!jsonTextInput.trim()) {
      alert('Please paste JSON content first');
      return;
    }

    try {
      const json = JSON.parse(jsonTextInput);
      setImportJsonData(json);
      setImportResult(null);
      console.log('JSON loaded:', json.sourceCount, 'sources');
    } catch (error) {
      alert('Error parsing JSON: ' + error.message);
    }
  };

  // Handle bulk import
  const handleBulkImport = async () => {
    if (!importJsonData || !importJsonData.sources) {
      alert('Please upload a valid JSON file first');
      return;
    }

    if (!confirm(`Import ${importJsonData.sourceCount} MultiExcerpt Sources into Blueprint Standards?`)) {
      return;
    }

    setIsImporting(true);

    try {
      console.log('Starting bulk import...');

      const result = await invoke('bulkImportSources', {
        sources: importJsonData.sources
      });

      console.log('Import result:', result);

      if (result.success) {
        setImportResult(result);

        // Add "Migrated from MultiExcerpt" category if it doesn't exist
        const migrationCategory = 'Migrated from MultiExcerpt';
        if (!categories.includes(migrationCategory)) {
          const updatedCategories = [...categories, migrationCategory];
          await saveCategoriesMutation.mutateAsync({ categories: updatedCategories });
        }

        let message = `✅ Import complete!\n\n`;
        message += `• ${result.summary.imported} Source(s) imported successfully\n`;
        if (result.summary.errors > 0) {
          message += `• ${result.summary.errors} error(s) occurred\n`;
        }
        message += `\nAll imported Sources are in the "Migrated from MultiExcerpt" category.`;

        alert(message);

        // Reload excerpts to show newly imported ones
        const reloadResult = await invoke('getAllExcerpts');
        if (reloadResult.success) {
          const sanitized = (reloadResult.excerpts || []).map(excerpt => ({
            ...excerpt,
            variables: Array.isArray(excerpt.variables) ? excerpt.variables.filter(v => v && typeof v === 'object' && v.name) : [],
            toggles: Array.isArray(excerpt.toggles) ? excerpt.toggles.filter(t => t && typeof t === 'object' && t.name) : [],
            category: String(excerpt.category || 'General'),
            updatedAt: excerpt.updatedAt ? String(excerpt.updatedAt) : null
          }));
          setExcerpts(sanitized);
        }

      } else {
        alert('Import failed: ' + result.error);
      }

    } catch (error) {
      console.error('Error importing sources:', error);
      alert('Import error: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  // Handle creating Source macros on page
  const handleCreateSourceMacros = async () => {
    const pageId = '80150529'; // Migrated Content page
    const category = 'Migrated from MultiExcerpt';

    // Count excerpts in this category
    const migrated = excerpts.filter(e => e.category === category);

    if (migrated.length === 0) {
      alert('No excerpts found in "Migrated from MultiExcerpt" category');
      return;
    }

    const confirmed = confirm(
      `Create ${migrated.length} Blueprint Standard - Source macros on the "Migrated Content" page?\n\n` +
      `This will:\n` +
      `• Add each Source as a bodied macro with heading\n` +
      `• Organize them alphabetically\n` +
      `• Link macros to storage entries\n\n` +
      `This cannot be easily undone. Continue?`
    );

    if (!confirmed) return;

    setIsCreatingMacros(true);
    setMacroCreationResult(null);

    try {
      console.log(`Creating ${migrated.length} Source macros on page ${pageId}...`);

      const result = await invoke('createSourceMacrosOnPage', {
        pageId,
        category
      });

      console.log('Macro creation result:', result);

      if (result.success) {
        setMacroCreationResult(result);

        let message = `✅ Source macros created successfully!\n\n`;
        message += `• ${result.summary.created} Source macro(s) created\n`;
        if (result.summary.skipped > 0) {
          message += `• ${result.summary.skipped} macro(s) skipped (malformed XML)\n`;
        }
        message += `• Page ID: ${result.summary.pageId}\n`;
        message += `• Page version: ${result.summary.pageVersion}\n\n`;
        message += `View the page to see all Sources organized with headings.`;

        if (result.skippedMacros && result.skippedMacros.length > 0) {
          message += `\n\nSkipped excerpts:\n`;
          result.skippedMacros.forEach(s => {
            message += `  • ${s.name} (${s.reason})\n`;
          });
        }

        alert(message);

      } else {
        alert('Failed to create macros: ' + result.error);
      }

    } catch (error) {
      console.error('Error creating Source macros:', error);
      alert('Error: ' + error.message);
    } finally {
      setIsCreatingMacros(false);
    }
  };

  // Lazy load usage data for a specific excerpt
  // NOTE: loadUsageForExcerpt is now handled by useExcerptUsageQuery hook
  // Each component that needs usage data calls the hook with the excerptId
  // The hook only fetches when enabled=true, providing lazy loading

  const handleDelete = async (excerptId) => {
    if (!confirm('Delete this source? This cannot be undone.')) {
      return;
    }

    try {
      await deleteExcerptMutation.mutateAsync(excerptId);
      // React Query automatically refetches excerpts list after successful deletion
      alert('Excerpt deleted successfully');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <Fragment>
        <Text>v{APP_VERSION}</Text>
        <Text>Loading...</Text>
      </Fragment>
    );
  }

  if (error) {
    return (
      <Fragment>
        <Text>Blueprint Standards Admin v{APP_VERSION}</Text>
        <Text>Error: {error}</Text>
      </Fragment>
    );
  }

  // Filter and sort excerpts using utility functions
  const filteredExcerpts = filterExcerpts(excerpts, searchTerm, categoryFilter);
  const sortedExcerpts = sortExcerpts(filteredExcerpts, sortBy, usageCounts);

  return (
    <Fragment>
      {/* Top Toolbar - Action Buttons */}
      <Box xcss={xcss({ marginBlockEnd: 'space.100' })}>
        <AdminToolbar
          onOpenMigrationModal={() => setIsMigrationModalOpen(true)}
          showMigrationTools={SHOW_MIGRATION_TOOLS}
          onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
          onCheckAllSources={handleCheckAllSources}
          isCheckingAllSources={checkAllSourcesMutation.isPending}
          onCheckAllIncludes={handleCheckAllIncludes}
          isCheckingIncludes={includesProgress !== null}
          onOpenEmergencyRecovery={() => setIsEmergencyRecoveryOpen(true)}
          lastVerificationTime={lastVerificationTime}
          formatTimestamp={formatTimestamp}
          onCreateTestPage={handleCreateTestPage}
          isCreatingTestPage={createTestPageMutation.isPending}
        />
      </Box>

      {/* Progress Bar for Check All Includes */}
      <CheckAllProgressBar
        includesProgress={includesProgress}
        onCleanUpNow={handleCleanUpNow}
        calculateETA={calculateETA}
      />

      {/* Progress Bar for MultiExcerpt Scan (hidden via feature flag) */}
      {SHOW_MIGRATION_TOOLS && isScanningMultiExcerpt && (
        <Box xcss={sectionMarginStyles}>
          <SectionMessage appearance="information">
            <Stack space="space.200">
              <Text><Strong>Scanning for MultiExcerpt Embeds...</Strong></Text>
              <Text><Em>⚠️ Please stay on this page until the scan completes. Navigating away will cancel the operation.</Em></Text>
              {multiExcerptProgress ? (
                <Fragment>
                  <Text>{multiExcerptProgress.status || 'Processing...'}</Text>
                  <ProgressBar value={multiExcerptProgress.percent / 100} />
                  <Inline space="space.200" alignBlock="center">
                    <Text><Strong>{multiExcerptProgress.percent}%</Strong></Text>
                    {multiExcerptProgress.total > 0 && (
                      <Fragment>
                        <Text>|</Text>
                        <Text>{multiExcerptProgress.processed} / {multiExcerptProgress.total} pages scanned</Text>
                      </Fragment>
                    )}
                    {multiExcerptProgress.processed > 0 && (
                      <Fragment>
                        <Text>|</Text>
                        <Text><Em>{calculateETA(multiExcerptProgress)}</Em></Text>
                      </Fragment>
                    )}
                  </Inline>
                </Fragment>
              ) : (
                <Fragment>
                  <Text>Starting scan...</Text>
                  <ProgressBar />
                </Fragment>
              )}
            </Stack>
          </SectionMessage>
        </Box>
      )}

      {/* Warning messages */}
      {(orphanedUsage.length > 0 || orphanedSources.length > 0) && (
        <Box xcss={sectionMarginStyles}>
          <SectionMessage appearance="warning">
            {orphanedSources.length > 0 && (
              <Text><Strong>⚠ {orphanedSources.length} Orphaned Source(s)</Strong></Text>
            )}
            {orphanedUsage.length > 0 && (
              <Text><Strong>⚠ {orphanedUsage.length} Orphaned Embed(s)</Strong></Text>
            )}
            <Text>Scroll down to see orphaned items and remediation options.</Text>
          </SectionMessage>
        </Box>
      )}

      {/* Tabbed Navigation - Sources and Redline Queue */}
      <Tabs 
        space="space.200"
        id="admin-tabs"
        onChange={(index) => {
          setSelectedTab(index);
          // Clear selections when switching tabs
          setSelectedExcerpt(null);
          setSelectedExcerptForDetails(null);
        }}
        selected={selectedTab}
      >
        <TabList space="space.100">
          <Tab>📦 Sources</Tab>
          <Tab>🧑🏻‍🏫 Redlines</Tab>
          <Tab>💾 Storage</Tab>
        </TabList>

        <TabPanel>
          {/* Main Content Area - Split into sidebar and main */}
          <Box xcss={xcss({ width: '100%', maxWidth: '100%', overflow: 'hidden' })}>
            <Box xcss={tabPanelContentStyles}>
              <Inline space="space.200" alignBlock="start" shouldWrap={false} xcss={xcss({ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' })}>
        {/* Left Sidebar - Excerpt List */}
        <ExcerptListSidebar
          sortedExcerpts={sortedExcerpts}
          totalExcerptCount={excerpts.length}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          categories={categories}
          selectedExcerptForDetails={selectedExcerptForDetails}
          setSelectedExcerptForDetails={setSelectedExcerptForDetails}
          xcss={leftSidebarStyles}
          selectStyles={selectStyles}
          scrollableListStyle={scrollableListStyle}
        />

        {/* Middle Section - Excerpt Details with Inline Editing */}
        <Box xcss={middleSectionStyles}>
          {(() => {
            if (!selectedExcerptForDetails) {
              return (
                <Box>
                  <Text><Em>Select a Blueprint Standard from the list to view its usage details</Em></Text>
                </Box>
              );
            }

            try {
              const usage = selectedExcerptUsage || [];

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

              // Status column
              headerCells.push({ 
                key: 'status', 
                content: (
                  <Box xcss={tableCellSeparatorStyle}>
                    <Text>Staleness Status</Text>
                  </Box>
                ), 
                isSortable: true 
              });

              if (hasToggles) {
                selectedExcerptForDetails.toggles.forEach(toggle => {
                  headerCells.push({
                    key: `toggle-${toggle.name}`,
                    content: (
                      <Box xcss={tableCellSeparatorStyle}>
                        <Text>{toggle.name}</Text>
                      </Box>
                    ),
                    isSortable: true
                  });
                });
              }

              if (hasVariables) {
                selectedExcerptForDetails.variables.forEach(variable => {
                  headerCells.push({
                    key: `var-${variable.name}`,
                    content: (
                      <Box xcss={tableCellSeparatorStyle}>
                        <Text>{variable.name}</Text>
                      </Box>
                    ),
                    isSortable: true
                  });
                });
              }

              // Actions column
              headerCells.push({ 
                key: 'actions', 
                content: (
                  <Box xcss={tableCellSeparatorStyle}>
                    <Text>Actions</Text>
                  </Box>
                ), 
                isSortable: false 
              });

              // Calculate usage count and staleness
              const usageCount = uniqueUsage.length;
              const excerptLastModified = new Date(selectedExcerptForDetails.updatedAt || 0);
              const hasAnyStaleInstances = uniqueUsage.some(ref => {
                const includeLastSynced = ref.lastSynced ? new Date(ref.lastSynced) : new Date(0);
                return excerptLastModified > includeLastSynced;
              });

              return (
                <Stack space="space.300" xcss={xcss({ width: '100%', maxWidth: '100%', minWidth: 0 })}>
                  {/* Excerpt Header */}
                  <Box>
                    <Inline space="space.100" alignBlock="center" spread="space-between">
                      <Inline space="space.100" alignBlock="center">
                        <Heading size="small">Source excerpt: {selectedExcerptForDetails.name}</Heading>
                        <Lozenge>{selectedExcerptForDetails.category || 'General'}</Lozenge>
                      </Inline>
                      <Inline space="space.100" alignBlock="center">
                        <Button
                          appearance="subtle"
                          onClick={() => setShowPreviewModal(selectedExcerptForDetails.id)}
                        >
                          Preview Content
                        </Button>
                        {/* Hidden but wired up for future use */}
                        {/* <Button
                          appearance="subtle"
                          onClick={() => handleCheckFormat(selectedExcerptForDetails.name)}
                        >
                          🔍 Check Format (Logs)
                        </Button> */}
                        <Button
                          appearance="default"
                          onClick={async () => {
                            try {
                              let url = `/wiki/pages/viewpage.action?pageId=${selectedExcerptForDetails.sourcePageId}`;
                              // Use Confluence's built-in anchor for bodied macros (format: #id-{localId})
                              if (selectedExcerptForDetails.sourceLocalId) {
                                url += `#id-${selectedExcerptForDetails.sourceLocalId}`;
                              }

                              // Use open() to open in new tab
                              await router.open(url);
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
                          appearance="default"
                          onClick={async () => {
                            try {
                              // Fetch full usage data with customInsertions and renderedContent
                              const result = await invoke('getExcerptUsageForCSV', { 
                                excerptId: selectedExcerptForDetails.id 
                              });

                              if (!result || !result.success || !result.usage || result.usage.length === 0) {
                                alert('No usage data to export');
                                return;
                              }

                              // Use the same CSV export function as "Check All Embeds"
                              const csv = generateIncludesCSV(result.usage);
                              if (!csv) {
                                alert('No data to export');
                                return;
                              }

                              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                              const link = document.createElement('a');
                              const url = URL.createObjectURL(blob);
                              link.setAttribute('href', url);
                              const excerptName = (selectedExcerptForDetails.name || 'source').replace(/[^a-z0-9]/gi, '-').toLowerCase();
                              link.setAttribute('download', `blueprint-standard-${excerptName}-usage-${new Date().toISOString().split('T')[0]}.csv`);
                              link.style.visibility = 'hidden';
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(url);
                            } catch (err) {
                              console.error('Error exporting CSV:', err);
                              alert('Error exporting CSV: ' + err.message);
                            }
                          }}
                          iconBefore={() => <Icon glyph="download" label="Export" />}
                        >
                          Export to CSV
                        </Button>
                        <Button
                          appearance="danger"
                          onClick={async () => {
                            const excerptName = selectedExcerptForDetails.name;
                            const sourcePageId = selectedExcerptForDetails.sourcePageId;

                            const confirmMessage = `Are you sure you want to PERMANENTLY DELETE the Blueprint Standard "${excerptName}" from the library?\n\nNote: This only removes the Blueprint Standard from this library. The CONTENT assigned to this Blueprint Standard is still stored as text content within the Source macro on its source page.`;

                            if (confirm(confirmMessage)) {
                              try {
                                const result = await invoke('deleteExcerpt', { excerptId: selectedExcerptForDetails.id });
                                if (result.success) {
                                  // Remove from local state
                                  setExcerpts(excerpts.filter(e => e.id !== selectedExcerptForDetails.id));
                                  setSelectedExcerptForDetails(null);

                                  // Show success message with link to source page
                                  const viewSource = confirm(`Blueprint Standard "${excerptName}" has been permanently deleted from the library.\n\nWould you like to view the source page where the content is still stored?`);
                                  if (viewSource) {
                                    await router.navigate(`/wiki/pages/viewpage.action?pageId=${sourcePageId}`);
                                  }
                                } else {
                                  alert('Failed to delete Blueprint Standard: ' + result.error);
                                }
                              } catch (err) {
                                console.error('Delete error:', err);
                                alert('Error deleting Blueprint Standard: ' + err.message);
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
                                alert(`Successfully force updated ${result.updated} of ${result.total} instance(s)`);
                                // Refresh usage data
                                const refreshedUsage = await invoke('getExcerptUsage', { excerptId: selectedExcerptForDetails.id });
                                if (refreshedUsage.success) {
                                  setUsageData({ [selectedExcerptForDetails.id]: refreshedUsage.usage || [] });
                                }
                              } else {
                                alert(`Failed to force updates: ${result.error}`);
                              }
                            } catch (err) {
                              console.error('Error force updating to all:', err);
                              alert('Error force updating to all pages');
                            }
                          }}
                        >
                          Force Update to All Pages
                        </Button>
                      </Inline>
                    </Inline>
                  </Box>

                  {/* Helper Text */}
                  <SectionMessage appearance="information">
                    <Stack space="space.100">
                      <Text>
                        The <Strong>{selectedExcerptForDetails.name}</Strong> Source excerpt is referenced using the Blueprint Standard - Embed macro on <Strong>{uniqueUsage.length}</Strong> {uniqueUsage.length === 1 ? 'page' : 'pages'}, with the following variables and/or toggles set within those pages.
                      </Text>
                      <Text>
                        The Status column shows whether each Embed instance is up to date with the latest Source content. Use <Strong>Force Update</Strong> to update specific pages, or <Strong>Force Update to All Pages</Strong> to update all instances at once.
                      </Text>
                      <Text>
                        To edit variable values or toggle settings, navigate to the page by clicking its name and edit the Embed macro directly.
                      </Text>
                    </Stack>
                  </SectionMessage>

                  {/* Usage Table */}
                  {uniqueUsage.length === 0 ? (
                    <Text><Em>This Source excerpt is not used on any pages yet</Em></Text>
                  ) : (
                    <Box
                      xcss={tableScrollContainerStyle}
                      data-scroll-container
                      style={{
                        // Force scrollbars to always be visible (override OS behavior)
                        scrollbarWidth: 'thin', // Firefox - always show thin scrollbar
                      }}
                    >
                      <Box xcss={xcss({ width: '100%' })}>
                        <DynamicTable
                          head={{ cells: headerCells }}
                          rows={uniqueUsage.map((ref) => {
                        // Calculate status first (needed for ordering)
                        const excerptLastModified = new Date(selectedExcerptForDetails.updatedAt || 0);
                        const includeLastSynced = ref.lastSynced ? new Date(ref.lastSynced) : new Date(0);
                        const isStale = excerptLastModified > includeLastSynced;

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
                          },
                          // Status cell (second column)
                          {
                            key: 'status',
                            content: (
                              <Box xcss={tableCellSeparatorStyle}>
                                <StalenessBadge
                                  isStale={isStale}
                                  sourceLastModified={excerptLastModified}
                                  embedLastSynced={includeLastSynced}
                                />
                              </Box>
                            )
                          }
                        ];

                        // Add toggle cells (third column group)
                        if (hasToggles) {
                          selectedExcerptForDetails.toggles.forEach(toggle => {
                            const toggleState = ref.toggleStates?.[toggle.name] || false;
                            rowCells.push({
                              key: `toggle-${toggle.name}`,
                              content: (
                                <Box xcss={tableCellSeparatorStyle}>
                                  {toggleState ? (
                                    <Icon glyph="check-circle" label="Enabled" color="color.icon.success" />
                                  ) : (
                                    <Icon glyph="cross-circle" label="Disabled" color="color.icon.danger" />
                                  )}
                                </Box>
                              )
                            });
                          });
                        }

                        // Add variable cells (fourth column group)
                        if (hasVariables) {
                          selectedExcerptForDetails.variables.forEach(variable => {
                            const value = ref.variableValues?.[variable.name] || '';
                            const maxLength = 50;
                            const isTruncated = value.length > maxLength;
                            const displayValue = isTruncated ? value.substring(0, maxLength) + '...' : value;

                            rowCells.push({
                              key: `var-${variable.name}`,
                              content: (
                                <Box xcss={tableCellSeparatorStyle}>
                                  {value ? (
                                    isTruncated ? (
                                      <Tooltip content={value}>
                                        <Text>{displayValue}</Text>
                                      </Tooltip>
                                    ) : (
                                      <Text>{displayValue}</Text>
                                    )
                                  ) : (
                                    <Text><Em>(empty)</Em></Text>
                                  )}
                                </Box>
                              )
                            });
                          });
                        }

                        // Add actions cell with Copy UUID and Force Update buttons
                        rowCells.push({
                          key: 'actions',
                          content: (
                            <Box xcss={tableCellSeparatorStyle}>
                              <Inline space="space.100" alignBlock="center">
                              <Button
                                appearance="default"
                                spacing="compact"
                                onClick={() => {
                                  setVersionHistoryUuid(ref.localId);
                                  setIsVersionHistoryOpen(true);
                                }}
                              >
                                Recovery Options
                              </Button>
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
                                      alert(`Successfully force updated ${result.updated} instance(s) on this page`);
                                      // Refresh usage data
                                      const refreshedUsage = await invoke('getExcerptUsage', { excerptId: selectedExcerptForDetails.id });
                                      if (refreshedUsage.success) {
                                        setUsageData(prev => ({
                                          ...prev,
                                          [selectedExcerptForDetails.id]: refreshedUsage.usage || []
                                        }));
                                      }
                                    } else {
                                      alert(`Failed to force update: ${result.error}`);
                                    }
                                  } catch (err) {
                                    console.error('Error force updating:', err);
                                    alert('Error force updating');
                                  }
                                }}
                              >
                                Force Update
                              </Button>
                              </Inline>
                            </Box>
                            )
                          });

                        return {
                          key: ref.localId,
                          cells: rowCells
                        };
                      })}
                      />
                      </Box>
                    </Box>
                  )}
                </Stack>
              );
            } catch (error) {
              console.error('Error rendering middle section:', error);
              return (
                <Box>
                  <Text><Strong>Error loading Blueprint Standard details</Strong></Text>
                  <Text>{error.message}</Text>
                </Box>
              );
            }
          })()}
        </Box>

          </Inline>
          </Box>
          </Box>
        </TabPanel>

        <TabPanel>
          <Box xcss={tabPanelContentStyles}>
            <RedlineQueuePage />
          </Box>
        </TabPanel>

        <TabPanel>
          <Box xcss={tabPanelContentStyles}>
            <StorageBrowser />
          </Box>
        </TabPanel>
      </Tabs>

      {/* Orphaned items sections */}
      {sortedExcerpts.length > 0 && (
        <OrphanedItemsSection
          orphanedSources={orphanedSources}
          orphanedUsage={orphanedUsage}
          onSelectOrphanedItem={(item) => {
            setSelectedExcerpt(item);
            setIsModalOpen(true);
          }}
          cardStyles={cardStyles}
        />
      )}

      <ModalTransition>
        {isModalOpen && selectedExcerpt && (
          <Modal onClose={() => setIsModalOpen(false)} width="x-large">
            {/* Check type: orphaned Source, orphaned Include, or regular excerpt */}
            {selectedExcerpt.orphanedReason ? (
              // Orphaned Source
              <Fragment>
                <ModalHeader>
                  <Inline space="space.100" alignBlock="center">
                    <ModalTitle>{selectedExcerpt.name}</ModalTitle>
                    <Lozenge appearance="removed" isBold>ORPHANED SOURCE</Lozenge>
                  </Inline>
                </ModalHeader>

                <ModalBody>
                  <Tabs>
                    <TabList>
                      <Tab>Details</Tab>
                      <Tab>Preview</Tab>
                    </TabList>

                    <TabPanel>
                      <Stack space="space.200">
                        <SectionMessage appearance="warning">
                          <Text>This Source has been deleted from its page or hasn't checked in recently.</Text>
                          <Text><Strong>Reason:</Strong> {selectedExcerpt.orphanedReason}</Text>
                        </SectionMessage>

                        <Text>Category: {selectedExcerpt.category}</Text>
                        <Text>Variables: {selectedExcerpt.variables?.length || 0}</Text>
                        <Text>Toggles: {selectedExcerpt.toggles?.length || 0}</Text>

                        <Text><Strong>What happened?</Strong></Text>
                        <Text>The Source macro was likely deleted from the page where it was defined.</Text>

                        <Text><Strong>Options:</Strong></Text>
                        <Text>  1. View Page History to see when it was deleted and restore it manually</Text>
                        <Text>  2. Delete this orphaned Source from storage to clean up</Text>
                      </Stack>
                    </TabPanel>

                    <TabPanel>
                      <Stack space="space.200">
                        <Text><Strong>Stored Macro Content:</Strong></Text>
                        {selectedExcerpt.content && typeof selectedExcerpt.content === 'object' ? (
                          <AdfRenderer document={selectedExcerpt.content} />
                        ) : (
                          <Text>{selectedExcerpt.content || 'No content stored'}</Text>
                        )}
                      </Stack>
                    </TabPanel>
                  </Tabs>
                </ModalBody>

                <ModalFooter>
                  <Inline space="space.100">
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
                  </Inline>
                </ModalFooter>
              </Fragment>
            ) : selectedExcerpt.referenceCount !== undefined ? (
              // Orphaned Embed
              <Fragment>
                <ModalHeader>
                  <Inline space="space.100" alignBlock="center">
                    <ModalTitle>{selectedExcerpt.excerptName}</ModalTitle>
                    <Lozenge appearance="removed" isBold>ORPHANED EMBED</Lozenge>
                  </Inline>
                </ModalHeader>

                <ModalBody>
                  <Stack space="space.200">
                    <SectionMessage appearance="warning">
                      <Text>This Source has been deleted, but {selectedExcerpt.referenceCount} Embed macro(s) still reference it.</Text>
                    </SectionMessage>

                    <Text><Strong>Affected Pages:</Strong></Text>
                    {selectedExcerpt.references.map((ref, idx) => (
                      <Text key={idx}>  - {String(ref.pageTitle || 'Unknown Page')}</Text>
                    ))}

                    <Text><Strong>Options:</Strong></Text>
                    <Text>  1. Recreate the Source with the same name</Text>
                    <Text>  2. Update the Embed macros to reference a different Source</Text>
                    <Text>  3. Remove the Embed macros from the affected pages</Text>
                    <Text>  4. Force delete these stale references if they're already deleted</Text>
                  </Stack>
                </ModalBody>

                <ModalFooter>
                  <Inline space="space.100">
                    <Button
                      appearance="danger"
                      onClick={() => handleForceDeleteOrphanedRefs(selectedExcerpt)}
                      isDisabled={isDeletingOrphanedRefs}
                    >
                      {isDeletingOrphanedRefs ? 'Deleting...' : 'Force Delete Orphaned References'}
                    </Button>
                  </Inline>
                </ModalFooter>
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
                        const usage = selectedExcerptUsage || [];
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
                              <Box 
                                xcss={tableScrollContainerStyle}
                                data-scroll-container
                                style={{
                                  // Force scrollbars to always be visible (override OS behavior)
                                  scrollbarWidth: 'thin', // Firefox - always show thin scrollbar
                                }}
                              >
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

                                    rowCells.push({
                                      key: 'status',
                                      content: (
                                        <StalenessBadge
                                          isStale={isStale}
                                          sourceLastModified={excerptLastModified}
                                          embedLastSynced={includeLastSynced}
                                        />
                                      )
                                    });

                                    // Add Actions cell with Recovery Options and Force Update buttons
                                    rowCells.push({
                                      key: 'actions',
                                      content: (
                                        <Inline space="space.100" alignBlock="center">
                                          <Button
                                            appearance="default"
                                            spacing="compact"
                                            onClick={() => {
                                              setVersionHistoryUuid(ref.localId);
                                              setIsVersionHistoryOpen(true);
                                            }}
                                          >
                                            Recovery Options
                                          </Button>
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
                                                  alert(`Successfully force updated ${result.updated} instance(s) on this page`);
                                                  // Refresh usage data
                                                  const refreshedUsage = await invoke('getExcerptUsage', { excerptId: selectedExcerpt.id });
                                                  if (refreshedUsage.success) {
                                                    setUsageData({ [selectedExcerpt.id]: refreshedUsage.usage || [] });
                                                  }
                                                } else {
                                                  alert(`Failed to force update: ${result.error}`);
                                                }
                                              } catch (err) {
                                                console.error('Error force updating:', err);
                                                alert('Error force updating');
                                              }
                                            }}
                                          >
                                            Force Update
                                          </Button>
                                        </Inline>
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
      <CategoryManager
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        excerpts={excerpts}
        saveCategoriesMutation={saveCategoriesMutation}
        newCategoryName={newCategoryName}
        setNewCategoryName={setNewCategoryName}
        onAddCategory={handleAddCategory}
        onDeleteCategory={handleDeleteCategory}
        onEditCategory={handleEditCategory}
        onMoveCategoryToPosition={handleMoveCategoryToPosition}
      />

      {/* Preview Content Modal */}
      <ExcerptPreviewModal
        showPreviewModal={showPreviewModal}
        setShowPreviewModal={setShowPreviewModal}
        excerpts={excerpts}
        previewBoxStyle={previewBoxStyle}
      />

      {/* Migration Tools Modal */}
      <MigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        defaultPageId="99909654"
      />

      {/* Emergency Recovery Modal (Phase 1 Safety Patch - v7.16.0) */}
      <EmergencyRecoveryModal
        isOpen={isEmergencyRecoveryOpen}
        onClose={() => {
          setIsEmergencyRecoveryOpen(false);
          setVersionHistoryEmbedUuid(null); // Reset UUID when closing
        }}
        initialTab={versionHistoryEmbedUuid ? 'version-history' : 'deleted-embeds'}
        autoLoadEmbedUuid={versionHistoryEmbedUuid}
      />

      {/* Version History Modal (Phase 4 - v7.18.8) */}
      <VersionHistoryModal
        isOpen={isVersionHistoryOpen}
        onClose={() => {
          setIsVersionHistoryOpen(false);
          setVersionHistoryUuid(null); // Reset UUID when closing
        }}
        embedUuid={versionHistoryUuid}
      />

      {/* Storage Usage Footer */}
      <StorageUsageFooter
        totalMB={storageUsage?.totalMB}
        limitMB={storageUsage?.limitMB}
        percentUsed={storageUsage?.percentUsed}
        sourcesCount={storageUsage?.sourcesCount}
        embedsCount={storageUsage?.embedsCount}
        isLoading={storageUsageLoading}
        error={storageUsageError}
      />
    </Fragment>
  );
};

ForgeReconciler.render(
  <QueryClientProvider client={queryClient}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);
