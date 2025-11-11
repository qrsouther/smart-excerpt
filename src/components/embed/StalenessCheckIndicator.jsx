/**
 * StalenessCheckIndicator Component
 *
 * Displays a subtle indicator in the top-right corner of an Embed showing:
 * - "Checking..." with spinner while staleness check is running
 * - Small green "Review" button when update is available
 * - Nothing when up-to-date, before check starts, or after banner is shown
 *
 * This provides transparency about background staleness checking without
 * the jarring experience of a sudden banner appearing.
 *
 * @param {Object} props
 * @param {boolean} props.isCheckingStaleness - Whether staleness check is currently running
 * @param {boolean} props.isStale - Whether Source content has changed since last sync
 * @param {boolean} props.showUpdateBanner - Whether the update banner is currently visible
 * @param {Function} props.onReviewClick - Handler when user clicks "Review" button
 * @returns {JSX.Element|null} - Indicator JSX or null if nothing to show
 */

import React from 'react';
import { Text, Pressable, Box, Inline, Icon, xcss } from '@forge/react';

// Outer wrapper - positioned at top with margins matching border wrapper padding
const indicatorWrapperStyle = xcss({
  position: 'absolute',
  top: 'space.050',
  left: '0',
  right: '0',
  zIndex: '10',
  paddingInlineEnd: 'space.200', // Match border wrapper's padding (16px)
  paddingInlineStart: 'space.200' // Match border wrapper's padding (16px)
});

const Style = xcss({
  color: 'background.accent.gray.subtler', // Light gray design token
  fontStyle: 'italic'
});

const spinnerStyle = xcss({
  marginLeft: 'space.050'
});

// Box wrapper with light green background to match SectionMessage success appearance
const reviewBoxStyle = xcss({
  backgroundColor: 'color.background.success', // Light green matching #EFFFD6
  boxShadow: 'elevation.shadow.raised',
  borderRadius: 'border.radius',
  paddingBlock: 'space.075',
  paddingInline: 'space.100',
  display: 'inline-block',
  marginBottom: 'space.100'  // Space between button and DocumentationLinks
});

// Transparent Pressable that inherits parent styling
const transparentPressableStyle = xcss({
  backgroundColor: 'transparent'
});

export function StalenessCheckIndicator({
  isCheckingStaleness,
  isStale,
  showUpdateBanner,
  onReviewClick
}) {
  // Don't show anything until check starts or completes with staleness
  // Also hide if banner is already showing (button has served its purpose)
  if ((!isCheckingStaleness && !isStale) || showUpdateBanner) {
    return null;
  }

  // Show "Checking..." with spinner while check is running
  if (isCheckingStaleness) {
    return (
      <Box xcss={indicatorWrapperStyle}>
        <Inline spread="space-between" alignBlock="center">
          <Box></Box>
          <Inline space="space.050" alignBlock="center" xcss={xcss({paddingInlineEnd: 'space.100', marginBottom: 'space.100'})}>
            <Text weight="extra-light" size="small" xcss={Style}>Checking for Source updates...</Text>
            <Text weight="extra-light" size="small" xcss={spinnerStyle}>⟳</Text>
          </Inline>
        </Inline>
      </Box>
    );
  }

  // Show small green "Review" button when stale (check complete)
  if (isStale) {
    return (
      <Box xcss={indicatorWrapperStyle}>
        <Inline spread="space-between" alignBlock="center">
          <Box></Box>
          <Box xcss={reviewBoxStyle}>
            <Pressable onClick={onReviewClick} xcss={transparentPressableStyle}>
              <Inline space="space.050" alignBlock="center">
                <Icon glyph="arrow-up" label="" />
                <Text weight="medium">Review Update</Text>
              </Inline>
            </Pressable>
          </Box>
        </Inline>
      </Box>
    );
  }

  return null;
}
