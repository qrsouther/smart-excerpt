/**
 * StalenessCheckIndicator Component
 *
 * Displays a subtle indicator in the top-right corner of an Embed showing:
 * - "Checking..." with spinner while staleness check is running
 * - Small green "Review" button when update is available
 * - Nothing when up-to-date or before check starts
 *
 * This provides transparency about background staleness checking without
 * the jarring experience of a sudden banner appearing.
 *
 * @param {Object} props
 * @param {boolean} props.isCheckingStaleness - Whether staleness check is currently running
 * @param {boolean} props.isStale - Whether Source content has changed since last sync
 * @param {Function} props.onReviewClick - Handler when user clicks "Review" button
 * @returns {JSX.Element|null} - Indicator JSX or null if nothing to show
 */

import React from 'react';
import { Text, Button, Box, Inline, xcss } from '@forge/react';

// Subtle indicator styles - top-right corner, 8px font, light gray
const indicatorContainerStyle = xcss({
  position: 'absolute',
  top: 'space.050',
  right: 'space.100',
  zIndex: '10'
});

const checkingTextStyle = xcss({
  fontSize: '8px',
  color: '#6B778C', // Light gray
  fontFamily: 'monospace'
});

const spinnerStyle = xcss({
  fontSize: '8px',
  marginLeft: 'space.050'
});

export function StalenessCheckIndicator({
  isCheckingStaleness,
  isStale,
  onReviewClick
}) {
  // Don't show anything until check starts or completes with staleness
  if (!isCheckingStaleness && !isStale) {
    return null;
  }

  // Show "Checking..." with spinner while check is running
  if (isCheckingStaleness) {
    return (
      <Box xcss={indicatorContainerStyle}>
        <Inline space="space.050" alignBlock="center">
          <Text xcss={checkingTextStyle}>Checking for Source updates...</Text>
          <Text xcss={spinnerStyle}>⟳</Text>
        </Inline>
      </Box>
    );
  }

  // Show small green "Review" button when stale (check complete)
  if (isStale) {
    return (
      <Box xcss={indicatorContainerStyle}>
        <Button
          appearance="primary"
          spacing="compact"
          onClick={onReviewClick}
        >
          Review Update
        </Button>
      </Box>
    );
  }

  return null;
}
