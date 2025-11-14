/**
 * Scroll Fade Indicator Component
 *
 * Displays a visual indicator on the right edge of a scrollable container
 * to hint that there's more content to scroll horizontally.
 * Uses a chevron icon as a more reliable visual hint than gradients.
 *
 * @returns {JSX.Element} - Scroll indicator JSX
 */

import React from 'react';
import { Box, Icon, xcss } from '@forge/react';

// Indicator container style - positioned on the right edge
// Positioned below the table header, in the middle of the table body area
// Note: transform must be in inline styles as xcss doesn't support it
const indicatorContainerStyle = xcss({
  position: 'absolute',
  top: '60px', // Position below table header (typical header height ~40-50px)
  right: 'space.100',
  zIndex: 10,
  pointerEvents: 'none', // Allow clicks to pass through
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
});

// Icon wrapper with background for visibility
const iconWrapperStyle = xcss({
  backgroundColor: 'color.background.neutral.subtle',
  borderRadius: 'border.radius',
  padding: 'space.050',
  boxShadow: 'elevation.shadow.raised',
  opacity: 0.7 // Subtle but visible
});

export function ScrollFadeIndicator() {
  return (
    <Box
      xcss={indicatorContainerStyle}
      style={{
        // No transform needed - positioned at fixed offset from top
      }}
    >
      <Box xcss={iconWrapperStyle}>
        <Icon glyph="chevron-right" label="Scroll right for more content" size="medium" />
      </Box>
    </Box>
  );
}

