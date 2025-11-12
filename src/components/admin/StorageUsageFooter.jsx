/**
 * StorageUsageFooter Component
 *
 * Displays current Forge storage usage at the bottom of the Admin page.
 * Shows usage in MB, percentage of 250MB limit, Sources count, and Embeds count.
 *
 * @param {Object} props
 * @param {number} props.totalMB - Total storage used in MB
 * @param {number} props.limitMB - Storage limit in MB (250)
 * @param {number} props.percentUsed - Percentage of limit used
 * @param {number} props.sourcesCount - Total number of Sources
 * @param {number} props.embedsCount - Total number of Embeds
 * @param {boolean} props.isLoading - Whether storage usage is being calculated
 * @param {string|null} props.error - Error message if calculation failed
 * @returns {JSX.Element}
 */

import React from 'react';
import {
  Box,
  Inline,
  Code,
  xcss
} from '@forge/react';

// Footer styling with full width, thin top border, and light gray background
// No padding to make it truly edge-to-edge
const footerStyles = xcss({
  width: '100%',
  paddingBlock: 'space.100',
  paddingInlineEnd: 'space.100',
  borderTopWidth: 'border.width',
  borderTopStyle: 'solid',
  borderTopColor: 'color.border',
  backgroundColor: 'color.background.neutral',
  marginBlockStart: 'space.300'
});

export function StorageUsageFooter({
  totalMB,
  limitMB,
  percentUsed,
  sourcesCount,
  embedsCount,
  isLoading,
  error
}) {
  // Don't render anything while loading
  if (isLoading) {
    return null;
  }

  // Don't render if there's an error
  if (error) {
    return null;
  }

  // Don't render if data isn't available yet
  if (!totalMB || !limitMB || percentUsed === undefined || sourcesCount === undefined || embedsCount === undefined) {
    return null;
  }

  return (
    <Box xcss={footerStyles}>
      <Inline space="space.050" alignBlock="center" alignInline="end">
        <Code>Storage Usage: {totalMB} MB / {limitMB} MB ({percentUsed}%)    •    {sourcesCount} Sources    •    {embedsCount} Embeds</Code>
      </Inline>
    </Box>
  );
}
