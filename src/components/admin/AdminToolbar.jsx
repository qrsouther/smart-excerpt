/**
 * AdminToolbar Component
 *
 * Top toolbar for the Admin page containing:
 * - Search textfield (filter by name)
 * - Category filter dropdown
 * - Sort dropdown (name, usage, category)
 * - Check All Sources button
 * - Check All Embeds button with last verification time
 * - Optional migration tools (hidden via feature flag)
 *
 * @param {Object} props
 * @param {string} props.searchTerm - Current search filter value
 * @param {Function} props.setSearchTerm - Callback to update search term
 * @param {string} props.categoryFilter - Current category filter ('All' or category name)
 * @param {Function} props.setCategoryFilter - Callback to update category filter
 * @param {string} props.sortBy - Current sort order (name-asc, name-desc, usage-high, etc.)
 * @param {Function} props.setSortBy - Callback to update sort order
 * @param {Array<string>} props.categories - List of available categories
 * @param {Function} props.onCheckAllSources - Handler for Check All Sources button
 * @param {boolean} props.isCheckingAllSources - Whether Check All Sources is running
 * @param {Function} props.onCheckAllIncludes - Handler for Check All Embeds button
 * @param {boolean} props.isCheckingIncludes - Whether Check All Embeds is running
 * @param {string|null} props.lastVerificationTime - ISO timestamp of last verification
 * @param {Function} props.formatTimestamp - Function to format timestamp for display
 * @param {Object} props.selectStyles - xcss styles for select dropdowns
 * @param {boolean} props.showMigrationTools - Feature flag for migration tools
 * @param {Function} props.onScanMultiExcerpt - Handler for Scan MultiExcerpt button (optional)
 * @param {boolean} props.isScanningMultiExcerpt - Whether MultiExcerpt scan is running (optional)
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Text,
  Box,
  Inline,
  Button,
  Textfield,
  Select,
  Tooltip,
  xcss
} from '@forge/react';

export function AdminToolbar({
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  sortBy,
  setSortBy,
  categories,
  onCheckAllSources,
  isCheckingAllSources,
  onCheckAllIncludes,
  isCheckingIncludes,
  lastVerificationTime,
  formatTimestamp,
  selectStyles,
  showMigrationTools = false,
  onScanMultiExcerpt,
  isScanningMultiExcerpt
}) {
  return (
    <Box xcss={xcss({ marginBlockEnd: 'space.300' })}>
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
          onClick={onCheckAllSources}
          isDisabled={isCheckingAllSources}
        >
          {isCheckingAllSources ? 'Checking...' : '🔍 Check All Sources'}
        </Button>

        <Box xcss={xcss({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'space.050' })}>
          <Tooltip content="Verifies all Embed macros: checks if they exist on their pages, references valid standards, and have up-to-date content. Automatically cleans up orphaned entries and generates a complete CSV-exportable report with usage data, variable values, and rendered content.">
            <Button
              appearance="primary"
              onClick={onCheckAllIncludes}
              isDisabled={isCheckingIncludes}
            >
              {isCheckingIncludes ? 'Checking...' : '🔍 Check All Embeds'}
            </Button>
          </Tooltip>
          {lastVerificationTime && (
            <Text size="small" color="color.text.subtlest">
              Last verified: {formatTimestamp(lastVerificationTime)}
            </Text>
          )}
        </Box>

        {showMigrationTools && onScanMultiExcerpt && (
          <Button
            appearance="primary"
            onClick={onScanMultiExcerpt}
            isDisabled={isScanningMultiExcerpt}
          >
            {isScanningMultiExcerpt ? 'Scanning...' : '📦 Scan MultiExcerpt Embeds'}
          </Button>
        )}
      </Inline>
    </Box>
  );
}
