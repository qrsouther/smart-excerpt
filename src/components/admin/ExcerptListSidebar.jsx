/**
 * ExcerptListSidebar Component
 *
 * Displays the left sidebar with a filterable, sortable list of Blueprint Standard Sources.
 * Handles excerpt selection for displaying usage details in the main panel.
 *
 * @param {Object} props
 * @param {Array} props.sortedExcerpts - Sorted and filtered array of excerpt objects
 * @param {string} props.searchTerm - Current search filter value
 * @param {string} props.categoryFilter - Current category filter value
 * @param {Object|null} props.selectedExcerptForDetails - Currently selected excerpt
 * @param {Function} props.setSelectedExcerptForDetails - Callback to update selected excerpt
 * @param {Object} props.xcss - xcss style object for the sidebar container
 * @returns {JSX.Element}
 */

import React, { Fragment } from 'react';
import {
  Text,
  Strong,
  Em,
  Box,
  Stack,
  Inline,
  Lozenge,
  Pressable,
  xcss
} from '@forge/react';

// Pressable item styling for excerpt list items
const excerptItemStyle = (isSelected) => xcss({
  padding: 'space.100',
  borderRadius: 'border.radius',
  backgroundColor: isSelected ? 'color.background.selected' : 'color.background.neutral.subtle',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'color.background.neutral.hovered'
  }
});

export function ExcerptListSidebar({
  sortedExcerpts,
  searchTerm,
  categoryFilter,
  selectedExcerptForDetails,
  setSelectedExcerptForDetails,
  xcss: containerStyle
}) {
  // Render empty state when no excerpts match filters
  if (sortedExcerpts.length === 0 && (searchTerm || categoryFilter !== 'All')) {
    return (
      <Box xcss={containerStyle}>
        <Text>No Blueprint Standards match your filters</Text>
      </Box>
    );
  }

  // Render empty state when no excerpts exist at all
  if (sortedExcerpts.length === 0) {
    return (
      <Box xcss={containerStyle}>
        <Fragment>
          <Text>No Blueprint Standard Sources found.</Text>
          <Text>Create a Blueprint Standard - Source macro on a page to get started.</Text>
        </Fragment>
      </Box>
    );
  }

  // Render excerpt list
  return (
    <Box xcss={containerStyle}>
      <Stack space="space.100">
        {sortedExcerpts.map((excerpt) => {
          const category = String(excerpt.category || 'General');
          const isSelected = selectedExcerptForDetails?.id === excerpt.id;

          return (
            <Pressable
              key={excerpt.id}
              onClick={() => {
                console.log('[ExcerptListSidebar] Row clicked for:', excerpt.name);
                setSelectedExcerptForDetails(excerpt);
              }}
              xcss={excerptItemStyle(isSelected)}
            >
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Text><Strong>{excerpt.name}</Strong></Text>
                <Lozenge isBold>{category}</Lozenge>
              </Inline>
            </Pressable>
          );
        })}
      </Stack>
    </Box>
  );
}
